from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .db import fetch_facts, fetch_rules


def _valid_source_ids() -> set[str]:
    """Return all approved rule and fact identifiers from the database."""
    ids: set[str] = set()
    for rule in fetch_rules():
        if rule.get("id"):
            ids.add(str(rule["id"]))
    for fact in fetch_facts():
        if fact.get("id"):
            ids.add(str(fact["id"]))
    return ids


def verify_findings(findings: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Validate source IDs and downgrade source-less findings without inventing a source."""
    valid_ids = _valid_source_ids()
    verified: List[Dict[str, Any]] = []
    for finding in findings:
        cleaned = dict(finding)
        source_id = str(cleaned.get("source_id") or "").strip()
        if source_id and source_id not in valid_ids:
            cleaned["source_type"] = "none"
            cleaned["confidence"] = "low"
            explanation = str(cleaned.get("explanation") or "")
            cleaned["explanation"] = f"No approved source found. {explanation}".strip()
        verified.append(cleaned)
    return verified


def extract_promotional_claims(content: str) -> List[Dict[str, Any]]:
    """Identify likely promotional claims in the content while preserving exact original wording."""
    patterns = [
        r"\bguarantees?\b",
        r"\brisk[- ]?free\b",
        r"\b100%\b",
        r"\bbest(?:\s+in\s+class)?\b",
        r"\bup\s+to\b",
        r"\d{1,3}%",
    ]
    claims: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for pattern in patterns:
        for match in re.finditer(pattern, content, flags=re.IGNORECASE):
            claim = match.group(0)
            key = claim.lower()
            if key in seen:
                continue
            seen.add(key)
            claims.append({"claim": claim, "matched_fact_id": None, "needs_review": True})
    return claims


def match_claims_to_facts(claims: Sequence[Dict[str, Any]], facts: Optional[Sequence[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """Match suspicious promotional claims to approved facts and flag unmatched claims for human review."""
    if facts is None:
        facts = fetch_facts()
    matched: List[Dict[str, Any]] = []
    for claim in claims:
        claim_text = str(claim.get("claim", "")).lower()
        best_fact = None
        best_score = 0.0
        for fact in facts:
            statement = str(fact.get("statement", "")).lower()
            value = str(fact.get("value", "")).lower()
            score = 0.0
            if claim_text in statement:
                score += 2.0
            if claim_text in value:
                score += 2.0
            if any(word in statement for word in claim_text.split() if len(word) > 3):
                score += 1.0
            if score > best_score:
                best_score = score
                best_fact = fact
        item = dict(claim)
        if best_fact and best_score > 0:
            item["matched_fact_id"] = best_fact.get("id")
            item["needs_review"] = False
        else:
            item["matched_fact_id"] = None
            item["needs_review"] = True
        matched.append(item)
    return matched
