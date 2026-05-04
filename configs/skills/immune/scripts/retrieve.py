#!/usr/bin/env python3
"""Task-conditioned retrieval for immune antibodies and cheatsheet strategies.

Implements the read phase of the Memento-Skills reflective loop
(arXiv 2603.18743): given a task prompt and the immune memory JSON,
select the subset of entries most likely to be relevant, ranked by
lexical signature overlap and an optional historical success multiplier.

Entries without a ``triggers`` field behave as always-on — this
preserves back-compatibility with immune memory v3.0.0 and earlier.
Entries with a ``triggers`` field are filtered by domain and scored
by task_signature overlap.

Schema for the new ``triggers`` field (additive, optional)::

    {
      "id": "AB-001",
      "domains": ["code"],
      "pattern": "SQL injection via string concatenation",
      "severity": "critical",
      "correction": "Use parameterized queries",
      "seen_count": 12,
      "first_seen": "2026-03-01",
      "last_seen": "2026-04-05",
      "triggers": {
        "task_signatures": ["code query review sql", "audit code sql"],
        "domains": ["code"]
      }
    }

The ``triggers.task_signatures`` list contains canonical signatures
(as produced by :func:`scripts.task_signature.task_signature`) for
prompts where this entry has historically been relevant. Multiple
signatures allow a single entry to cover several related task shapes.

This module does not modify immune memory — it is pure read-side logic.
The write path (tagging entries with triggers on firing) lives in
immune's scanner agent and is updated when new antibodies are added.
"""
from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
import sys

# Import the shared task_signature module. The immune skill lives at
# skills/immune/, and scripts/task_signature.py lives at the repo root.
# Resolve repo root by walking up from this file.
_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.task_signature import jaccard_similarity, task_signature  # noqa: E402

# Baseline score for entries without an explicit ``triggers`` field.
# Lower than typical triggered-match scores so that a well-matched
# triggered entry outranks a generic always-on entry when both apply.
_UNTRIGGERED_BASELINE = 0.5

# Minimum jaccard overlap required for a triggered entry to be
# considered a match. Below this threshold the entry is filtered out
# entirely rather than ranked low, because a barely-matching entry
# pollutes context without adding value.
_MIN_SIGNATURE_MATCH = 0.15


def _entry_domains(entry: dict) -> set[str]:
    """Return the domain set an entry applies to.

    Handles both v2 (``domain`` string) and v3 (``domains`` list)
    immune memory formats.

    Args:
        entry: An antibody or strategy record.

    Returns:
        Set of domain strings, or an empty set if neither field is set.
    """
    if "domains" in entry and isinstance(entry["domains"], list):
        return {str(d) for d in entry["domains"]}
    if "domain" in entry and isinstance(entry["domain"], str):
        return {entry["domain"]}
    return set()


def _score_entry(
    entry: dict,
    prompt_signature: str,
    active_domains: set[str],
    historical_success: dict[str, float],
) -> float:
    """Compute the retrieval score for a single entry.

    Scoring rules:

    1. Domain filter: if the entry has any domain (from ``domains`` or
       ``triggers.domains``) other than ``_global``, the active task
       must overlap at least one of those domains. Otherwise the entry
       is filtered out (score 0.0).
    2. Signature scoring: if the entry has ``triggers.task_signatures``,
       use the max Jaccard similarity against the prompt signature. If
       below :data:`_MIN_SIGNATURE_MATCH`, filter out.
    3. Untriggered entries fall back to :data:`_UNTRIGGERED_BASELINE`.
    4. Historical success multiplier: if ``historical_success`` contains
       a rate for this entry's ``id``, multiply the base score by it.
       Missing IDs default to 1.0 (no penalty).

    Args:
        entry: Antibody or strategy dict.
        prompt_signature: Signature of the current task prompt.
        active_domains: Domain set for the current task.
        historical_success: Map of entry_id -> success_rate in [0, 1].

    Returns:
        Score in ``[0.0, 1.0]``. Zero means "filter out".
    """
    entry_domains = _entry_domains(entry)
    triggers = entry.get("triggers") or {}
    trigger_domains = {str(d) for d in (triggers.get("domains") or [])}
    effective_domains = entry_domains | trigger_domains

    has_specific_domains = bool(effective_domains) and "_global" not in effective_domains
    if has_specific_domains and active_domains:
        if not (effective_domains & active_domains):
            return 0.0

    trigger_signatures = triggers.get("task_signatures") or []
    if trigger_signatures:
        best_match = max(
            jaccard_similarity(prompt_signature, str(trig))
            for trig in trigger_signatures
        )
        if best_match < _MIN_SIGNATURE_MATCH:
            return 0.0
        base = best_match
    else:
        base = _UNTRIGGERED_BASELINE

    entry_id = str(entry.get("id", ""))
    multiplier = historical_success.get(entry_id, 1.0) if entry_id else 1.0
    return base * multiplier


def retrieve(
    prompt: str,
    entries: Iterable[dict],
    active_domains: set[str] | None = None,
    historical_success: dict[str, float] | None = None,
    top_k: int = 15,
) -> list[dict]:
    """Rank entries by task-conditioned relevance to a prompt.

    Args:
        prompt: Current task prompt text.
        entries: Antibodies or strategies from immune memory.
        active_domains: Domains detected for the current task. When
            ``None`` or empty, domain filtering is skipped (all domains
            eligible) — useful for testing and unconditioned retrieval.
        historical_success: Optional map of ``entry_id -> success_rate``
            used as a multiplier on the base score. Populated by the
            scanner agent as antibodies fire and their corrections are
            accepted or rejected. For P1, callers may pass an empty
            map; the field is scaffolding for the Phase 3 router.
        top_k: Maximum number of entries to return after ranking.

    Returns:
        List of entries in descending score order, capped at ``top_k``.
        Filtered-out entries (score 0.0) are excluded.
    """
    prompt_sig = task_signature(prompt)
    active = active_domains or set()
    history = historical_success or {}

    scored: list[tuple[float, dict]] = []
    for entry in entries:
        score = _score_entry(entry, prompt_sig, active, history)
        if score > 0.0:
            scored.append((score, entry))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in scored[:top_k]]


def build_success_map(history_entries: list[dict]) -> dict[str, float]:
    """Compute pass-rate by task_signature from eval history entries.

    This is a utility for callers who want to derive the
    ``historical_success`` map from ``evals/history.jsonl`` records.
    The returned map is keyed by ``task_signature`` rather than entry
    id, so it is most useful for router-level scoring (Phase 3) and
    not for per-antibody weighting.

    Args:
        history_entries: Parsed lines from ``evals/history.jsonl``.

    Returns:
        Map of ``task_signature -> pass_rate`` in ``[0.0, 1.0]``.
        Signatures with zero observations are excluded.
    """
    counts: dict[str, list[int]] = {}
    for entry in history_entries:
        sig = str(entry.get("task_signature", ""))
        if not sig:
            continue
        bucket = counts.setdefault(sig, [0, 0])
        bucket[1] += 1
        if entry.get("oracle_verdict") == "pass":
            bucket[0] += 1
    return {
        sig: passed / total
        for sig, (passed, total) in counts.items()
        if total > 0
    }
