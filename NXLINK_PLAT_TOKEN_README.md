# NXLINK plat_token helper — setup & usage

`nxlink_get_plat_token.py` logs into NXLINK headlessly with your account and prints a
live **`plat_token`** (the JWT NXLINK uses as the `Authorization` Bearer for its `/admin`
AI-Conversation, FAQ-upload, IR-export and flow APIs).

You provide your login **once** in a local credentials file; the script does the rest.

---

## 1. Prerequisites

- **Python 3.9+**
- **Playwright** (with a Chromium build):

  ```bash
  pip install playwright --break-system-packages
  playwright install chrome
  ```

---

## 2. Create the credentials file

The script reads a file named **`.nxlink_creds`** in the same folder as the script.

**Format — exactly two lines:**

```
line 1  →  your NXLINK account (email)
line 2  →  your NXLINK password
```

Example (`.nxlink_creds`):

```
you@yourcompany.com
your-password-here
```

Create it and lock down its permissions so only you can read it:

```bash
cd /path/to/the/script
printf '%s\n%s\n' 'you@yourcompany.com' 'your-password-here' > .nxlink_creds
chmod 600 .nxlink_creds
```

Notes:
- Blank lines and anything after a `#` on a line are ignored, so you can annotate:
  ```
  you@yourcompany.com     # NXLINK account
  your-password-here      # NXLINK password
  ```
- The account must exist on the tenant you're targeting and have normal admin/flow
  permission.
- **Never commit this file.** It is already covered by `.gitignore`. Keep it out of
  chat, tickets, and screenshots.

---

## 3. Run it

```bash
python3 nxlink_get_plat_token.py                 # HomePro / app.nxlink.ai (default)
python3 nxlink_get_plat_token.py | pbcopy        # copy the token to the clipboard
python3 nxlink_get_plat_token.py --out token.txt # also write it to a chmod-600 file
python3 nxlink_get_plat_token.py --host https://idn.nxlink.ai   # a different tenant
python3 nxlink_get_plat_token.py --no-session    # ignore saved session, force a fresh login
python3 nxlink_get_plat_token.py --headed        # show the browser (debug login problems)
```

**Only the token is printed to stdout** — all progress messages go to stderr, so you can
capture it cleanly:

```bash
TOKEN=$(python3 nxlink_get_plat_token.py)
curl -H "Authorization: $TOKEN" https://app.nxlink.ai/admin/...
```

On the first successful login the script saves a browser session
(`playwright_session.json`, or `playwright_session_<host>.json` for other tenants) so
later runs skip the login step until that session expires.

---

## 4. Using the token

Pass it as the `Authorization` header (the value **is** the Bearer token — no `Bearer `
prefix is required by NXLINK):

```bash
curl -H "Authorization: <plat_token>" \
     -H "Content-Type: application/json" \
     https://app.nxlink.ai/admin/nx_flow_manager/conversation
```

---

## 5. Security

- The `plat_token` grants API access **as your account** — treat it like a password.
- It is **short-lived**; re-run the script to get a fresh one when calls start returning
  auth errors (e.g. `403` / "用户未登录").
- Share tokens only over a secure channel; never paste them into commits, tickets, or chat.
- Prefer giving each developer their **own** `.nxlink_creds` (their own NXLINK login)
  rather than sharing one token or one account.

---

## 6. Validate the token with Chrome DevTools

Two independent checks. **A** proves the token matches the one the real NXLINK site is
using; **B** proves the token actually authorizes an API call.

### A. Compare against the live cookie (Application tab)

1. In Chrome, log into NXLINK normally: `https://app.nxlink.ai/admin/` (use the tenant
   host you passed to `--host`).
2. Press **F12** (or right-click → **Inspect**) to open DevTools.
3. Open the **Application** tab (click **»** if it's hidden).
4. Left sidebar → **Storage** → **Cookies** → click `https://app.nxlink.ai`.
5. In the cookie list, find the row named **`plat_token`**. Click it and copy its
   **Value** (or double-click the value cell).
6. Compare it with what the script prints:
   ```bash
   python3 nxlink_get_plat_token.py
   ```
   Tokens are refreshed on each login, so the two strings won't be byte-identical — what
   should match is the **decoded payload** (same account). Paste either token into
   <https://jwt.io> (or decode locally, no upload) and check the `uId` claim is your
   account:
   ```bash
   # decode the middle segment locally — nothing leaves your machine
   python3 - <<'PY'
   import base64, json, sys
   tok = input("paste plat_token: ").strip()
   p = tok.split(".")[1]; p += "=" * (-len(p) % 4)
   print(json.dumps(json.loads(base64.urlsafe_b64decode(p)), indent=2))
   PY
   ```
   A valid token decodes to JSON containing your `uId`. If it can't be decoded, it isn't a
   real JWT.

### B. Prove it authorizes an API call (Network / Console tab)

**Option 1 — copy a real request as cURL:**

1. With NXLINK open, go to the **Network** tab in DevTools.
2. Click around the admin UI (e.g. open **AI Conversation**) so requests appear.
3. Click a request to `.../admin/nx_flow_manager/...`, right-click →
   **Copy** → **Copy as cURL**.
4. Paste it into a terminal and replace the `authorization:` header value with the token
   from the script. If it returns the same JSON (not a `403` / login error), the token is
   valid.

**Option 2 — test straight from the Console tab:**

1. Open the **Console** tab in DevTools **while on `app.nxlink.ai`** (so the request is
   same-origin).
2. Paste this, substituting your token:
   ```js
   fetch("/admin/nx_flow_manager/conversation", {
     method: "POST",
     headers: { "authorization": "PASTE_TOKEN_HERE",
                "content-type": "application/json" },
     body: JSON.stringify({ phone: null, tags: [], page_number: 1,
                            page_size: 1, timeZone: "UTC+07:00" })
   }).then(r => r.json()).then(console.log);
   ```
3. **Valid** → a JSON object with conversation data (a `code: 200` / `data` field).
   **Invalid/expired** → `code: 403` or a "用户未登录" (not logged in) message.

> Tip: you can watch the script's own login happen with `--headed`, which opens the same
> Chrome so you can inspect cookies live during the run.

---

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Playwright not installed` | Run the two install commands in step 1. |
| `No usable credentials at .../.nxlink_creds` | File missing or fewer than 2 non-comment lines. Recreate it per step 2. |
| `Login failed (no plat_token)` | Wrong account/password, or account lacks access on that tenant. Re-run with `--headed` to watch the login. |
| Token seems stale / API returns 403 | Run with `--no-session` to force a fresh login. |
