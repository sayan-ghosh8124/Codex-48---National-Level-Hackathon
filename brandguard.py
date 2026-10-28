from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Iterable, List, Optional, Sequence

try:
    from .checks import run_deterministic_checks
    from .db import fetch_facts, fetch_rules
    from .llm import review_with_llm
    from .verifier import (
        extract_promotional_claims,
        match_claims_to_facts,
        verify_findings,
    )
except ImportError:
    from checks import run_deterministic_checks
    from db import fetch_facts, fetch_rules
    from llm import review_with_llm
    from verifier import (
        extract_promotional_claims,
        match_claims_to_facts,
        verify_findings,
    )

CACHE: Dict[str, Dict[str, Any]] = {}
