# NXLINK Data API — Developer Integration Guide

**Audience:** a developer who needs to read the same HomePro NXLINK data the Chat Analytics
project ingests (chat records, AI conversations/transcripts, CDP customers, and the two
browser-fetched reports). This is the **API surface + auth recipes** with worked examples.

**This document contains NO secrets.** Every key, token, password and tenant identifier is a
`<PLACEHOLDER>` — obtain the real values from ops (see [§7 Credentials](#7-getting-credentials)).
It is a companion to the operational `DATA_PIPELINE.md`, which is credential-bearing and must
**not** be shared; this guide is the shareable derivative.

> ⚠️ **Before you build against this:** the data is **customer PII** (names, phone numbers, chat
> transcripts) and one token below is **full-access**. Read [§8 Handling & authorization](#8-handling-authorization-read-this)
> first — adding a consumer is an access decision, not just a coding task.

---

## 1. At a glance

| # | Data | Method + path | Host | Auth | Browser? |
|---|------|---------------|------|------|----------|
| 1 | **Chat records** (message/event log) | `GET /saas/openapi/chat/records` | `api-hk.nxlink.ai` | **A** — OpenAPI HMAC | No |
| 2 | **AI Conversations** (bot sessions, incl. bot-only) | `POST /admin/nx_flow_manager/conversation` | `app.nxlink.ai` | **B** — plat_token | No |
| 2b | **AI transcripts** (per conversation) | `GET /admin/nx_flow_manager/conversation/messages` | `app.nxlink.ai` | **B** — plat_token | No |
| 3 | **CDP customer list** | `POST /admin/cdp/customer/list` | `app.nxlink.ai` | **B** — plat_token | No |
| 4 | **Digital Interaction Report (IR)** | `GET /home/api/conversation/record/export` | `app.nxlink.ai` | **B** — plat_token (login) | ⚠️ see §6 |
| 5 | **Agent Statistics** (voice login/state) | `GET …/cc/api/ccAgentStatistical/v1/output` | `app.nxlink.ai` | **C** — cc usertoken + JSESSIONID | ⚠️ Yes |

**Coverage note:** Chat records and IR cover only **agent-transferred** conversations. **AI
Conversations (2)** are the *only* source of **bot-only / containment** sessions — there is no
official export for them.

**Start with the browser-free set (1, 2, 2b, 3).** Sources 4 and 5 still require a headless
login today; a REST offload is planned ([§6](#6-ir--agent-statistics-browser-today-rest-soon)).

---

## 2. Authentication — three distinct methods (do not conflate)

### A. OpenAPI HMAC — chat records (source 1)

Per-request signed headers. No browser, stdlib only. You need an **access key** + **access
secret** (`<ACCESS_KEY>` / `<ACCESS_SECRET>`).

Signature recipe (order is fixed — do not reorder the fields):

```
ts   = current time in MILLISECONDS
raw  = "accessKey=<ACCESS_KEY>&action=mt&bizType=2&ts=<ts>&accessSecret=<ACCESS_SECRET>"
sign = MD5_hex(raw)          # lowercase hex
```

Headers sent on every request:

| Header | Value |
|--------|-------|
| `accessKey` | `<ACCESS_KEY>` |
| `ts` | the millisecond timestamp used in `raw` |
| `bizType` | `2` |
| `action` | `mt` |
| `sign` | the MD5 hex above |
| `Content-Type` | `application/json` |

**Re-sign every request** with a fresh `ts`. Code `1004 "Authentication failed (timestamp
expired)"` means your `ts` drifted — just retry with a new timestamp (the reference client
re-signs on each attempt for exactly this reason).

### B. `plat_token` Bearer — admin APIs (sources 2, 2b, 3, and IR)

A long-lived NXLINK JWT. **The token has no `exp` claim** — do not cache it long; fetch a fresh
one before a run and **refresh on a `403`**.

Two ways to obtain it:

1. **Shared service-token endpoint (preferred, no browser).** Ops provides its URL as the env
   var `NXAI_TOKEN_URL` (it embeds a guard key — treat the whole URL as a secret). A `GET`
   returns:
   ```json
   { "token": "<JWT>" }
   ```
   Use the **raw token** as the header value — **no `Bearer ` prefix**:
   ```
   authorization: <JWT>
   ```
   ⚠️ This endpoint returns a **full-access** token and is **shared with another team** (the
   real-time dashboard). See [§8](#8-handling-authorization-read-this) before you point new load at it.
2. **Headless password login** (fallback) — a service account username/password yields the same
   `plat_token` *and* the call-center session needed for method C.

### C. Call-center `usertoken` + `JSESSIONID` — Agent Statistics only (source 5)

A **separate** call-center JWT (`usertoken` header) plus a `JSESSIONID` cookie. **Expires ~1 h
and can only be renewed by re-login** — captured from the seating/agent-stats page's own `cc/api`
requests. The plat_token from method B does **not** work here (returns `403`). This is the brittle
leg and the reason a browser is still involved for source 5.

---

## 3. Endpoint reference

Response envelope is consistent across the JSON endpoints:

```json
{ "code": "0", "message": "", "total": 1234, "list": [ … ] }
```
- **`code`** — `"0"` (string) or `0` (int) = success; anything else is an error (e.g. `1004`
  timestamp expired; `403` = plat_token/session expired → refresh and retry).
- **`total`** — full row count for the query; use it to know when pagination is done.
- **`list`** — the rows (some endpoints use `data`; the reference client falls back
  `list || data || []`).

### 3.1 Chat records — `GET /saas/openapi/chat/records` (auth A)

Query params:

| Param | Example | Notes |
|-------|---------|-------|
| `page_number` | `1` | 1-based |
| `page_size` | `100` | **100 is the max** |
| `tenant_id` | `<TENANT_ID>` | from ops |
| `appkey` | `<APPKEY>` | from ops |
| `start_time` | `2026-07-01 00:00:00` | `YYYY-MM-DD HH:MM:SS`, tenant local time |
| `end_time` | `2026-07-01 23:59:59` | inclusive end of day |
| `order_by` | `asc` | |
| `channel` | *(omit)* | leave unset for all channels |

Paginate until `len(accumulated) >= total`. Keep ~0.5 s between pages (see [§4](#4-pagination-rate-limits-retries)).
Nested objects in a record flatten to `parent_child` keys; list fields serialize as JSON.

### 3.2 AI Conversations — `POST /admin/nx_flow_manager/conversation` (auth B)

JSON body:
```json
{ "phone": null, "tags": [], "page_number": 1, "page_size": 100, "timeZone": "UTC+07:00" }
```
Returns bot sessions (including bot-only). Page via `page_number` / `page_size` against `total`.

### 3.3 AI transcript — `GET /admin/nx_flow_manager/conversation/messages` (auth B)

Query: `?pageSize=9999&pageNumber=1&conversationId=<CONV_ID>` — the messages are under `data`.
Fetch one conversation at a time using the ids returned by 3.2.

### 3.4 CDP customer list — `POST /admin/cdp/customer/list` (auth B)

JSON body is a paged filter (page number / size). A `0`-row return usually means **token scope /
throttle**, not "no data" — refresh the token and back off before concluding it is empty.

### 3.5 IR export — `GET /home/api/conversation/record/export` (auth B) · see §6

The Digital Interaction Report; returns a file (XLSX). Uses the plat_token `authorization` header.
Today it is driven from a logged-in session — see [§6](#6-ir--agent-statistics-browser-today-rest-soon).

### 3.6 Agent Statistics — `…/cc/api/ccAgentStatistical/v1/output` (auth C) · see §6

Voice agent login/state. Requires the call-center `usertoken` + `JSESSIONID` (method C), captured
in a browser. **Validate the tenant on every pull** — a shared login account whose call-center
company switches can silently return the **wrong tenant's** data.

---

## 4. Pagination, rate limits, retries

- **Page size:** chat records cap at **100/page**; admin endpoints accept larger sizes.
- **Pacing:** ~**0.5 s** between pages is the value the reference client uses; keep it to avoid
  throttling on multi-hundred-page days.
- **Retry transient failures per page**, not per run: up to ~4 attempts with growing backoff
  (5 s, 10 s, 15 s), re-signing (A) or refreshing the token (B) each attempt. A single connection
  reset or a `1004`/`403` on one page should not abandon the whole fetch.
- **Completeness:** treat a run as complete only when `accumulated >= total`. If the stream ends
  short, mark the output incomplete rather than trusting a truncated file.

## 5. Worked examples

> **Postman:** import `docs/postman/NXLINK_Data_API.postman_collection.json` **and**
> `…postman_environment.json`, select the environment, then fill the empty secret values from
> ops. The collection signs chat records automatically (a pre-request script computes the HMAC),
> and **Auth ▸ Get plat_token** populates `{{plat_token}}` for the admin requests. All secret
> values ship empty — never commit a filled environment.


**Chat records (auth A) — Python, stdlib only:**
```python
import hashlib, time, urllib.parse, urllib.request, json

BASE = "https://api-hk.nxlink.ai"
ACCESS_KEY, ACCESS_SECRET = "<ACCESS_KEY>", "<ACCESS_SECRET>"   # from ops / .env

def headers():
    ts  = str(int(time.time() * 1000))
    raw = f"accessKey={ACCESS_KEY}&action=mt&bizType=2&ts={ts}&accessSecret={ACCESS_SECRET}"
    return {"accessKey": ACCESS_KEY, "ts": ts, "bizType": "2", "action": "mt",
            "sign": hashlib.md5(raw.encode()).hexdigest(), "Content-Type": "application/json"}

def page(n):
    q = urllib.parse.urlencode({"page_number": n, "page_size": 100,
            "tenant_id": "<TENANT_ID>", "appkey": "<APPKEY>",
            "start_time": "2026-07-01 00:00:00", "end_time": "2026-07-01 23:59:59",
            "order_by": "asc"})
    req = urllib.request.Request(f"{BASE}/saas/openapi/chat/records?{q}", headers=headers())
    return json.loads(urllib.request.urlopen(req, timeout=30).read())
```

**AI Conversations (auth B) — curl:**
```bash
TOKEN=$(curl -s "$NXAI_TOKEN_URL" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST "https://app.nxlink.ai/admin/nx_flow_manager/conversation" \
     -H "authorization: $TOKEN" -H "content-type: application/json" \
     -d '{"phone":null,"tags":[],"page_number":1,"page_size":100,"timeZone":"UTC+07:00"}'
```
*(`$NXAI_TOKEN_URL` is the ops-provided secret URL — never hard-code or log it. Note: raw token,
no `Bearer ` prefix.)*

## 6. IR + Agent Statistics — browser today, REST soon

Sources 4 (IR) and 5 (Agent Statistics) still require a **headless login** (method B via login for
IR, method C for agent stats). A REST offload is the agreed target so callers no longer run a
browser or handle the cc session:

```
POST /fetch   { report, date_range }   → { job_id }
GET  /status/{job_id}                   → { state, s3_key? }     (poll)
GET  (download via s3_key)              → the IR / agent-stats file
```

**Status: PENDING** — the REST endpoint does not exist yet; until it does, IR + Agent Statistics
stay on the local browser fetch. **If you only need chat records, AI conversations/transcripts, or
CDP customers, you are unaffected** — those are all browser-free today. Coordinate with the
platform owner before building against sources 4/5.

## 7. Getting credentials

Request these from ops (never commit them; keep in a local `.env` / secrets manager):

| Env var | For | Method |
|---------|-----|--------|
| `NXLINK_ACCESS_KEY` / `NXLINK_ACCESS_SECRET` | chat records | A |
| `NXLINK_TENANT_ID` / `NXLINK_APPKEY` | chat records query | A |
| `NXAI_TOKEN_URL` | plat_token (shared service-token URL — secret) | B |
| *(service-account login)* | plat_token fallback + cc session | B / C |
| `NXLINK_BASE_URL` | override host (default `https://api-hk.nxlink.ai`) | A |

## 8. Handling, authorization — READ THIS

This is a colleague-facing API guide, not a grant of access. Before wiring anything up:

- **PII / PDPA.** Every source carries customer personal data (names, phones, transcripts). Apply
  the same handling as the analytics platform: least-privilege, no PII in logs, encryption at rest,
  and a retention limit. Do not copy raw transcripts into new stores without a retention plan.
- **Get your OWN credentials — don't reuse the analytics keys by default.** Shared keys blur audit
  trails and widen blast radius. Ask ops for a **scoped** access key / service account for your use
  case where possible.
- **The `NXAI_TOKEN_URL` returns a FULL-ACCESS token and is shared with the real-time dashboard
  team.** Pointing new, heavier load at it is a shared-resource decision: **loop in the endpoint
  owner** before you depend on it, and expect it to be replaced by a properly scoped token service.
- **Tenant-safety on Agent Statistics (source 5).** Validate the tenant on every pull — a shared
  login whose call-center company switches will silently serve another tenant's data.
- **This file is shareable; `DATA_PIPELINE.md` is not.** Keep secrets out of any copy of this guide.

---

*Companion docs (internal): `DATA_PIPELINE.md` (credential-bearing pipeline detail),
`MIGRATION_AND_SECURITY.md` (AWS target + security checklist), `CLAUDE.md` (data semantics).*
