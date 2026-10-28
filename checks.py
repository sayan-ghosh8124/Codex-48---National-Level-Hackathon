from __future__ import annotations

import math
import re
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from .db import fetch_facts, fetch_rules, fetch_terms

CLAIM_PATTERNS = [
    (r"guarantees?", "guaranteed", "claims"),
    (r"risk[- ]?free", "risk-free", "claims"),
    (r"100%", "100%", "claims"),
    (r"best(?:\s+in\s+class)?", "best", "messaging"),
    (r"game\s+changer", "game changer", "messaging"),
    (r"revolutionary|effortless|instant\s+launch|zero\s+setup|no[- ]brainer", "hype phrase", "messaging"),
    (r"up\s+to", "up to", "claims"),
    (r"\d{1,3}%", "percentage", "claims"),
]


def _normalize(text: str) -> str:
    """Collapse punctuation and lowercase input for comparison."""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _whole_word_regex(term: str) -> re.Pattern[str]:
    """Build a whole-word regex that is safe for plain text term matching."""
    normalized = _normalize(term)
    phrase_pattern = r"\s+".join(re.escape(part) for part in normalized.split())
    return re.compile(rf"(?<![a-z0-9]){phrase_pattern}(?![a-z0-9])")


def _token_sequence(text: str) -> List[str]:
    """Return individual normalized words from text."""
    return [token for token in re.findall(r"[A-Za-z0-9]+", _normalize(text)) if token]


def _near_match(term: str, candidate: str, threshold: float = 0.9) -> bool:
    """Check whether a term resembles another using a fuzzy similarity threshold."""
    if not term or not candidate:
        return False
    return SequenceMatcher(None, _normalize(term), _normalize(candidate)).ratio() >= threshold


def _make_finding(
    *,
    finding_id: str,
    text: str,
    category: str,
    severity: str,
    confidence: str,
    source_type: str,
    source_id: str,
    explanation: str,
    suggestion: str,
    span_start: int,
    span_end: int,
) -> Dict[str, Any]:
    """Create a normalized finding object with deterministic metadata."""
    return {
        "id": finding_id,
        "span_start": span_start,
        "span_end": span_end,
        "text": text,
        "category": category,
        "severity": severity,
        "confidence": confidence,
        "source_type": source_type,
        "source_id": source_id,
        "explanation": explanation,
        "suggestion": suggestion,
    }


def _count_syllables(word: str) -> int:
    """Estimate syllable count for a word using a lightweight rule-based heuristic."""
    word = word.lower()
    if len(word) <= 3:
        return 1
    word = re.sub(r"[^a-z]", "", word)
    if not word:
        return 0
    vowels = "aeiouy"
    count = 0
    prev_was_vowel = False
    for char in word:
        is_vowel = char in vowels
        if is_vowel and not prev_was_vowel:
            count += 1
        prev_was_vowel = is_vowel
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def _reading_grade(text: str) -> float:
    """Return a rough Flesch-Kincaid grade estimate for content readability."""
    if not text.strip():
        return 0.0
    words = re.findall(r"\b\w+\b", text)
    if not words:
        return 0.0
    sentences = re.split(r"[.!?]+", text)
    sentence_count = max(1, sum(1 for sentence in sentences if sentence.strip()))
    syllables = sum(_count_syllables(word) for word in words)
    return 0.39 * (len(words) / sentence_count) + 11.8 * (syllables / len(words)) - 15.59


def _find_term_matches(content: str, term: Dict[str, Any]) -> List[Tuple[int, int, str, str]]:
    """Find exact or near-match banned words in content and return their spans."""
    matches: List[Tuple[int, int, str, str]] = []
    normalized_content = _normalize(content)
    banned_terms = term.get("banned", [])
    for banned in banned_terms:
        normalized_banned = _normalize(banned)
        if not normalized_banned:
            continue

        pattern = _whole_word_regex(banned)
        for match in pattern.finditer(content):
            matches.append((match.start(), match.end(), banned, term.get("preferred", "")))

        phrase_parts = "\\s+".join(re.escape(part) for part in normalized_banned.split())
        phrase_pattern = re.compile(rf"(?<![a-z0-9]){phrase_parts}(?![a-z0-9])", re.IGNORECASE)
        for match in phrase_pattern.finditer(content):
            matches.append((match.start(), match.end(), banned, term.get("preferred", "")))

        banned_tokens = _token_sequence(banned)
        if len(banned_tokens) == 0:
            continue
        for candidate in re.finditer(r"[A-Za-z0-9][A-Za-z0-9' -]{0,50}", content):
            candidate_text = candidate.group(0)
            if _near_match(normalized_banned, _normalize(candidate_text), threshold=0.82):
                matches.append((candidate.start(), candidate.end(), banned, term.get("preferred", "")))
    return matches


def _term_rule_results(content: str, terms: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Scan content using preferred/banned terminology guidance."""
    findings: List[Dict[str, Any]] = []
    for index, term in enumerate(terms):
        rule_id = term.get("rule_id", "R1")
        seen: set[Tuple[int, int, str]] = set()
        for start, end, banned_value, preferred_value in _find_term_matches(content, term):
            key = (start, end, banned_value)
            if key in seen:
                continue
            seen.add(key)
            phrase = content[start:end]
            findings.append(
                _make_finding(
                    finding_id=f"det-term-{index + 1}-{len(findings) + 1}",
                    text=phrase,
                    category="messaging",
                    severity="medium",
                    confidence="medium",
                    source_type="rule",
                    source_id=rule_id,
                    explanation=f"The phrase '{banned_value}' conflicts with the approved terminology: prefer '{preferred_value}'.",
                    suggestion=f"Use '{preferred_value}' instead of '{banned_value}' while keeping the same intent.",
                    span_start=start,
                    span_end=end,
                )
            )
    return findings


def _claim_results(content: str, rules: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Scan content for exaggerated or unsupported claim patterns."""
    findings: List[Dict[str, Any]] = []
    for index, pattern in enumerate(CLAIM_PATTERNS):
        pattern_text, label, category = pattern
        regex = re.compile(pattern_text, re.IGNORECASE)
        for match in regex.finditer(content):
            phrase = match.group(0)
            rule = next((rule for rule in rules if rule.get("category") == category), None)
            rule_id = rule.get("id", "R2") if rule else "R2"
            severity = "high" if any(keyword in phrase.lower() for keyword in ["guaranteed", "risk-free", "100%", "best in class"]) else "medium"
            findings.append(
                _make_finding(
                    finding_id=f"det-claim-{index + 1}-{len(findings) + 1}",
                    text=phrase,
                    category=category,
                    severity=severity,
                    confidence="medium",
                    source_type="rule",
                    source_id=rule_id,
                    explanation=f"This wording appears to be a promotional claim, but the approved guidelines require evidence and a clear factual basis.",
                    suggestion="Keep the creator's point, but replace the highest-impact claim with a verifiable outcome or a more precise statement.",
                    span_start=match.start(),
                    span_end=match.end(),
                )
            )
    return findings


def _stale_fact_results(content: str, facts: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Flag stale facts that are present in the content or conflict with current approved guidance."""
    findings: List[Dict[str, Any]] = []
    for index, fact in enumerate(facts):
        review_by = fact.get("review_by")
        if not review_by:
            continue
        try:
            import datetime as dt
            review_date = dt.datetime.fromisoformat(review_by)
            stale = dt.datetime.now() > review_date
        except ValueError:
            stale = False
        if not stale:
            continue
        statement = fact.get("statement", "")
        text = statement.lower()
        if text and text in content.lower():
            findings.append(
                _make_finding(
                    finding_id=f"det-fact-{index + 1}-{len(findings) + 1}",
                    text=statement,
                    category="claims",
                    severity="high",
                    confidence="high",
                    source_type="fact",
                    source_id=fact.get("id", "F0"),
                    explanation=f"This fact is stale and should not be used in publication because the review date expired on {review_by}.",
                    suggestion="Replace the stale claim with a currently approved fact or remove the assertion until it is re-reviewed.",
                    span_start=content.lower().find(text),
                    span_end=content.lower().find(text) + len(text),
                )
            )
    return findings


def _readability_result(content: str) -> Optional[Dict[str, Any]]:
    """Return a readability warning when the text is too dense for clear public messaging."""
    grade = _reading_grade(content)
    if grade <= 11.0:
        return None
    return _make_finding(
        finding_id="det-readability-1",
        text="Readability check",
        category="accessibility",
        severity="medium",
        confidence="medium",
        source_type="rule",
        source_id="R14",
        explanation=f"This content reads at roughly a grade {grade:.1f} level, which exceeds the preferred readability target for public-facing messaging.",
        suggestion="Break long sentences into shorter clauses and add a clear heading to help readers scan the content.",
        span_start=0,
        span_end=min(len(content), 80),
    )


def run_deterministic_checks(content: str) -> List[Dict[str, Any]]:
    """Run the deterministic brand governance checks over provided text content."""
    if not content or not content.strip():
        return []
    rules = fetch_rules()
    facts = fetch_facts()
    terms = fetch_terms()
    findings: List[Dict[str, Any]] = []
    findings.extend(_term_rule_results(content, terms))
    findings.extend(_claim_results(content, rules))
    findings.extend(_stale_fact_results(content, facts))
    readability = _readability_result(content)
    if readability is not None:
        findings.append(readability)
    return findings
