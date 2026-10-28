from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .checks import run_deterministic_checks
from .db import fetch_facts, fetch_rules
from .llm import review_with_llm
from .verifier import extract_promotional_claims, match_claims_to_facts, verify_findings

CACHE: Dict[str, Dict[str, Any]] = {}


def _severity_rank(severity: str) -> int:
    """Map finding severities to a simple numeric rank for conflict resolution."""
    ranking = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    return ranking.get(str(severity).lower(), 0)


def _overlaps(left: Dict[str, Any], right: Dict[str, Any]) -> bool:
    """Check whether two findings overlap in the source content."""
    left_start = int(left.get("span_start", 0) or 0)
    left_end = int(left.get("span_end", 0) or 0)
    right_start = int(right.get("span_start", 0) or 0)
    right_end = int(right.get("span_end", 0) or 0)
    return max(left_start, right_start) <= min(left_end, right_end)


def _merge_findings(findings: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Combine overlapping findings while keeping the strongest available evidence."""
    ordered = sorted(findings, key=lambda item: (int(item.get("span_start", 0) or 0), int(item.get("span_end", 0) or 0)))
    merged: List[Dict[str, Any]] = []
    for finding in ordered:
        if not merged:
            merged.append(dict(finding))
            continue
        last = merged[-1]
        if _overlaps(last, finding):
            if _severity_rank(finding.get("severity", "low")) > _severity_rank(last.get("severity", "low")):
                last.update(dict(finding))
            else:
                if len(str(finding.get("text", ""))) > len(str(last.get("text", ""))):
                    last["text"] = finding.get("text", last.get("text"))
                    last["explanation"] = finding.get("explanation", last.get("explanation"))
                    last["suggestion"] = finding.get("suggestion", last.get("suggestion"))
            last["span_end"] = max(int(last.get("span_end", 0) or 0), int(finding.get("span_end", 0) or 0))
            last["span_start"] = min(int(last.get("span_start", 0) or 0), int(finding.get("span_start", 0) or 0))
        else:
            merged.append(dict(finding))
    return merged


def _cache_key(content: str, guideline_version: str) -> str:
    """Create a deterministic cache key for an identical review request."""
    payload = json.dumps({"content": content, "guideline_version": guideline_version}, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def review_content(content: str, deterministic_only: bool = False, guideline_version: str = "v1") -> Dict[str, Any]:
    """Run deterministic checks first, then optionally invoke Claude, merging and deduplicating overlap."""
    key = _cache_key(content, guideline_version)
    if key in CACHE:
        return CACHE[key]

    rules = fetch_rules()
    facts = fetch_facts()
    deterministic_findings = run_deterministic_checks(content)

    if deterministic_only:
        result = {
            "findings": deterministic_findings,
            "used_ai": False,
            "notice": "Deterministic-only mode enabled. AI review skipped.",
            "deterministic_only": True,
        }
        CACHE[key] = result
        return result

    notice = ""
    ai_findings: List[Dict[str, Any]] = []
    ai_payload: Dict[str, Any] = {"findings": [], "promotional_claims": [], "notice": ""}
    try:
        ai_payload = review_with_llm(content, rules=rules, facts=facts)
        ai_findings = verify_findings(ai_payload.get("findings", []))
    except Exception as exc:  # pragma: no cover - network or client failure
        notice = f"AI review unavailable: {exc}. Deterministic results were returned."
        ai_findings = []

    claims = extract_promotional_claims(content)
    matched_claims = match_claims_to_facts(claims, facts)
    merged_findings = _merge_findings(deterministic_findings + ai_findings)

    result = {
        "findings": merged_findings,
        "used_ai": bool(ai_findings),
        "notice": notice if notice else (ai_payload.get("notice") or "AI review completed."),
        "deterministic_only": False,
        "promotional_claims": matched_claims,
    }

    CACHE[key] = result
    return result
