"""Bounded failures owned by catalog derivation."""

from __future__ import annotations


class CatalogError(RuntimeError):
    """One stable catalog failure code with optional bounded evidence."""

    def __init__(self, code: str, *, evidence: object | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.evidence = evidence
