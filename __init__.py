from __future__ import annotations

import base64
import difflib
import json
import uuid
from pathlib import Path
from typing import Any, Dict, Tuple

from dotenv import load_dotenv
from flask import Blueprint, jsonify, request

from .db import add_audit_log, add_comment, add_finding, add_approval, create_content, fetch_review_queue, get_content, init_db, update_content_status, update_content_version
from .image_checks import decode_base64_image, validate_image_accessibility
from .orchestrator import review_content

load_dotenv()

brandguard_bp = Blueprint("brandguard", __name__, url_prefix="/api/brandguard")
UPLOAD_ROOT = Path(__file__).resolve().parent / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg"}


def _identity() -> Dict[str, str]:
    """Read user metadata from request headers."""
    return {
        "user": request.headers.get("X-User", "anonymous"),
        "role": request.headers.get("X-Role", "creator").lower(),
    }


def _require_roles(*allowed_roles: str) -> Tuple[Dict[str, str], Any]:
    """Require a valid role for a BrandGuard endpoint."""
    identity = _identity()
    if identity["role"] not in allowed_roles:
        return identity, (jsonify({
            "error": "forbidden",
            "message": f"Role '{identity['role']}' is not allowed for this action.",
        }), 403)
    return identity, None


@brandguard_bp.get("/health")
def health() -> Any:
    """BrandGuard health check endpoint."""
    init_db()
    return jsonify({"ok": True, "service": "BrandGuard"})


@brandguard_bp.get("/admin/rules")
def list_rules() -> Any:
    """Return the approved governance rules."""
    identity, forbidden = _require_roles("admin", "manager", "reviewer", "creator")
    if forbidden is not None:
        return forbidden
    from .db import fetch_rules
    return jsonify({"user": identity["user"], "role": identity["role"], "rules": fetch_rules()})


@brandguard_bp.post("/admin/rules")
def add_rule() -> Any:
    """Create a new BrandGuard rule."""
    identity, forbidden = _require_roles("admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    if not payload.get("id") or not payload.get("text"):
        return jsonify({"error": "bad_request", "message": "Rule id and text are required."}), 400
    from .db import upsert_rule
    rule = upsert_rule(payload)
    add_audit_log(identity["user"], "create_rule", "rule", payload["id"], payload)
    return jsonify({"created": True, "rule": rule, "user": identity["user"], "role": identity["role"]})


@brandguard_bp.put("/admin/rules/<rule_id>")
def edit_rule(rule_id: str) -> Any:
    """Update an existing BrandGuard rule."""
    identity, forbidden = _require_roles("admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    from .db import update_rule
    rule = update_rule(rule_id, payload)
    if rule is None:
        return jsonify({"error": "not_found", "message": f"Rule '{rule_id}' was not found."}), 404
    add_audit_log(identity["user"], "update_rule", "rule", rule_id, payload)
    return jsonify({"updated": True, "rule": rule, "user": identity["user"], "role": identity["role"]})


@brandguard_bp.get("/admin/facts")
def list_facts() -> Any:
    """Return approved facts and stale-status metadata."""
    identity, forbidden = _require_roles("admin", "manager", "reviewer", "creator")
    if forbidden is not None:
        return forbidden
    from .db import fetch_facts
    return jsonify({"user": identity["user"], "role": identity["role"], "facts": fetch_facts()})


@brandguard_bp.post("/admin/facts")
def add_fact() -> Any:
    """Create a new BrandGuard fact."""
    identity, forbidden = _require_roles("admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    if not payload.get("id") or not payload.get("statement"):
        return jsonify({"error": "bad_request", "message": "Fact id and statement are required."}), 400
    from .db import upsert_fact
    fact = upsert_fact(payload)
    add_audit_log(identity["user"], "create_fact", "fact", payload["id"], payload)
    return jsonify({"created": True, "fact": fact, "user": identity["user"], "role": identity["role"]})


@brandguard_bp.put("/admin/facts/<fact_id>")
def edit_fact(fact_id: str) -> Any:
    """Update an existing BrandGuard fact."""
    identity, forbidden = _require_roles("admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    from .db import update_fact
    fact = update_fact(fact_id, payload)
    if fact is None:
        return jsonify({"error": "not_found", "message": f"Fact '{fact_id}' was not found."}), 404
    add_audit_log(identity["user"], "update_fact", "fact", fact_id, payload)
    return jsonify({"updated": True, "fact": fact, "user": identity["user"], "role": identity["role"]})


@brandguard_bp.get("/admin/terms")
def list_terms() -> Any:
    """Return brand terminology guidance."""
    identity, forbidden = _require_roles("admin", "manager", "reviewer", "creator")
    if forbidden is not None:
        return forbidden
    from .db import fetch_terms
    return jsonify({"user": identity["user"], "role": identity["role"], "terms": fetch_terms()})


@brandguard_bp.post("/admin/terms")
def add_term() -> Any:
    """Create a new preferred/banned term entry."""
    identity, forbidden = _require_roles("admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    if not payload.get("preferred"):
        return jsonify({"error": "bad_request", "message": "Preferred term is required."}), 400
    from .db import upsert_term
    term = upsert_term(payload)
    add_audit_log(identity["user"], "create_term", "term", term["id"], payload)
    return jsonify({"created": True, "term": term, "user": identity["user"], "role": identity["role"]})


@brandguard_bp.put("/admin/terms/<term_id>")
def edit_term(term_id: str) -> Any:
    """Update an existing terminology rule."""
    identity, forbidden = _require_roles("admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    from .db import update_term
    term = update_term(term_id, payload)
    if term is None:
        return jsonify({"error": "not_found", "message": f"Term '{term_id}' was not found."}), 404
    add_audit_log(identity["user"], "update_term", "term", term_id, payload)
    return jsonify({"updated": True, "term": term, "user": identity["user"], "role": identity["role"]})


@brandguard_bp.post("/content")
def create_content_route() -> Any:
    """Create a new content item and run pre-publication review."""
    identity, forbidden = _require_roles("creator", "manager", "reviewer", "admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    body = payload.get("body", "")
    if not body or not body.strip():
        return jsonify({"error": "bad_request", "message": "Content body is required."}), 400
    content = create_content({
        "body": body,
        "channel": payload.get("channel", "social"),
        "creator": identity["user"],
        "title": payload.get("title"),
        "deterministic_only": bool(payload.get("deterministic_only")),
    })
    review = review_content(body, deterministic_only=bool(payload.get("deterministic_only")))
    for item in review.get("findings", []):
        add_finding({
            "content_id": content["id"],
            "version_id": content["version_id"],
            **item,
        })
    add_audit_log(identity["user"], "create_content", "content", content["id"], {"channel": payload.get("channel", "social")})
    return jsonify({"content": content, "findings": review.get("findings", []), "notice": review.get("notice", "")})


@brandguard_bp.post("/content/<content_id>/revise")
def revise_content(content_id: str) -> Any:
    """Create a new version of content and track the diff against the prior version."""
    identity, forbidden = _require_roles("creator", "manager", "admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    current = get_content(content_id)
    if current is None:
        return jsonify({"error": "not_found", "message": "Content item not found."}), 404
    new_body = payload.get("body", current["body"])
    old_body = current["body"]
    diff = difflib.unified_diff(old_body.splitlines(), new_body.splitlines(), lineterm="")
    version = update_content_version(content_id, new_body, "\n".join(diff))
    add_audit_log(identity["user"], "revise_content", "content", content_id, {"version": version["version_number"]})
    return jsonify({"content_id": content_id, "version": version})


@brandguard_bp.get("/content/<content_id>")
def get_content_route(content_id: str) -> Any:
    """Return a single content item and its version history."""
    identity, forbidden = _require_roles("creator", "manager", "reviewer", "admin")
    if forbidden is not None:
        return forbidden
    content = get_content(content_id)
    if content is None:
        return jsonify({"error": "not_found", "message": "Content item not found."}), 404
    return jsonify({"content": content})


@brandguard_bp.post("/findings/<finding_id>/decision")
def decision_on_finding(finding_id: str) -> Any:
    """Record a human decision for a finding: accept, edit, or dismiss."""
    identity, forbidden = _require_roles("creator", "manager", "reviewer", "admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    decision = payload.get("decision")
    if decision not in {"accept", "edit", "dismiss"}:
        return jsonify({"error": "bad_request", "message": "Decision must be one of accept, edit, dismiss."}), 400
    if decision == "dismiss" and not payload.get("reason"):
        return jsonify({"error": "bad_request", "message": "Dismiss reasons are required."}), 400
    add_audit_log(identity["user"], f"decision_{decision}", "finding", finding_id, payload)
    return jsonify({"decision": decision, "status": "recorded"})


@brandguard_bp.post("/content/<content_id>/submit-for-review")
def submit_for_review(content_id: str) -> Any:
    """Submit a content item to the review queue."""
    identity, forbidden = _require_roles("creator", "manager", "admin")
    if forbidden is not None:
        return forbidden
    content = get_content(content_id)
    if content is None:
        return jsonify({"error": "not_found", "message": "Content item not found."}), 404
    update_content_status(content_id, "in_review")
    add_audit_log(identity["user"], "submit_for_review", "content", content_id, {"status": "in_review"})
    return jsonify({"status": "in_review", "content_id": content_id})


@brandguard_bp.get("/queue")
def review_queue() -> Any:
    """Return content that is waiting for review decisions."""
    identity, forbidden = _require_roles("reviewer", "admin", "manager")
    if forbidden is not None:
        return forbidden
    return jsonify({"queue": fetch_review_queue()})


@brandguard_bp.get("/insights")
def insights_route() -> Any:
    """Return aggregated BrandGuard governance metrics for the insights dashboard."""
    identity, forbidden = _require_roles("creator", "manager", "reviewer", "admin")
    if forbidden is not None:
        return forbidden
    from .db import fetch_insights
    return jsonify(fetch_insights())


def _save_image_upload(data_url: str) -> str:
    """Persist uploaded image bytes outside the frontend static folder for privacy-safe storage."""
    if not data_url.startswith("data:"):
        raise ValueError("Image payload must be a data URL.")
    header, _, payload = data_url.partition(",")
    if not payload:
        raise ValueError("The uploaded image payload is empty.")
    mime_type = header.split(";", 1)[0].split(":", 1)[1]
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("Only PNG and JPG images are allowed.")
    raw = base64.b64decode(payload)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError("Uploaded image exceeds the 5MB limit for BrandGuard review.")
    extension = ".png" if mime_type == "image/png" else ".jpg"
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_ROOT / filename
    destination.write_bytes(raw)
    return str(destination)


@brandguard_bp.post("/image-check")
def image_check_route() -> Any:
    """Validate uploaded creative assets for accessibility and brand compliance."""
    identity, forbidden = _require_roles("creator", "manager", "reviewer", "admin")
    if forbidden is not None:
        return forbidden

    payload = request.get_json(silent=True) or {}
    image_value = payload.get("image_base64") or payload.get("image")
    alt_text = (payload.get("alt_text") or "").strip()
    text_color = payload.get("text_color")
    background_color = payload.get("background_color")

    if not image_value:
        return jsonify({"error": "bad_request", "message": "Image content is required."}), 400
    if not alt_text:
        return jsonify({"error": "bad_request", "message": "Alt text is required for accessibility checks."}), 400

    try:
        image_bytes = decode_base64_image(image_value)
        if len(image_bytes) > MAX_UPLOAD_BYTES:
            raise ValueError("Uploaded image exceeds the 5MB limit for BrandGuard review.")
        _save_image_upload(image_value)
        findings = validate_image_accessibility(
            image_bytes,
            alt_text=alt_text,
            text_color=text_color,
            background_color=background_color,
        )
    except (ValueError, TypeError) as exc:
        return jsonify({"error": "bad_request", "message": str(exc)}), 400

    add_audit_log(identity["user"], "image_check", "content", "image", {"alt_text": alt_text, "findings": len(findings)})
    return jsonify({"findings": findings, "alt_text": alt_text, "user": identity["user"], "role": identity["role"]})


@brandguard_bp.delete("/content/<content_id>")
@brandguard_bp.post("/content/<content_id>/delete")
def delete_content_route(content_id: str) -> Any:
    """Delete a content item and all related BrandGuard records for privacy-safe cleanup."""
    identity, forbidden = _require_roles("creator", "manager", "admin")
    if forbidden is not None:
        return forbidden
    content = get_content(content_id)
    if content is None:
        return jsonify({"error": "not_found", "message": "Content item not found."}), 404
    from .db import delete_content
    delete_content(content_id)
    add_audit_log(identity["user"], "delete_content", "content", content_id, {"title": content.get("title")})
    return jsonify({"deleted": True, "content_id": content_id, "user": identity["user"], "role": identity["role"]})


@brandguard_bp.post("/comments")
def add_comment_route() -> Any:
    """Add a new comment to a content item."""
    identity, forbidden = _require_roles("creator", "manager", "reviewer", "admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    if not payload.get("content_id") or not payload.get("body"):
        return jsonify({"error": "bad_request", "message": "content_id and body are required."}), 400
    comment = add_comment({"content_id": payload["content_id"], "author": identity["user"], "body": payload["body"]})
    add_audit_log(identity["user"], "add_comment", "comment", comment["id"], payload)
    return jsonify({"comment": comment, "user": identity["user"], "role": identity["role"]})


@brandguard_bp.post("/content/<content_id>/approval")
def content_approval(content_id: str) -> Any:
    """Approve or request changes for content after review."""
    identity, forbidden = _require_roles("reviewer", "manager", "admin")
    if forbidden is not None:
        return forbidden
    payload = request.get_json(silent=True) or {}
    decision = payload.get("decision")
    if decision not in {"approve", "request_changes"}:
        return jsonify({"error": "bad_request", "message": "Decision must be approve or request_changes."}), 400
    approval = add_approval({"content_id": content_id, "reviewer": identity["user"], "decision": decision, "note": payload.get("note")})
    add_audit_log(identity["user"], f"approval_{decision}", "content", content_id, payload)
    return jsonify({"approval": approval, "status": "recorded"})


init_db()
