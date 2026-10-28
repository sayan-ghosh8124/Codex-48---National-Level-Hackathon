from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "brandguard.db"
SEED_DIR = BASE_DIR / "seed"


def _connect() -> sqlite3.Connection:
    """Create a connection to the BrandGuard SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _read_seed(kind: str) -> List[Dict[str, Any]]:
    """Read the seeded JSON documents for BrandGuard knowledge objects."""
    path = SEED_DIR / f"{kind}.json"
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, list) else []


def _is_fact_stale(fact: Dict[str, Any]) -> bool:
    """Return True when a fact is past its review_by date."""
    review_by = fact.get("review_by")
    if not review_by:
        return False
    try:
        review_at = datetime.fromisoformat(str(review_by)).astimezone(timezone.utc)
    except ValueError:
        try:
            review_at = datetime.strptime(str(review_by), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return False
    return datetime.now(timezone.utc) > review_at


def init_db() -> None:
    """Create schema and seed BrandGuard reference data if the database is empty."""
    conn = _connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rules (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                text TEXT NOT NULL,
                source_passage TEXT NOT NULL,
                owner TEXT NOT NULL,
                effective_date TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS facts (
                id TEXT PRIMARY KEY,
                statement TEXT NOT NULL,
                value TEXT NOT NULL,
                source TEXT NOT NULL,
                review_by TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS terms (
                id TEXT PRIMARY KEY,
                preferred TEXT NOT NULL,
                banned TEXT NOT NULL,
                note TEXT NOT NULL,
                rule_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS contents (
                id TEXT PRIMARY KEY,
                title TEXT,
                body TEXT NOT NULL,
                channel TEXT NOT NULL,
                creator TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                deterministic_only INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS content_versions (
                id TEXT PRIMARY KEY,
                content_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                body TEXT NOT NULL,
                diff TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS findings (
                id TEXT PRIMARY KEY,
                content_id TEXT NOT NULL,
                version_id TEXT,
                span_start INTEGER,
                span_end INTEGER,
                text TEXT,
                category TEXT,
                severity TEXT,
                confidence TEXT,
                source_type TEXT,
                source_id TEXT,
                explanation TEXT,
                suggestion TEXT,
                dismissed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                content_id TEXT NOT NULL,
                author TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY,
                content_id TEXT NOT NULL,
                reviewer TEXT NOT NULL,
                decision TEXT NOT NULL,
                note TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                details TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        existing_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if existing_users == 0:
            conn.executemany(
                "INSERT OR REPLACE INTO users (id, name, email, role, is_active) VALUES (?, ?, ?, ?, ?)",
                [
                    ("creator", "Ava Creator", "ava@lumio.ai", "creator", 1),
                    ("manager", "Milo Manager", "milo@lumio.ai", "manager", 1),
                    ("reviewer", "Rina Reviewer", "rina@lumio.ai", "reviewer", 1),
                    ("admin", "Omar Admin", "omar@lumio.ai", "admin", 1),
                ],
            )

        rule_count = conn.execute("SELECT COUNT(*) FROM rules").fetchone()[0]
        if rule_count == 0:
            for rule in _read_seed("rules"):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO rules (id, category, text, source_passage, owner, effective_date)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rule["id"],
                        rule["category"],
                        rule["text"],
                        rule["source_passage"],
                        rule["owner"],
                        rule["effective_date"],
                    ),
                )

        fact_count = conn.execute("SELECT COUNT(*) FROM facts").fetchone()[0]
        if fact_count == 0:
            for fact in _read_seed("facts"):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO facts (id, statement, value, source, review_by)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        fact["id"],
                        fact["statement"],
                        fact["value"],
                        fact["source"],
                        fact["review_by"],
                    ),
                )

        term_count = conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
        if term_count == 0:
            for term in _read_seed("terms"):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO terms (id, preferred, banned, note, rule_id)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        term["id"],
                        term["preferred"],
                        json.dumps(term.get("banned", [])),
                        term["note"],
                        term["rule_id"],
                    ),
                )

        conn.commit()
    finally:
        conn.close()


def fetch_rules() -> List[Dict[str, Any]]:
    """Return all governance rules."""
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM rules ORDER BY id").fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def fetch_facts() -> List[Dict[str, Any]]:
    """Return all approved facts, including stale status."""
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM facts ORDER BY id").fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["stale"] = _is_fact_stale(item)
            results.append(item)
        return results
    finally:
        conn.close()


def fetch_terms() -> List[Dict[str, Any]]:
    """Return all terminology guidance entries."""
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM terms ORDER BY id").fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["banned"] = json.loads(item.get("banned") or "[]")
            results.append(item)
        return results
    finally:
        conn.close()


def upsert_rule(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add or update a rule record."""
    conn = _connect()
    try:
        item = {
            "id": payload["id"],
            "category": payload.get("category", "messaging"),
            "text": payload["text"],
            "source_passage": payload.get("source_passage", "Internal policy"),
            "owner": payload.get("owner", "brand-team"),
            "effective_date": payload.get("effective_date", "2025-01-01"),
        }
        conn.execute(
            """
            INSERT INTO rules (id, category, text, source_passage, owner, effective_date, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                category = excluded.category,
                text = excluded.text,
                source_passage = excluded.source_passage,
                owner = excluded.owner,
                effective_date = excluded.effective_date,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                item["id"],
                item["category"],
                item["text"],
                item["source_passage"],
                item["owner"],
                item["effective_date"],
            ),
        )
        conn.commit()
        return item
    finally:
        conn.close()


def update_rule(rule_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a rule by id."""
    conn = _connect()
    try:
        existing = conn.execute("SELECT * FROM rules WHERE id = ?", (rule_id,)).fetchone()
        if existing is None:
            return None
        item = dict(existing)
        for key in ("category", "text", "source_passage", "owner", "effective_date"):
            if key in payload:
                item[key] = payload[key]
        conn.execute(
            """
            UPDATE rules SET category = ?, text = ?, source_passage = ?, owner = ?, effective_date = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (item["category"], item["text"], item["source_passage"], item["owner"], item["effective_date"], rule_id),
        )
        conn.commit()
        return item
    finally:
        conn.close()


def upsert_fact(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add or update a fact record."""
    conn = _connect()
    try:
        item = {
            "id": payload["id"],
            "statement": payload["statement"],
            "value": payload.get("value", "true"),
            "source": payload.get("source", "brand-team"),
            "review_by": payload.get("review_by", "2026-12-31"),
        }
        conn.execute(
            """
            INSERT INTO facts (id, statement, value, source, review_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                statement = excluded.statement,
                value = excluded.value,
                source = excluded.source,
                review_by = excluded.review_by,
                updated_at = CURRENT_TIMESTAMP
            """,
            (item["id"], item["statement"], item["value"], item["source"], item["review_by"]),
        )
        conn.commit()
        return item
    finally:
        conn.close()


def update_fact(fact_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a fact by id."""
    conn = _connect()
    try:
        existing = conn.execute("SELECT * FROM facts WHERE id = ?", (fact_id,)).fetchone()
        if existing is None:
            return None
        item = dict(existing)
        for key in ("statement", "value", "source", "review_by"):
            if key in payload:
                item[key] = payload[key]
        conn.execute(
            """
            UPDATE facts SET statement = ?, value = ?, source = ?, review_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (item["statement"], item["value"], item["source"], item["review_by"], fact_id),
        )
        conn.commit()
        return item
    finally:
        conn.close()


def upsert_term(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add or update a terminology entry."""
    conn = _connect()
    try:
        item = {
            "id": payload.get("id", f"T{len(fetch_terms()) + 1:02d}"),
            "preferred": payload["preferred"],
            "banned": payload.get("banned", []),
            "note": payload.get("note", ""),
            "rule_id": payload.get("rule_id", "R1"),
        }
        conn.execute(
            """
            INSERT INTO terms (id, preferred, banned, note, rule_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                preferred = excluded.preferred,
                banned = excluded.banned,
                note = excluded.note,
                rule_id = excluded.rule_id,
                updated_at = CURRENT_TIMESTAMP
            """,
            (item["id"], item["preferred"], json.dumps(item["banned"]), item["note"], item["rule_id"]),
        )
        conn.commit()
        return item
    finally:
        conn.close()


def update_term(term_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a terminology rule by id."""
    conn = _connect()
    try:
        existing = conn.execute("SELECT * FROM terms WHERE id = ?", (term_id,)).fetchone()
        if existing is None:
            return None
        item = dict(existing)
        if "preferred" in payload:
            item["preferred"] = payload["preferred"]
        if "banned" in payload:
            item["banned"] = json.dumps(payload["banned"])
        if "note" in payload:
            item["note"] = payload["note"]
        if "rule_id" in payload:
            item["rule_id"] = payload["rule_id"]
        conn.execute(
            """
            UPDATE terms SET preferred = ?, banned = ?, note = ?, rule_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (item["preferred"], item["banned"], item["note"], item["rule_id"], term_id),
        )
        conn.commit()
        return {
            "id": term_id,
            "preferred": item["preferred"],
            "banned": json.loads(item["banned"] or "[]"),
            "note": item["note"],
            "rule_id": item["rule_id"],
        }
    finally:
        conn.close()


def create_content(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new BrandGuard content record and initial version."""
    conn = _connect()
    try:
        content_id = str(payload.get("id") or uuid.uuid4())
        body = payload.get("body", "")
        channel = payload.get("channel", "social")
        creator = payload.get("creator", "creator")
        deterministic_only = int(bool(payload.get("deterministic_only")))
        conn.execute(
            """
            INSERT INTO contents (id, title, body, channel, creator, status, deterministic_only)
            VALUES (?, ?, ?, ?, ?, 'draft', ?)
            """,
            (content_id, payload.get("title"), body, channel, creator, deterministic_only),
        )
        version_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO content_versions (id, content_id, version_number, body, diff)
            VALUES (?, ?, 1, ?, '')
            """,
            (version_id, content_id, body),
        )
        conn.commit()
        return {"id": content_id, "version_id": version_id, "body": body, "status": "draft"}
    finally:
        conn.close()


def update_content_version(content_id: str, body: str, diff: str = "") -> Dict[str, Any]:
    """Add a new version for a content item and track the diff."""
    conn = _connect()
    try:
        version_number = conn.execute(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM content_versions WHERE content_id = ?",
            (content_id,),
        ).fetchone()[0]
        version_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO content_versions (id, content_id, version_number, body, diff)
            VALUES (?, ?, ?, ?, ?)
            """,
            (version_id, content_id, version_number, body, diff),
        )
        conn.execute(
            "UPDATE contents SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (body, content_id),
        )
        conn.commit()
        return {"id": content_id, "version_id": version_id, "version_number": version_number, "body": body, "diff": diff}
    finally:
        conn.close()


def get_content(content_id: str) -> Optional[Dict[str, Any]]:
    """Return a full content record and its versions."""
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM contents WHERE id = ?", (content_id,)).fetchone()
        if row is None:
            return None
        versions = conn.execute(
            "SELECT * FROM content_versions WHERE content_id = ? ORDER BY version_number ASC",
            (content_id,),
        ).fetchall()
        payload = dict(row)
        payload["versions"] = [dict(item) for item in versions]
        return payload
    finally:
        conn.close()


def add_finding(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Store a finding for a content item with a unique database identifier."""
    conn = _connect()
    try:
        finding_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO findings (
                id, content_id, version_id, span_start, span_end, text, category, severity, confidence,
                source_type, source_id, explanation, suggestion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                finding_id,
                payload.get("content_id"),
                payload.get("version_id"),
                payload.get("span_start"),
                payload.get("span_end"),
                payload.get("text"),
                payload.get("category"),
                payload.get("severity"),
                payload.get("confidence"),
                payload.get("source_type"),
                payload.get("source_id"),
                payload.get("explanation"),
                payload.get("suggestion"),
            ),
        )
        conn.commit()
        return {"id": finding_id}
    finally:
        conn.close()


def add_comment(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add a reviewer or manager comment to content."""
    conn = _connect()
    try:
        comment_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO comments (id, content_id, author, body)
            VALUES (?, ?, ?, ?)
            """,
            (comment_id, payload.get("content_id"), payload.get("author", "reviewer"), payload.get("body", "")),
        )
        conn.commit()
        return {"id": comment_id}
    finally:
        conn.close()


def add_approval(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Store a review decision on a content item."""
    conn = _connect()
    try:
        approval_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO approvals (id, content_id, reviewer, decision, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (approval_id, payload.get("content_id"), payload.get("reviewer", "reviewer"), payload.get("decision"), payload.get("note")),
        )
        conn.execute(
            "UPDATE contents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (
                "approved" if payload.get("decision") == "approve" else "changes_requested",
                payload.get("content_id"),
            ),
        )
        conn.commit()
        return {"id": approval_id}
    finally:
        conn.close()


def add_audit_log(actor: str, action: str, entity_type: str, entity_id: str, details: Optional[Dict[str, Any]] = None) -> None:
    """Record a governance audit event for a content or admin action."""
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO audit_log (id, actor, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), actor, action, entity_type, entity_id, json.dumps(details or {}, ensure_ascii=False)),
        )
        conn.commit()
    finally:
        conn.close()


def update_content_status(content_id: str, status: str) -> None:
    """Set the status of a content item to a workflow state."""
    conn = _connect()
    try:
        conn.execute(
            "UPDATE contents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, content_id),
        )
        conn.commit()
    finally:
        conn.close()


def fetch_review_queue() -> List[Dict[str, Any]]:
    """Return content entries that need a human reviewer decision."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM contents WHERE status IN ('draft', 'in_review') ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def delete_content(content_id: str) -> None:
    """Remove a content item and all related governance records for privacy compliance."""
    conn = _connect()
    try:
        conn.execute("DELETE FROM findings WHERE content_id = ?", (content_id,))
        conn.execute("DELETE FROM comments WHERE content_id = ?", (content_id,))
        conn.execute("DELETE FROM approvals WHERE content_id = ?", (content_id,))
        conn.execute("DELETE FROM content_versions WHERE content_id = ?", (content_id,))
        conn.execute("DELETE FROM audit_log WHERE entity_type = 'content' AND entity_id = ?", (content_id,))
        conn.execute("DELETE FROM contents WHERE id = ?", (content_id,))
        conn.commit()
    finally:
        conn.close()


def fetch_insights() -> Dict[str, Any]:
    """Return aggregate BrandGuard metrics used by the insights dashboard."""
    conn = _connect()
    try:
        open_items = conn.execute("SELECT COUNT(*) FROM contents WHERE status IN ('draft', 'in_review')").fetchone()[0]
        high_severity_count = conn.execute(
            "SELECT COUNT(*) FROM findings WHERE severity IN ('high', 'critical')"
        ).fetchone()[0]
        approved_decisions = conn.execute(
            "SELECT COUNT(*) FROM approvals WHERE decision = 'approve'"
        ).fetchone()[0]
        total_decisions = conn.execute(
            "SELECT COUNT(*) FROM approvals WHERE decision IN ('approve', 'request_changes')"
        ).fetchone()[0]
        approval_rate = (approved_decisions / total_decisions) if total_decisions else 0.0

        if total_decisions == 0:
            approved_count = conn.execute("SELECT COUNT(*) FROM contents WHERE status = 'approved'").fetchone()[0]
            total_contents = conn.execute("SELECT COUNT(*) FROM contents").fetchone()[0]
            if total_contents:
                approval_rate = (approved_count / total_contents) if total_contents else 0.0

        stale_facts = conn.execute(
            "SELECT COUNT(*) FROM facts WHERE review_by IS NOT NULL AND review_by < date('now')"
        ).fetchone()[0]
        no_source_count = conn.execute(
            "SELECT COUNT(*) FROM findings WHERE source_type = 'none'"
        ).fetchone()[0]

        category_rows = conn.execute(
            "SELECT category, COUNT(*) AS total FROM findings WHERE category IS NOT NULL GROUP BY category ORDER BY total DESC LIMIT 5"
        ).fetchall()
        category_breakdown = [[row["category"], row["total"]] for row in category_rows]
        most_common_category = category_breakdown[0][0] if category_breakdown else "none"

        rule_rows = conn.execute(
            "SELECT source_id, COUNT(*) AS total FROM findings WHERE source_id IS NOT NULL AND source_type IN ('rule','fact') GROUP BY source_id ORDER BY total DESC LIMIT 5"
        ).fetchall()
        rule_breakdown = [[row["source_id"], row["total"]] for row in rule_rows]
        flagged_rule_gap = rule_breakdown[0][0] if rule_breakdown else "none"

        avg_approval_days = conn.execute(
            """
            SELECT COALESCE(AVG(
                (strftime('%s', a.created_at) - strftime('%s', c.created_at)) / 86400.0
            ), 0)
            FROM contents c
            LEFT JOIN approvals a ON a.content_id = c.id
            WHERE c.status = 'approved'
            """
        ).fetchone()[0]

        dismissal_rate = conn.execute(
            "SELECT COALESCE(AVG(CASE WHEN dismissed = 1 THEN 1.0 ELSE 0 END), 0) FROM findings"
        ).fetchone()[0]

        return {
            "open_items": open_items,
            "high_severity_count": high_severity_count,
            "approval_rate": approval_rate,
            "most_common_category": most_common_category,
            "flagged_rule_gap": flagged_rule_gap,
            "dismissal_rate": dismissal_rate,
            "stale_facts": stale_facts,
            "avg_approval_days": round(float(avg_approval_days or 0), 1),
            "no_source_count": no_source_count,
            "category_breakdown": category_breakdown,
            "rule_breakdown": rule_breakdown,
        }
    finally:
        conn.close()
