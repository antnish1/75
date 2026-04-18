#!/usr/bin/env python3
"""Basic automation helper for repeatedly accessing a web portal.

This script does **not** bypass authentication. It can:
1) perform an initial GET to the portal
2) keep a session and optionally POST credentials to a login endpoint
3) poll a protected page at a fixed interval
"""

from __future__ import annotations

import argparse
import time
from dataclasses import dataclass
from typing import Optional

import requests


@dataclass
class PortalConfig:
    base_url: str
    login_url: Optional[str]
    username: Optional[str]
    password: Optional[str]
    poll_path: str
    interval_seconds: int
    timeout_seconds: int
    once: bool


def parse_args() -> PortalConfig:
    parser = argparse.ArgumentParser(description="Automate basic portal access with requests.Session().")
    parser.add_argument("--url", default="http://10.20.64.75/irj/portal", help="Portal URL")
    parser.add_argument(
        "--login-url",
        default=None,
        help="Optional login endpoint URL for form POST. If omitted, no credential POST is attempted.",
    )
    parser.add_argument("--username", default=None, help="Optional username for login form")
    parser.add_argument("--password", default=None, help="Optional password for login form")
    parser.add_argument("--poll-path", default="/irj/portal", help="Path to repeatedly poll after session bootstrap")
    parser.add_argument("--interval", type=int, default=60, help="Seconds between polls")
    parser.add_argument("--timeout", type=int, default=15, help="HTTP timeout (seconds)")
    parser.add_argument("--once", action="store_true", help="Run only one poll request and exit")
    args = parser.parse_args()

    return PortalConfig(
        base_url=args.url,
        login_url=args.login_url,
        username=args.username,
        password=args.password,
        poll_path=args.poll_path,
        interval_seconds=args.interval,
        timeout_seconds=args.timeout,
        once=args.once,
    )


def attempt_login(session: requests.Session, cfg: PortalConfig) -> None:
    if not cfg.login_url:
        print("[info] No --login-url provided; skipping login POST.")
        return

    if not cfg.username or not cfg.password:
        print("[warn] --login-url set but credentials missing; skipping login POST.")
        return

    payload = {
        "j_username": cfg.username,
        "j_password": cfg.password,
    }
    response = session.post(cfg.login_url, data=payload, timeout=cfg.timeout_seconds)
    print(f"[login] status={response.status_code} final_url={response.url}")


def build_poll_url(cfg: PortalConfig) -> str:
    if cfg.base_url.rstrip("/").endswith(cfg.poll_path.strip("/")):
        return cfg.base_url
    return cfg.base_url.rstrip("/") + "/" + cfg.poll_path.strip("/")


def poll_loop(session: requests.Session, cfg: PortalConfig) -> None:
    poll_url = build_poll_url(cfg)

    if cfg.once:
        print(f"[info] Single request mode for {poll_url}")
        response = session.get(poll_url, timeout=cfg.timeout_seconds)
        print(f"[poll] status={response.status_code} bytes={len(response.text)} url={response.url}")
        return

    print(f"[info] Polling {poll_url} every {cfg.interval_seconds}s (Ctrl+C to stop)")
    while True:
        try:
            response = session.get(poll_url, timeout=cfg.timeout_seconds)
            print(f"[poll] status={response.status_code} bytes={len(response.text)} url={response.url}")
        except requests.RequestException as exc:
            print(f"[error] {exc}")
        time.sleep(cfg.interval_seconds)


def main() -> None:
    cfg = parse_args()
    session = requests.Session()

    try:
        bootstrap = session.get(cfg.base_url, timeout=cfg.timeout_seconds)
        print(f"[bootstrap] status={bootstrap.status_code} final_url={bootstrap.url}")

        attempt_login(session, cfg)
        poll_loop(session, cfg)
    except requests.RequestException as exc:
        print(f"[fatal] Request failed: {exc}")


if __name__ == "__main__":
    main()
