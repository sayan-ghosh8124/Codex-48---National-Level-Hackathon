from backend.app import app

from __future__ import annotations

import os
import json
import time
import uuid
import webbrowser
import subprocess
from pathlib import Path
from threading import Timer
from typing import Any, Dict, Optional

import pandas as pd
import numpy as np
from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from werkzeug.utils import secure_filename
import io

try:
    # Preferred when running: python -m backend.app
    from backend.automl import run_automl
except Exception:  # pragma: no cover
    # Fallback when running: python backend/app.py
    from automl import run_automl

try:
    from backend.brandguard import brandguard_bp
except Exception:  # pragma: no cover
    from brandguard import brandguard_bp


_here = Path(__file__).resolve().parent
if (_here / "frontend").is_dir():
    ROOT = _here
elif (_here.parent / "frontend").is_dir():
    ROOT = _here.parent
else:
    ROOT = _here
UPLOADS_DIR = ROOT / "uploads"
MODELS_DIR = ROOT / "models"
FRONTEND_DIR = ROOT / "frontend" if (ROOT / "frontend").is_dir() else ROOT

ALLOWED_EXTS = {".csv", ".xlsx", ".xls"}


def _ensure_dirs() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def _read_csv_with_encoding(file_stream) -> pd.DataFrame:
    """Read CSV with multiple encoding fallback support."""
    encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252', 'utf-16']
    
    # Read the stream content
    content = file_stream.read()
    if isinstance(content, bytes):
        pass  # Already bytes
    else:
        # If it's a string (shouldn't happen with read_csv), encode it
        content = content.encode('utf-8')
    
    for encoding in encodings:
        try:
            df = pd.read_csv(io.BytesIO(content), encoding=encoding)
            return df
        except (UnicodeDecodeError, pd.errors.EmptyDataError):
            continue
        except Exception:
            continue
    
    # If all encodings fail, try with errors='replace' on utf-8
    try:
        df = pd.read_csv(io.BytesIO(content), encoding='utf-8', errors='replace')
        return df
    except Exception as e:
        raise ValueError(f"Could not read CSV file with any encoding: {e}")


def _allowed(filename: str) -> bool:
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTS


def _run_paths(run_id: str) -> Dict[str, Path]:
    return {
        "run": MODELS_DIR / f"{run_id}.run.json",
        "status": MODELS_DIR / f"{run_id}.status.json",
        "log": MODELS_DIR / f"{run_id}.log.txt",
        "meta": MODELS_DIR / f"{run_id}.meta.json",
        "model": MODELS_DIR / f"{run_id}.joblib",
    }


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _append_log(path: Path, line: str) -> None:
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] {line}\n")


app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app)
app.secret_key = 'super-secret-nova-key'
app.register_blueprint(brandguard_bp)


@app.get("/")
def index():
    return send_from_directory(str(FRONTEND_DIR), "loading.html")


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/api/analyze")
def analyze_dataset():
    _ensure_dirs()

    if "file" not in request.files:
        return jsonify({"error": "Missing file field"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "No file selected"}), 400
    if not _allowed(f.filename):
        return jsonify({"error": "Unsupported file type. Upload CSV or Excel."}), 400

    try:
        # Read file into pandas
        ext = Path(f.filename).suffix.lower()
        if ext in [".csv"]:
            df = _read_csv_with_encoding(f.stream)
        elif ext in [".xlsx", ".xls"]:
            df = pd.read_excel(io.BytesIO(f.read()))
        else:
            return jsonify({"error": "Unsupported file type"}), 400

        # Calculate statistics
        num_rows = len(df)
        num_cols = df.shape[1]
        duplicate_rows = df.duplicated().sum()

        # Missing values per column
        missing_values = {}
        for col in df.columns:
            missing_count = df[col].isna().sum()
            missing_pct = (missing_count / num_rows * 100) if num_rows > 0 else 0
            missing_values[col] = {
                "count": int(missing_count),
                "percentage": round(float(missing_pct), 2)
            }

        # Data types
        data_types = {}
        for col in df.columns:
            dtype = str(df[col].dtype)
            # Simplify dtype names
            if "int" in dtype:
                simplified = "integer"
            elif "float" in dtype:
                simplified = "float"
            elif "bool" in dtype:
                simplified = "boolean"
            elif "datetime" in dtype:
                simplified = "datetime"
            else:
                simplified = "string/object"
            data_types[col] = simplified

        # Column statistics
        column_stats = []
        for col in df.columns:
            stats = {
                "column": col,
                "type": data_types[col],
                "missing_count": missing_values[col]["count"],
                "missing_percentage": missing_values[col]["percentage"],
                "unique_values": int(df[col].nunique()),
            }

            # Add numeric stats if applicable
            if pd.api.types.is_numeric_dtype(df[col]):
                stats["min"] = float(df[col].min()) if not df[col].isna().all() else None
                stats["max"] = float(df[col].max()) if not df[col].isna().all() else None
                stats["mean"] = float(df[col].mean()) if not df[col].isna().all() else None
            else:
                # For categorical, show top value
                mode_val = df[col].mode()
                stats["most_common"] = str(mode_val[0]) if len(mode_val) > 0 else None
                stats["most_common_count"] = int(df[col].value_counts().iloc[0]) if len(df[col].value_counts()) > 0 else 0

            column_stats.append(stats)

        return jsonify({
            "filename": f.filename,
            "num_rows": num_rows,
            "num_columns": num_cols,
            "duplicate_rows": int(duplicate_rows),
            "memory_usage_mb": round(df.memory_usage(deep=True).sum() / 1024 / 1024, 2),
            "column_stats": column_stats,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.post("/api/clean-recommend")
def clean_recommend():
    _ensure_dirs()

    if "file" not in request.files:
        return jsonify({"error": "Missing file field"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "No file selected"}), 400
    if not _allowed(f.filename):
        return jsonify({"error": "Unsupported file type. Upload CSV or Excel."}), 400

    try:
        # Read file into pandas
        ext = Path(f.filename).suffix.lower()
        if ext in [".csv"]:
            df = _read_csv_with_encoding(f.stream)
        elif ext in [".xlsx", ".xls"]:
            df = pd.read_excel(io.BytesIO(f.read()))
        else:
            return jsonify({"error": "Unsupported file type"}), 400

        original_shape = df.shape
        recommendations = []
        cleaning_log = []
        safe_warnings = []
        
        # Risk Meter Calculation
        total_cells = df.shape[0] * df.shape[1]
        missing_cells = df.isna().sum().sum()
        duplicate_rows = df.duplicated().sum()
        
        # Calculate risk score (0-100, higher is riskier)
        missing_risk = (missing_cells / total_cells * 100) if total_cells > 0 else 0
        duplicate_risk = (duplicate_rows / df.shape[0] * 100) if df.shape[0] > 0 else 0
        
        # Risk categories
        risk_score = min(100, (missing_risk * 0.6 + duplicate_risk * 0.4))
        
        if risk_score < 20:
            risk_level = "LOW"
            risk_color = "green"
        elif risk_score < 50:
            risk_level = "MEDIUM"
            risk_color = "orange"
        else:
            risk_level = "HIGH"
            risk_color = "red"

        # Recommendation 1: Handle Missing Values
        for col in df.columns:
            missing_count = int(df[col].isna().sum())  # Convert to native Python int
            if missing_count > 0:
                missing_pct = (missing_count / len(df)) * 100
                col_type = df[col].dtype
                
                if pd.api.types.is_numeric_dtype(df[col]):
                    if missing_pct < 5:
                        action = "drop_rows"
                        impact = f"Remove {missing_count} rows with missing values"
                    else:
                        action = "fill_median"
                        median_val = float(df[col].median()) if pd.notna(df[col].median()) else 0
                        impact = f"Fill {missing_count} missing values with median ({median_val:.2f})"
                else:
                    if missing_pct < 10:
                        action = "fill_mode"
                        mode_val = df[col].mode()
                        mode_str = str(mode_val.iloc[0]) if len(mode_val) > 0 else "Unknown"
                        impact = f"Fill {missing_count} missing values with mode ('{mode_str}')"
                    else:
                        action = "drop_column"
                        impact = f"Consider dropping column '{col}' ({missing_pct:.1f}% missing)"
                        safe_warnings.append(f"Column '{col}' has {missing_pct:.1f}% missing values")
                
                recommendations.append({
                    "type": "missing_values",
                    "column": col,
                    "severity": "high" if missing_pct > 20 else "medium" if missing_pct > 5 else "low",
                    "action": action,
                    "count": missing_count,
                    "percentage": round(missing_pct, 2),
                    "impact": impact,
                    "safe": missing_pct < 30  # Safe if less than 30% missing
                })
                
                cleaning_log.append(f"[{col}] {missing_count} missing values ({missing_pct:.1f}%) - {action}")

        # Recommendation 2: Handle Duplicates
        duplicate_rows = int(df.duplicated().sum())  # Convert to native Python int
        if duplicate_rows > 0:
            duplicate_pct = (duplicate_rows / len(df)) * 100
            recommendations.append({
                "type": "duplicates",
                "column": "all",
                "severity": "high" if duplicate_pct > 10 else "medium" if duplicate_pct > 5 else "low",
                "action": "drop_duplicates",
                "count": duplicate_rows,
                "percentage": round(duplicate_pct, 2),
                "impact": f"Remove {duplicate_rows} duplicate rows ({duplicate_pct:.1f}% of data)",
                "safe": duplicate_pct < 20
            })
            cleaning_log.append(f"[DUPLICATES] {duplicate_rows} duplicate rows found ({duplicate_pct:.1f}%)")
            
            if duplicate_pct > 20:
                safe_warnings.append(f"High duplicate ratio ({duplicate_pct:.1f}%) - review before cleaning")

        # Recommendation 3: Detect Outliers (numeric columns only)
        for col in df.select_dtypes(include=[np.number]).columns:
            if df[col].notna().sum() > 10:  # Need enough data points
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR
                
                outliers = df[(df[col] < lower_bound) | (df[col] > upper_bound)][col]
                outlier_count = len(outliers)
                
                if outlier_count > 0:
                    outlier_pct = (outlier_count / len(df)) * 100
                    recommendations.append({
                        "type": "outliers",
                        "column": col,
                        "severity": "medium" if outlier_pct > 5 else "low",
                        "action": "remove_outliers",
                        "count": int(outlier_count),
                        "percentage": round(outlier_pct, 2),
                        "impact": f"{outlier_count} potential outliers in '{col}' (IQR method)",
                        "bounds": {
                            "lower": round(lower_bound, 2),
                            "upper": round(upper_bound, 2)
                        },
                        "safe": outlier_pct < 10
                    })
                    cleaning_log.append(f"[OUTLIERS] {col}: {outlier_count} outliers detected")

        # Recommendation 4: Constant/Empty Columns
        for col in df.columns:
            if df[col].nunique(dropna=False) <= 1:
                recommendations.append({
                    "type": "constant_column",
                    "column": col,
                    "severity": "low",
                    "action": "drop_column",
                    "count": 0,
                    "percentage": 0,
                    "impact": f"Column '{col}' has only one unique value - consider dropping",
                    "safe": True
                })
                cleaning_log.append(f"[CONSTANT] Column '{col}' has only one unique value")

        # Recommendation 5: Global null value removal option
        total_missing_rows = int(df.isna().any(axis=1).sum())
        if total_missing_rows > 0:
            missing_rows_pct = float((total_missing_rows / len(df)) * 100)
            recommendations.append({
                "type": "missing_values_global",
                "column": "all",
                "severity": "high" if missing_rows_pct > 20 else "medium" if missing_rows_pct > 10 else "low",
                "action": "drop_null_rows",
                "count": total_missing_rows,
                "percentage": round(missing_rows_pct, 2),
                "impact": f"Delete {total_missing_rows} rows containing ANY null values ({missing_rows_pct:.1f}% of data)",
                "safe": missing_rows_pct < 30
            })
            cleaning_log.append(f"[GLOBAL NULLS] {total_missing_rows} rows have at least one null value ({missing_rows_pct:.1f}%)")
            
            # Recommendation 6: Global null value fill option (alternative to deletion)
            total_missing_cells = int(df.isna().sum().sum())
            if total_missing_cells > 0:
                recommendations.append({
                    "type": "missing_values_global_fill",
                    "column": "all",
                    "severity": "low",
                    "action": "fill_all_nulls",
                    "count": total_missing_cells,
                    "percentage": round(missing_rows_pct, 2),
                    "impact": f"Fill ALL {total_missing_cells} missing values using median (numeric) / mode (text) - keeps all rows",
                    "safe": True
                })
                cleaning_log.append(f"[GLOBAL FILL] {total_missing_cells} total missing values can be filled")

        # Cleaning Impact Preview
        impact_preview = {
            "original_rows": original_shape[0],
            "original_columns": original_shape[1],
            "rows_after_missing_cleanup": original_shape[0],
            "rows_after_duplicate_cleanup": original_shape[0] - duplicate_rows,
            "estimated_final_rows": original_shape[0] - duplicate_rows,
            "data_loss_percentage": round((duplicate_rows / original_shape[0]) * 100, 2) if original_shape[0] > 0 else 0
        }

        return jsonify({
            "filename": f.filename,
            "risk_meter": {
                "score": round(risk_score, 1),
                "level": risk_level,
                "color": risk_color,
                "missing_percentage": round(missing_risk, 2),
                "duplicate_percentage": round(duplicate_risk, 2)
            },
            "recommendations": recommendations,
            "impact_preview": impact_preview,
            "cleaning_log": cleaning_log,
            "safe_warnings": safe_warnings,
            "total_issues": len(recommendations)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.post("/api/upload")
def upload_and_train():
    _ensure_dirs()

    if "file" not in request.files:
        return jsonify({"error": "Missing file field"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "No file selected"}), 400
    if not _allowed(f.filename):
        return jsonify({"error": "Unsupported file type. Upload CSV or Excel."}), 400

    target_hint: Optional[str] = request.form.get("target") or None

    filename = secure_filename(f.filename)
    dataset_path = UPLOADS_DIR / filename
    f.save(str(dataset_path))

    run_id = uuid.uuid4().hex
    p = _run_paths(run_id)
    _write_json(
        p["run"],
        {
            "run_id": run_id,
            "dataset_path": str(dataset_path),
            "original_filename": filename,
            "target_hint": target_hint,
            "created_at": time.time(),
        },
    )
    _write_json(p["status"], {"run_id": run_id, "status": "running"})
    _append_log(p["log"], f"Run created. file={filename} target_hint={target_hint or ''}".strip())

    try:
        result = run_automl(
            dataset_path=str(dataset_path),
            models_dir=str(MODELS_DIR),
            target_hint=target_hint,
            run_id=run_id,
            log_fn=lambda msg: _append_log(p["log"], msg),
        )
    except Exception as e:
        _write_json(p["status"], {"run_id": run_id, "status": "failed", "error": str(e)})
        _append_log(p["log"], f"FAILED: {e}")
        return jsonify({"error": str(e)}), 400

    _write_json(p["status"], {"run_id": run_id, "status": "succeeded"})
    _append_log(p["log"], "SUCCEEDED")

    return jsonify(
        {
            "run_id": result.run_id,
            "task": result.task,
            "target": result.target,
            "features": result.features,
            "best_model_name": result.best_model_name,
            "metrics": result.metrics,
        }
    )


@app.get("/api/models/<run_id>/download")
def download_model(run_id: str):
    model_path = MODELS_DIR / f"{run_id}.joblib"
    if not model_path.exists():
        return jsonify({"error": "Model not found"}), 404
    return send_from_directory(str(MODELS_DIR), model_path.name, as_attachment=True, download_name=f"model_{run_id}.pkl")


@app.get("/api/models/<run_id>/leaderboard")
def get_model_leaderboard(run_id: str):
    meta_path = MODELS_DIR / f"{run_id}.meta.json"
    if not meta_path.exists():
        return jsonify({"error": "Model not found"}), 404
    meta = _read_json(meta_path)
    return jsonify({
        "run_id": run_id,
        "task": meta.get("task"),
        "target": meta.get("target"),
        "best_model_name": meta.get("best_model_name"),
        "leaderboard": meta.get("leaderboard", []),
    })


@app.get("/api/models/<run_id>/meta")
def get_model_meta(run_id: str):
    meta_path = MODELS_DIR / f"{run_id}.meta.json"
    if not meta_path.exists():
        return jsonify({"error": "Model not found"}), 404
    return send_from_directory(str(MODELS_DIR), meta_path.name)


@app.get("/api/runs/<run_id>")
def get_run(run_id: str):
    _ensure_dirs()
    p = _run_paths(run_id)
    run_exists = p["run"].exists()
    meta_exists = p["meta"].exists()
    model_exists = p["model"].exists()

    if not run_exists:
        # Older runs may have `meta.json` / `joblib` but not the debug run record files yet.
        if meta_exists:
            return jsonify(
                {
                    "run": None,
                    "status": {
                        "run_id": run_id,
                        "status": "unknown",
                        "error": "Run record not found (created before Run ID debugger). Please re-run AutoML to generate run.json/status/logs.",
                    },
                    "artifacts": {"meta": True, "model": model_exists},
                }
            )
        return jsonify({"error": "Run not found"}), 404

    run = _read_json(p["run"])
    status = _read_json(p["status"]) if p["status"].exists() else {"run_id": run_id, "status": "unknown"}
    return jsonify(
        {
            "run": run,
            "status": status,
            "artifacts": {"meta": meta_exists, "model": model_exists},
        }
    )


@app.get("/api/runs/<run_id>/logs")
def get_run_logs(run_id: str):
    _ensure_dirs()
    p = _run_paths(run_id)
    if not p["log"].exists():
        # If meta exists but logs don't, this likely means the run was created before log persistence.
        if p["meta"].exists():
            return jsonify({"error": "Logs not found for this Run ID (created before Run ID debugger). Please re-run AutoML."}), 404
        return jsonify({"error": "Logs not found"}), 404
    return send_from_directory(str(MODELS_DIR), p["log"].name)


@app.post("/api/runs/<run_id>/rerun")
def rerun(run_id: str):
    _ensure_dirs()
    p = _run_paths(run_id)
    if not p["run"].exists():
        if p["meta"].exists():
            return jsonify({"error": "Run record missing for this Run ID; please re-run AutoML after uploading the dataset again."}), 400
        return jsonify({"error": "Run not found"}), 404

    run = _read_json(p["run"])
    dataset_path = run.get("dataset_path")
    target_hint = run.get("target_hint")
    if not dataset_path or not os.path.exists(str(dataset_path)):
        return jsonify({"error": "Original dataset file missing for this run"}), 400

    _write_json(p["status"], {"run_id": run_id, "status": "running"})
    _append_log(p["log"], "RERUN requested")
    try:
        result = run_automl(
            dataset_path=str(dataset_path),
            models_dir=str(MODELS_DIR),
            target_hint=target_hint,
            run_id=run_id,
            log_fn=lambda msg: _append_log(p["log"], msg),
        )
    except Exception as e:
        _write_json(p["status"], {"run_id": run_id, "status": "failed", "error": str(e)})
        _append_log(p["log"], f"FAILED: {e}")
        return jsonify({"error": str(e)}), 400

    _write_json(p["status"], {"run_id": run_id, "status": "succeeded"})
    _append_log(p["log"], "SUCCEEDED")
    return jsonify(
        {
            "run_id": result.run_id,
            "task": result.task,
            "target": result.target,
            "features": result.features,
            "best_model_name": result.best_model_name,
            "metrics": result.metrics,
        }
    )


@app.post("/api/clean-apply")
def apply_cleaning_actions():
    _ensure_dirs()

    if "file" not in request.files:
        return jsonify({"error": "Missing file field"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "No file selected"}), 400
    if not _allowed(f.filename):
        return jsonify({"error": "Unsupported file type. Upload CSV or Excel."}), 400

    # Get selected actions from form data
    actions_json = request.form.get("actions", "[]")
    print(f"[BACKEND DEBUG] Received actions JSON: {actions_json}")
    try:
        selected_actions = json.loads(actions_json)
        print(f"[BACKEND DEBUG] Parsed actions count: {len(selected_actions)}")
        for i, action in enumerate(selected_actions):
            print(f"[BACKEND DEBUG] Action {i}: {action}")
    except json.JSONDecodeError as e:
        print(f"[BACKEND DEBUG] JSON decode error: {e}")
        selected_actions = []

    try:
        # Read file into pandas
        ext = Path(f.filename).suffix.lower()
        if ext in [".csv"]:
            df = _read_csv_with_encoding(f.stream)
        elif ext in [".xlsx", ".xls"]:
            df = pd.read_excel(io.BytesIO(f.read()))
        else:
            return jsonify({"error": "Unsupported file type"}), 400

        original_shape = df.shape
        action_log = []
        
        # Apply selected actions
        for action_item in selected_actions:
            action_type = action_item.get("type")
            column = action_item.get("column")
            action = action_item.get("action")
            print(f"[BACKEND DEBUG] Processing action: type={action_type}, column={column}, action={action}")
            
            if action_type == "missing_values":
                if action == "drop_rows":
                    initial_rows = len(df)
                    df = df.dropna(subset=[column])
                    dropped = initial_rows - len(df)
                    action_log.append(f"[DROP ROWS] Dropped {dropped} rows with missing '{column}' values")
                elif action == "fill_median":
                    if pd.api.types.is_numeric_dtype(df[column]):
                        median_val = df[column].median()
                        df[column] = df[column].fillna(median_val)
                        action_log.append(f"[FILL MEDIAN] Filled missing '{column}' with median {median_val:.2f}")
                elif action == "fill_mode":
                    mode_val = df[column].mode()
                    if len(mode_val) > 0:
                        df[column] = df[column].fillna(mode_val.iloc[0])
                        action_log.append(f"[FILL MODE] Filled missing '{column}' with mode '{mode_val.iloc[0]}'")
                elif action == "fill_text":
                    fill_value = action_item.get("fill_value", "Unknown")
                    df[column] = df[column].fillna(fill_value)
                    action_log.append(f"[FILL TEXT] Filled missing '{column}' with '{fill_value}'")
                elif action == "drop_column":
                    df = df.drop(columns=[column])
                    action_log.append(f"[DROP COLUMN] Dropped column '{column}'")
                    
            elif action_type == "duplicates":
                if action == "drop_duplicates":
                    initial_rows = len(df)
                    df = df.drop_duplicates()
                    dropped = initial_rows - len(df)
                    action_log.append(f"[DROP DUPLICATES] Removed {dropped} duplicate rows")
                    
            elif action_type == "missing_values_global":
                if action == "drop_null_rows":
                    initial_rows = len(df)
                    df = df.dropna()  # Drop rows with ANY null values
                    dropped = initial_rows - len(df)
                    action_log.append(f"[DROP NULL ROWS] Deleted {dropped} rows containing any null values")
                    
            elif action_type == "missing_values_global_fill":
                if action == "fill_all_nulls":
                    filled_count = 0
                    for col in df.columns:
                        missing_count = df[col].isna().sum()
                        if missing_count > 0:
                            if pd.api.types.is_numeric_dtype(df[col]):
                                median_val = df[col].median()
                                df[col] = df[col].fillna(median_val)
                                filled_count += missing_count
                            else:
                                mode_val = df[col].mode()
                                if len(mode_val) > 0:
                                    df[col] = df[col].fillna(mode_val.iloc[0])
                                    filled_count += missing_count
                    action_log.append(f"[FILL ALL NULLS] Filled {filled_count} missing values across all columns")
                    
            elif action_type == "constant_column":
                if action == "drop_column":
                    df = df.drop(columns=[column])
                    action_log.append(f"[DROP CONSTANT] Dropped constant column '{column}'")
                    
            elif action_type == "outliers":
                print(f"[BACKEND DEBUG] Handling outliers action for column '{column}'")
                if action == "remove_outliers":
                    # Get bounds from the action item (stored during recommendation)
                    bounds = action_item.get("bounds", {})
                    lower_bound = bounds.get("lower")
                    upper_bound = bounds.get("upper")
                    print(f"[BACKEND DEBUG] Outlier bounds: lower={lower_bound}, upper={upper_bound}")
                    
                    if lower_bound is not None and upper_bound is not None and column in df.columns:
                        initial_rows = len(df)
                        # Remove rows where column value is outside bounds (keep only values within bounds)
                        # Also handle NaN values - keep rows with NaN values (don't drop them as outliers)
                        mask = (df[column].isna()) | ((df[column] >= lower_bound) & (df[column] <= upper_bound))
                        df = df[mask]
                        dropped = initial_rows - len(df)
                        print(f"[BACKEND DEBUG] Removed {dropped} outliers from '{column}'")
                        action_log.append(f"[REMOVE OUTLIERS] Removed {dropped} outliers from '{column}' (bounds: {lower_bound:.2f} - {upper_bound:.2f})")
                    else:
                        print(f"[BACKEND DEBUG] Skipping outlier removal: column={column} exists={column in df.columns}, bounds valid={lower_bound is not None and upper_bound is not None}")
                    
            elif action_type == "manual_drop_column":
                if action == "drop_column":
                    df = df.drop(columns=[column])
                    action_log.append(f"[MANUAL DROP] Dropped column '{column}'")

        final_shape = df.shape
        
        # Save cleaned dataset to a temporary file for download
        run_id = uuid.uuid4().hex
        cleaned_filename = f"cleaned_{run_id}_{secure_filename(f.filename)}"
        cleaned_path = UPLOADS_DIR / cleaned_filename
        
        if ext in [".csv"]:
            df.to_csv(cleaned_path, index=False)
        else:
            df.to_excel(cleaned_path, index=False)

        return jsonify({
            "filename": f.filename,
            "cleaned_filename": cleaned_filename,
            "download_url": f"/api/download-cleaned/{cleaned_filename}",
            "original_shape": original_shape,
            "final_shape": final_shape,
            "rows_removed": original_shape[0] - final_shape[0],
            "columns_removed": original_shape[1] - final_shape[1],
            "actions_applied": len(action_log),
            "action_log": action_log,
            "success": True
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.get("/api/download-cleaned/<filename>")
def download_cleaned(filename: str):
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404
    return send_from_directory(str(UPLOADS_DIR), filename, as_attachment=True)


@app.post("/api/relationship-dashboard")
def relationship_dashboard():
    """Generate dashboard visualizations based on joined relationship data."""
    _ensure_dirs()
    
    # Get files
    if "file1" not in request.files or "file2" not in request.files:
        return jsonify({"error": "Missing file1 or file2"}), 400
    
    f1 = request.files["file1"]
    f2 = request.files["file2"]
    
    if not f1.filename or not f2.filename:
        return jsonify({"error": "Both files required"}), 400
    
    # Get relationships JSON
    relationships_json = request.form.get("relationships", "[]")
    try:
        relationships = json.loads(relationships_json)
    except json.JSONDecodeError:
        relationships = []
    
    try:
        # Read both datasets
        ext1 = Path(f1.filename).suffix.lower()
        ext2 = Path(f2.filename).suffix.lower()
        
        if ext1 in [".csv"]:
            df1 = _read_csv_with_encoding(f1.stream)
        else:
            df1 = pd.read_excel(io.BytesIO(f1.read()))
            
        if ext2 in [".csv"]:
            df2 = _read_csv_with_encoding(f2.stream)
        else:
            df2 = pd.read_excel(io.BytesIO(f2.read()))
        
        # Apply relationships to join data
        joined_data = None
        join_info = []
        
        for rel in relationships:
            source_col = rel.get("source", {}).get("column")
            target_col = rel.get("target", {}).get("column")
            rel_type = rel.get("type", "one-to-many")
            
            if source_col and target_col:
                if source_col in df1.columns and target_col in df2.columns:
                    # Create copies and convert both columns to string to handle type mismatches
                    df1_copy = df1.copy()
                    df2_copy = df2.copy()
                    
                    # Convert to string, handling NaN values properly
                    df1_copy[source_col] = df1_copy[source_col].apply(lambda x: str(x) if pd.notna(x) else '')
                    df2_copy[target_col] = df2_copy[target_col].apply(lambda x: str(x) if pd.notna(x) else '')
                    
                    # Perform merge based on relationship type
                    if rel_type == "one-to-one":
                        how = "inner"
                    elif rel_type == "one-to-many":
                        how = "left"
                    else:  # many-to-many
                        how = "outer"
                    
                    try:
                        merged = pd.merge(
                            df1_copy, df2_copy,
                            left_on=source_col,
                            right_on=target_col,
                            how=how,
                            suffixes=('_t1', '_t2')
                        )
                        
                        if len(merged) > 0:
                            joined_data = merged
                            join_info.append({
                                "source_column": source_col,
                                "target_column": target_col,
                                "type": rel_type,
                                "joined_rows": len(merged)
                            })
                    except Exception as merge_err:
                        # If merge fails, log it but continue with other relationships
                        join_info.append({
                            "source_column": source_col,
                            "target_column": target_col,
                            "type": rel_type,
                            "error": str(merge_err),
                            "joined_rows": 0
                        })
        
        # If no successful joins, use concatenated data
        if joined_data is None or len(joined_data) == 0:
            # Generate separate visualizations for each table
            visualizations = []
            
            # Table 1 visualizations
            if len(df1.columns) >= 2:
                # Bar chart for first categorical vs first numeric
                cat_cols1 = df1.select_dtypes(include=['object']).columns.tolist()
                num_cols1 = df1.select_dtypes(include=[np.number]).columns.tolist()
                
                if cat_cols1 and num_cols1:
                    visualizations.append({
                        "type": "bar",
                        "title": f"Table 1: {cat_cols1[0]} vs {num_cols1[0]}",
                        "data": df1.groupby(cat_cols1[0])[num_cols1[0]].mean().head(10).to_dict()
                    })
            
            # Table 2 visualizations
            if len(df2.columns) >= 2:
                cat_cols2 = df2.select_dtypes(include=['object']).columns.tolist()
                num_cols2 = df2.select_dtypes(include=[np.number]).columns.tolist()
                
                if cat_cols2 and num_cols2:
                    visualizations.append({
                        "type": "bar",
                        "title": f"Table 2: {cat_cols2[0]} vs {num_cols2[0]}",
                        "data": df2.groupby(cat_cols2[0])[num_cols2[0]].mean().head(10).to_dict()
                    })
            
            return jsonify({
                "visualizations": visualizations,
                "joined": False,
                "message": "No relationships defined - showing separate table views"
            })
        
        # Generate visualizations from joined data
        visualizations = []
        
        # Identify column types in joined data
        cat_cols = joined_data.select_dtypes(include=['object']).columns.tolist()
        num_cols = joined_data.select_dtypes(include=[np.number]).columns.tolist()
        
        # 1. Distribution of numeric column (if available)
        if num_cols:
            visualizations.append({
                "type": "histogram",
                "title": f"Distribution: {num_cols[0]}",
                "column": num_cols[0],
                "bins": 10,
                "data": joined_data[num_cols[0]].dropna().tolist()[:100]
            })
        
        # 2. Bar chart: categorical vs numeric
        if cat_cols and num_cols:
            for cat in cat_cols[:2]:  # First 2 categorical
                for num in num_cols[:2]:  # First 2 numeric
                    agg_data = joined_data.groupby(cat)[num].agg(['mean', 'count']).reset_index()
                    agg_data = agg_data[agg_data['count'] > 0].head(10)
                    
                    if len(agg_data) > 0:
                        visualizations.append({
                            "type": "bar",
                            "title": f"{cat} vs avg {num}",
                            "category_col": cat,
                            "value_col": num,
                            "labels": agg_data[cat].tolist(),
                            "values": agg_data['mean'].tolist()
                        })
        
        # 3. Pie chart for categorical distribution
        if cat_cols:
            for cat in cat_cols[:2]:
                value_counts = joined_data[cat].value_counts().head(8)
                if len(value_counts) > 1:
                    visualizations.append({
                        "type": "pie",
                        "title": f"Distribution: {cat}",
                        "labels": value_counts.index.tolist(),
                        "values": value_counts.values.tolist()
                    })
        
        # 4. Scatter plot if 2+ numeric columns
        if len(num_cols) >= 2:
            sample_data = joined_data[[num_cols[0], num_cols[1]]].dropna().head(50)
            if len(sample_data) > 10:
                visualizations.append({
                    "type": "scatter",
                    "title": f"{num_cols[0]} vs {num_cols[1]}",
                    "x_col": num_cols[0],
                    "y_col": num_cols[1],
                    "x_data": sample_data[num_cols[0]].tolist(),
                    "y_data": sample_data[num_cols[1]].tolist()
                })
        
        return jsonify({
            "visualizations": visualizations,
            "joined": True,
            "join_info": join_info,
            "total_rows": len(joined_data),
            "columns": joined_data.columns.tolist()
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    _ensure_dirs()
    port = int(os.environ.get("PORT", "5000"))
    # Avoid Flask reloader spawning multiple processes (can confuse Run ID debugging).
    debug = os.environ.get("DEBUG", "0") == "1"
    url = f"http://127.0.0.1:{port}"

    def _open_browser() -> None:
        try:
            chrome_paths = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                str(Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "Application" / "chrome.exe"),
            ]

            # Prefer launching Chrome directly if executable is present
            for chrome_path in chrome_paths:
                try:
                    if chrome_path and Path(chrome_path).exists():
                        subprocess.Popen([str(chrome_path), url], shell=False)
                        return
                except Exception:
                    continue

            # If chrome is on PATH, try that
            try:
                subprocess.Popen(["chrome", url], shell=False)
                return
            except Exception:
                pass

            # Fallback: use Windows `start` to open default browser
            try:
                subprocess.Popen(["cmd", "/c", "start", "", url], shell=False)
                return
            except Exception:
                pass

            # Final fallback: webbrowser/os.startfile
            try:
                webbrowser.open_new_tab(url)
            except Exception:
                try:
                    os.startfile(url)
                except Exception:
                    pass
        except Exception:
            try:
                os.startfile(url)
            except Exception:
                pass

    Timer(1.0, _open_browser).start()
    app.run(host="127.0.0.1", port=port, debug=debug, use_reloader=False)

