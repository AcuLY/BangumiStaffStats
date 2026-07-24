"""Terminating command-line interface for the updater foundation."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import NoReturn

from . import __version__
from .archive_contract import ContractExpectationError, ContractInputError, check_contracts

_PROGRAM = "bgmss-updater"


class _ParserExit(Exception):
    def __init__(self, status: int, message: str | None) -> None:
        super().__init__()
        self.status = status
        self.message = message


class _UsageError(Exception):
    pass


class _Parser(argparse.ArgumentParser):
    def exit(self, status: int = 0, message: str | None = None) -> NoReturn:
        raise _ParserExit(status, message)

    def error(self, message: str) -> NoReturn:
        del message
        raise _UsageError from None


def _parser() -> _Parser:
    parser = _Parser(prog=_PROGRAM, allow_abbrev=False)
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subcommands = parser.add_subparsers(dest="command", required=True, parser_class=_Parser)
    subcommands.add_parser("doctor", allow_abbrev=False)
    contract = subcommands.add_parser(
        "contract-check",
        allow_abbrev=False,
    )
    contract.add_argument("--contracts-root", required=True)
    return parser


def _emit(code: str, status: str, *, error: bool) -> None:
    output = json.dumps({"code": code, "status": status}, sort_keys=True, separators=(",", ":"))
    encoded = f"{output}\n"
    if len(encoded.encode()) > 256:
        raise RuntimeError
    stream = sys.stderr if error else sys.stdout
    stream.write(encoded)


def main(args: Sequence[str] | None = None) -> int:
    """Run one terminating updater command and return its process status."""
    try:
        namespace = _parser().parse_args(None if args is None else list(args))
        if namespace.command == "doctor":
            output = json.dumps(
                {"code": "FOUNDATION_READY", "status": "ok", "version": __version__},
                sort_keys=True,
                separators=(",", ":"),
            )
            sys.stdout.write(f"{output}\n")
            return 0
        if namespace.command == "contract-check":
            check_contracts(Path(namespace.contracts_root))
            _emit("VALID", "ok", error=False)
            return 0
        raise RuntimeError
    except _ParserExit as error:
        if error.message is not None:
            sys.stdout.write(error.message)
        return error.status
    except _UsageError:
        _emit("USAGE_ERROR", "error", error=True)
        return 2
    except ContractInputError:
        _emit("CONTRACT_INPUT_INVALID", "error", error=True)
        return 1
    except ContractExpectationError:
        _emit("CONTRACT_CHECK_FAILED", "error", error=True)
        return 1
    except Exception:
        _emit("INTERNAL_ERROR", "error", error=True)
        return 70


def run() -> NoReturn:
    """Console-script wrapper."""
    raise SystemExit(main())
