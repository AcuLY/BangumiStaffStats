"""Closed HTTP bridge for the internal-network development runtime."""

from __future__ import annotations

import argparse
import base64
import binascii
import http.client
import json
import re
import signal
import socket
import sys
import time
from typing import NoReturn

_METHODS = frozenset({"GET", "POST"})
_PATH = re.compile(r"^/(?:[A-Za-z0-9._~!$&'()*+,;=:@%-]+/?)*(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$")
_MAX_REQUEST_BYTES = 128 * 1024
_MAX_RESPONSE_BYTES = 700 * 1024


def _fail(message: str) -> NoReturn:
    raise RuntimeError(message)


def _path(value: str) -> str:
    if (
        len(value.encode()) > 4096
        or _PATH.fullmatch(value) is None
        or ".." in value
        or "\\" in value
    ):
        raise argparse.ArgumentTypeError("unsafe request path")
    return value


def _body(value: str | None) -> bytes | None:
    if value is None:
        return None
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as error:
        raise RuntimeError("request body is not canonical base64") from error
    if base64.b64encode(decoded).decode("ascii") != value:
        _fail("request body is not canonical base64")
    if len(decoded) > _MAX_REQUEST_BYTES:
        _fail("request body exceeds the bridge limit")
    return decoded


def _request(arguments: argparse.Namespace) -> None:
    body = _body(arguments.body_base64)
    headers = {"Accept": "application/json"}
    if body is not None:
        if arguments.method != "POST":
            _fail("only POST may carry a body")
        headers["Content-Type"] = arguments.content_type
        headers["Content-Length"] = str(len(body))
    connection = http.client.HTTPConnection("127.0.0.1", 8080, timeout=30)
    try:
        connection.request(arguments.method, arguments.path, body=body, headers=headers)
        response = connection.getresponse()
        response_body = response.read(_MAX_RESPONSE_BYTES + 1)
        if len(response_body) > _MAX_RESPONSE_BYTES:
            _fail("response exceeds the bridge limit")
        document = {
            "bodyBase64": base64.b64encode(response_body).decode("ascii"),
            "headers": {
                name.lower(): value
                for name, value in sorted(response.getheaders(), key=lambda item: item[0].lower())
            },
            "status": response.status,
        }
        sys.stdout.write(
            json.dumps(document, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
            + "\n"
        )
    finally:
        connection.close()


def _cancel(arguments: argparse.Namespace) -> None:
    body = _body(arguments.body_base64) or b""
    request = (
        f"POST {arguments.path} HTTP/1.1\r\n"
        "Host: 127.0.0.1\r\n"
        "Content-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Connection: close\r\n\r\n"
    ).encode("ascii") + body
    connection = socket.create_connection(("127.0.0.1", 8080), timeout=5)
    try:
        connection.sendall(request)
        connection.shutdown(socket.SHUT_RDWR)
    finally:
        connection.close()
    sys.stdout.write('{"canceled":true}\n')


def _daemon() -> None:
    stopped = False

    def stop(_signal: int, _frame: object) -> None:
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while not stopped:
        time.sleep(0.1)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(allow_abbrev=False)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("daemon", allow_abbrev=False)
    for name in ("request", "cancel"):
        command = commands.add_parser(name, allow_abbrev=False)
        command.add_argument("--path", required=True, type=_path)
        command.add_argument("--body-base64")
        if name == "request":
            command.add_argument("--method", choices=sorted(_METHODS), required=True)
            command.add_argument("--content-type", default="application/json")
    return parser


def main() -> None:
    arguments = _parser().parse_args()
    if arguments.command == "daemon":
        _daemon()
    elif arguments.command == "request":
        _request(arguments)
    elif arguments.command == "cancel":
        _cancel(arguments)
    else:
        _fail("unknown bridge command")


if __name__ == "__main__":
    main()
