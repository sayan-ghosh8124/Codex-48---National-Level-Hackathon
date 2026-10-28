from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.feature_selection import SelectKBest, f_regression
from sklearn.decomposition import  PCA

from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor

import io

try:
    from xgboost import XGBClassifier, XGBRegressor

    _HAS_XGBOOST = True
except Exception:
    XGBClassifier = None  # type: ignore[assignment]
    XGBRegressor = None  # type: ignore[assignment]
    _HAS_XGBOOST = False


TaskType = Literal["classification", "regression"]


@dataclass(frozen=True)
class AutoMLResult:
    run_id: str
    task: TaskType
    target: str
    features: List[str]
    best_model_name: str
    metrics: Dict[str, Any]
    model_path: str
    artifact_path: str


def _safe_mkdir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _read_csv_with_encoding(dataset_path: str) -> pd.DataFrame:
    """Read CSV with multiple encoding fallback support."""
    encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252', 'utf-16']
    
    for encoding in encodings:
        try:
            df = pd.read_csv(dataset_path, encoding=encoding)
            return df
        except (UnicodeDecodeError, pd.errors.EmptyDataError):
            continue
        except Exception:
            continue
    
    # If all encodings fail, try with errors='replace' on utf-8
    try:
        df = pd.read_csv(dataset_path, encoding='utf-8', errors='replace')
        return df
    except Exception as e:
        raise ValueError(f"Could not read CSV file with any encoding: {e}")


def _infer_target(df: pd.DataFrame, target_hint: Optional[str] = None) -> str:
    if target_hint and target_hint in df.columns:
        return target_hint

    # Heuristic: prefer columns that look like labels (few uniques),
    # but fall back to last column if ambiguous.
    candidates: List[Tuple[str, float]] = []
    n = len(df)
    for col in df.columns:
        s = df[col]
        if s.isna().all():
            continue
        nunique = s.nunique(dropna=True)
        if nunique <= 1:
            continue
        # Score: fewer unique values => more label-like.
        # Penalize very high cardinality (likely ID/text) and ultra-low with tiny datasets.
        frac_unique = nunique / max(n, 1)
        score = (1.0 - min(frac_unique, 1.0)) + (1.0 / (1.0 + nunique))
        candidates.append((col, score))

    if not candidates:
        return df.columns[-1]

    candidates.sort(key=lambda t: t[1], reverse=True)
    return candidates[0][0]


def _infer_task(y: pd.Series) -> TaskType:
    y_non_null = y.dropna()
    if y_non_null.empty:
        return "regression"

    if pd.api.types.is_numeric_dtype(y_non_null):
        nunique = y_non_null.nunique(dropna=True)
        # Numeric but few unique values -> likely classification labels
        if nunique <= max(20, int(0.05 * len(y_non_null))):
            return "classification"
        return "regression"

    return "classification"


def _build_preprocessor_with_selection(X: pd.DataFrame, y: pd.Series, task: str = "regression") -> Pipeline:
    num_cols = [c for c in X.columns if pd.api.types.is_numeric_dtype(X[c])]
    cat_cols = [c for c in X.columns if c not in num_cols]
    
    numeric = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    
    categorical = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric, num_cols),
            ("cat", categorical, cat_cols),
        ],
        remainder="drop",
    )
    
    # Add feature selection for regression
    if task == "regression":
        # Select top 50% of features based on f_regression
        selector = SelectKBest(score_func=f_regression, k=min(50, max(10, X.shape[1] // 2)))
        return Pipeline([("preprocessor", preprocessor), ("selector", selector)])
    
    return Pipeline([("preprocessor", preprocessor)])


def _classification_models(random_state: int) -> List[Tuple[str, Any]]:
    models: List[Tuple[str, Any]] = [
        (
            "LogisticRegression",
            LogisticRegression(
                max_iter=500,
                n_jobs=-1,
                class_weight="balanced",
                solver="lbfgs",
                penalty="l2",
                C=1.0,
                tol=1e-3,
            ),
        ),
        (
            "RandomForest",
            RandomForestClassifier(
                n_estimators=100,
                max_depth=12,
                min_samples_split=5,
                min_samples_leaf=2,
                max_features="sqrt",
                bootstrap=True,
                random_state=random_state,
                n_jobs=-1,
                class_weight="balanced",
            ),
        ),
    ]

    if _HAS_XGBOOST:
        models.append(
            (
                "XGBoost",
                XGBClassifier(
                    n_estimators=100,
                    max_depth=6,
                    learning_rate=0.1,
                    subsample=0.8,
                    colsample_bytree=0.8,
                    random_state=random_state,
                    n_jobs=-1,
                ),
            )
        )

    return models


def _regression_models(random_state: int) -> List[Tuple[str, Any]]:
    models: List[Tuple[str, Any]] = [
        (
            "RandomForest",
            RandomForestRegressor(
                n_estimators=100,
                max_depth=12,
                min_samples_split=5,
                min_samples_leaf=2,
                max_features="sqrt",
                bootstrap=True,
                random_state=random_state,
                n_jobs=-1,
            ),
        ),
    ]

    if _HAS_XGBOOST:
        models.append(
            (
                "XGBoost",
                XGBRegressor(
                    n_estimators=100,
                    max_depth=6,
                    learning_rate=0.1,
                    subsample=0.8,
                    colsample_bytree=0.8,
                    colsample_bylevel=0.8,
                    reg_alpha=0.1,
                    reg_lambda=1.0,
                    gamma=0,
                    min_child_weight=3,
                    random_state=random_state,
                    n_jobs=-1,
                ),
            )
        )

    return models


def _classification_metrics(y_true: np.ndarray, y_pred: np.ndarray, y_proba: Optional[np.ndarray]) -> Dict[str, Any]:
    metrics: Dict[str, Any] = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro")),
    }
    # AUC only if binary and probabilities available
    try:
        classes = np.unique(y_true)
        if y_proba is not None and len(classes) == 2:
            # proba for positive class
            if y_proba.ndim == 2 and y_proba.shape[1] >= 2:
                pos = y_proba[:, 1]
            else:
                pos = y_proba
            metrics["roc_auc"] = float(roc_auc_score(y_true, pos))
    except Exception:
        pass
    return metrics


def _regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
    # Some sklearn versions don't support `squared=` in mean_squared_error.
    # RMSE = sqrt(MSE) keeps the behavior consistent across versions.
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    return {
        "rmse": rmse,
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": float(r2_score(y_true, y_pred)),
    }


def _score_for_selection(task: TaskType, metrics: Dict[str, Any]) -> float:
    if task == "classification":
        # Prefer AUC when available, otherwise f1_macro
        if "roc_auc" in metrics:
            return float(metrics["roc_auc"])
        return float(metrics["f1_macro"])
    # Regression: lower RMSE is better
    return -float(metrics["rmse"])


def run_automl(
    dataset_path: str,
    models_dir: str,
    *,
    target_hint: Optional[str] = None,
    run_id: Optional[str] = None,
    log_fn: Optional[Callable[[str], None]] = None,
    test_size: float = 0.15,
    random_state: int = 42,
    max_rows: Optional[int] = 200_000,
) -> AutoMLResult:
    _safe_mkdir(models_dir)
    if log_fn:
        log_fn("Starting AutoML")

    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    ext = os.path.splitext(dataset_path)[1].lower()
    if ext in [".csv"]:
        df = _read_csv_with_encoding(dataset_path)
    elif ext in [".xlsx", ".xls"]:
        df = pd.read_excel(dataset_path)
    else:
        raise ValueError("Unsupported file type. Upload a CSV or Excel file.")
    if log_fn:
        log_fn(f"Loaded dataset: rows={len(df)}, cols={df.shape[1]}")

    df = df.copy()
    df = df.dropna(axis=1, how="all")
    df = df.drop_duplicates()
    if max_rows and len(df) > max_rows:
        df = df.sample(n=max_rows, random_state=random_state)

    if df.shape[1] < 2:
        raise ValueError("Dataset needs at least 2 columns (features + target).")

    target = _infer_target(df, target_hint=target_hint)
    if target not in df.columns:
        raise ValueError("Target column not found in dataset.")

    y = df[target]
    X = df.drop(columns=[target])
    if log_fn:
        log_fn(f"Detected target: {target}")

    # Drop obviously unhelpful columns (all null or constant)
    drop_cols = []
    for c in X.columns:
        s = X[c]
        if s.isna().all():
            drop_cols.append(c)
            continue
        if s.nunique(dropna=True) <= 1:
            drop_cols.append(c)
    if drop_cols:
        X = X.drop(columns=drop_cols)

    if X.shape[1] == 0:
        raise ValueError("No usable feature columns found after cleaning.")

    task = _infer_task(y)
    if log_fn:
        log_fn(f"Detected task: {task}")
    
    # Remove extreme outliers from target for regression (IQR method)
    if task == "regression":
        y_numeric = pd.to_numeric(y, errors='coerce')
        Q1 = y_numeric.quantile(0.25)
        Q3 = y_numeric.quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 3.0 * IQR  # Use 3*IQR for less aggressive filtering
        upper_bound = Q3 + 3.0 * IQR
        mask = (y_numeric >= lower_bound) & (y_numeric <= upper_bound)
        outlier_count = (~mask).sum()
        if outlier_count > 0:
            if log_fn:
                log_fn(f"Removed {outlier_count} outliers from target (IQR method)")
            X = X[mask]
            y = y[mask]

    # For classification, encode labels to stable ints
    label_mapping: Optional[Dict[str, int]] = None
    y_for_split = y
    if task == "classification":
        y_for_split = y.astype("string").fillna("<<MISSING>>")
        classes = sorted(y_for_split.unique().tolist())
        label_mapping = {c: i for i, c in enumerate(classes)}
        y_enc = y_for_split.map(label_mapping).astype(int)
        y_for_split = y_enc

    stratify = None
    if task == "classification" and pd.Series(y_for_split).nunique() > 1:
        # Only stratify if every class has at least 2 samples, otherwise sklearn raises.
        vc_min = pd.Series(y_for_split).value_counts().min()
        stratify = y_for_split if int(vc_min) >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y_for_split,
        test_size=test_size,
        random_state=random_state,
        stratify=stratify,
    )

    pre = _build_preprocessor_with_selection(X_train, y_train, task)
    candidates = _classification_models(random_state) if task == "classification" else _regression_models(random_state)
    if log_fn:
        log_fn(f"Candidate models: {[name for name, _ in candidates]}")

    leaderboard: List[Dict[str, Any]] = []
    best: Optional[Tuple[str, Any, Dict[str, Any], float]] = None

    for name, model in candidates:
        if log_fn:
            log_fn(f"Training: {name}")
        try:
            pipe = Pipeline([("pre", pre)])
            if hasattr(model, 'fit'):
                # For models that need the full pipeline
                pipe.steps.append(("model", model))
            t0 = time.time()
            pipe.fit(X_train, y_train)
            fit_s = time.time() - t0

            y_pred = pipe.predict(X_test)
            y_proba = None
            if task == "classification":
                if hasattr(pipe, "predict_proba"):
                    try:
                        y_proba = pipe.predict_proba(X_test)
                    except Exception:
                        y_proba = None
                metrics = _classification_metrics(np.asarray(y_test), np.asarray(y_pred), y_proba)
            else:
                metrics = _regression_metrics(np.asarray(y_test), np.asarray(y_pred))

            score = _score_for_selection(task, metrics)
            
            # Calculate confidence score (0-100) based on metrics
            if task == "classification":
                if "roc_auc" in metrics:
                    confidence = round(metrics["roc_auc"] * 100, 2)
                else:
                    confidence = round(metrics.get("f1_macro", 0) * 100, 2)
            else:  # regression
                # Use R² for confidence (0-1 scale), or fallback to normalized score
                r2 = metrics.get("r2", 0)
                if r2 < 0:
                    confidence = round(max(0, 50 + r2 * 50), 2)  # Scale negative R2 to 0-50
                else:
                    confidence = round(r2 * 100, 2)
            
            row = {
                "name": name,
                "fit_seconds": float(fit_s),
                "metrics": metrics,
                "selection_score": float(score),
                "confidence_score": confidence,
            }
            leaderboard.append(row)
            if log_fn:
                log_fn(f"Finished: {name} metrics={metrics}")

            if best is None or score > best[3]:
                best = (name, pipe, metrics, score)
        except Exception as e:
            if log_fn:
                log_fn(f"Failed: {name} error={e}")
            # Add failed model to leaderboard with empty metrics
            leaderboard.append({
                "name": name,
                "fit_seconds": 0.0,
                "metrics": {},
                "selection_score": -9999.0 if task == "classification" else 9999.0,
                "error": str(e),
            })

    assert best is not None
    best_name, best_pipe, best_metrics, _ = best
    if log_fn:
        log_fn(f"Best model: {best_name}")

    run_id_final = run_id or uuid.uuid4().hex
    model_path = os.path.join(models_dir, f"{run_id_final}.joblib")
    artifact_path = os.path.join(models_dir, f"{run_id_final}.meta.json")

    artifact = {
        "run_id": run_id_final,
        "task": task,
        "target": target,
        "features": X.columns.tolist(),
        "dropped_features": drop_cols,
        "best_model_name": best_name,
        "metrics": best_metrics,
        "leaderboard": leaderboard,
        "label_mapping": label_mapping,
    }

    joblib.dump({"pipeline": best_pipe, "artifact": artifact}, model_path)
    with open(artifact_path, "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2)
    if log_fn:
        log_fn(f"Saved: {model_path}")

    return AutoMLResult(
        run_id=run_id_final,
        task=task,
        target=target,
        features=X.columns.tolist(),
        best_model_name=best_name,
        metrics=best_metrics,
        model_path=model_path,
        artifact_path=artifact_path,
    )

