"""Print a live NXLINK plat_token to stdout — a small helper to hand a fresh token to
another developer without sharing the account credentials themselves.

The plat_token is a JWT NXLINK sets as a cookie after login; it's the `Authorization`
Bearer used by the /admin AI-Conversation, FAQ-upload, IR-export and flow APIs.

Auth source (same file the admin/agent-status fetcher + VVA capturer use):
    .nxlink_creds  — line 1 = account, line 2 = password  (chmod 600, gitignored)
A saved Playwright session (playwright_session[_<host>].json) is reused when present
and still valid, so repeated runs don't re-login every time.

USAGE
    python3 nxlink_get_plat_token.py                      # app.nxlink.ai (HomePro)
    python3 nxlink_get_plat_token.py --host https://idn.nxlink.ai   # other tenant
    python3 nxlink_get_plat_token.py --out token.txt      # also write to a file
    python3 nxlink_get_plat_token.py --no-session         # force fresh login

Only the token is written to stdout — everything else goes to stderr, so you can do:
    TOKEN=$(python3 nxlink_get_plat_token.py)
    python3 nxlink_get_plat_token.py | pbcopy

Requires Playwright:
    pip install playwright --break-system-packages && playwright install chrome

⚠️  A plat_token grants API access as your account. Share it over a secure channel,
    treat it like a password, and remember it's a short-lived credential.
"""
from __future__ import annotations

import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CREDS = os.path.join(HERE, ".nxlink_creds")   # line1=account, line2=password (gitignored)
DEFAULT_HOST = "https://app.nxlink.ai"


def log(*a):
    """Progress/info → stderr, so stdout stays a clean token."""
    print(*a, file=sys.stderr)


def host_of(base_url: str) -> str:
    return re.sub(r"^https?://", "", base_url).split("/")[0]


def session_path(base_url: str) -> str:
    """Per-host session file (keeps the legacy name for app.nxlink.ai)."""
    host = host_of(base_url)
    if host == "app.nxlink.ai":
        return os.path.join(HERE, "playwright_session.json")
    return os.path.join(HERE, f"playwright_session_{host}.json")


def read_creds():
    if not os.path.exists(CREDS):
        return None, None
    with open(CREDS) as fh:
        lines = [ln.split("#")[0].strip() for ln in fh if ln.split("#")[0].strip()]
    if len(lines) < 2:
        return None, None
    return lines[0], lines[1]


def plat_token_from_cookies(cookies) -> str:
    return next((c["value"] for c in cookies
                 if c["name"] == "plat_token" and c["value"]), "")


def get_token(base_url: str, use_session: bool, headless: bool) -> str:
    from playwright.sync_api import sync_playwright

    session_file = session_path(base_url)
    login_page = f"{base_url.rstrip('/')}/admin/#/login"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        state = session_file if (use_session and os.path.exists(session_file)) else None
        if state:
            log(f"Restoring saved session ({os.path.basename(session_file)})...")
        ctx = browser.new_context(storage_state=state)
        page = ctx.new_page()

        # 1) Try the saved session first — navigating fires the SPA's is_login refresh.
        if state:
            page.goto(f"{base_url.rstrip('/')}/admin/#/interactive/records",
                      wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(3000)
            token = plat_token_from_cookies(ctx.cookies([base_url]))
            if token and "login" not in page.url.lower():
                log("✓ token from saved session")
                browser.close()
                return token
            log("Saved session dead/expired — logging in with .nxlink_creds...")

        # 2) Headless credential login.
        account, password = read_creds()
        if not account:
            browser.close()
            raise SystemExit(
                f"❌ No usable credentials at {CREDS} "
                "(line 1 = account, line 2 = password).")
        log(f"Logging in as {account} at {host_of(base_url)}...")
        page.goto(login_page, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(2000)
        page.fill("input[placeholder*='Account'], input[placeholder*='Email']", account)
        page.fill("input[type=password]", password)
        page.click("button:has-text('Sign In')")
        page.wait_for_timeout(6000)

        token = plat_token_from_cookies(ctx.cookies([base_url]))
        if token:
            ctx.storage_state(path=session_file)
            log(f"✓ logged in; session saved → {os.path.basename(session_file)}")
            browser.close()
            return token

        body = page.evaluate("() => document.body.innerText.slice(0,160)")
        browser.close()
        raise SystemExit(f"❌ Login failed (no plat_token). Page says: {body[:120]}")


def main():
    ap = argparse.ArgumentParser(description="Print a live NXLINK plat_token to stdout.")
    ap.add_argument("--host", default=DEFAULT_HOST,
                    help=f"tenant base URL (default {DEFAULT_HOST})")
    ap.add_argument("--out", help="also write the token to this file (chmod 600)")
    ap.add_argument("--no-session", action="store_true",
                    help="ignore any saved session and force a fresh login")
    ap.add_argument("--headed", action="store_true",
                    help="show the browser (debug login issues)")
    args = ap.parse_args()

    try:
        token = get_token(args.host, use_session=not args.no_session,
                          headless=not args.headed)
    except ImportError:
        raise SystemExit(
            "❌ Playwright not installed. Run:\n"
            "   pip install playwright --break-system-packages\n"
            "   playwright install chrome")

    if args.out:
        with open(args.out, "w") as fh:
            fh.write(token + "\n")
        try:
            os.chmod(args.out, 0o600)
        except OSError:
            pass
        log(f"✓ token written → {args.out}")

    # The token, and only the token, on stdout.
    print(token)


if __name__ == "__main__":
    main()
