# Portal auto-access helper (beginner guide)

This project helps you automatically hit your portal URL:

- `http://10.20.64.75/irj/portal`

It uses Python `requests` and keeps a session alive.

---

## 1) What this script can and cannot do

### ✅ Can do
- Open the portal URL.
- Revisit it every N seconds.
- Optionally send username/password to a known login endpoint.

### ❌ Cannot do
- Bypass SSO/MFA/Captcha.
- “Hack” authentication.

If your company portal uses Okta/ADFS/SAML login pages, you may need browser automation instead.

---

## 2) Install step-by-step (first time)

Run these commands in this repository folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> If `python3` is not found, install Python 3 first.

---

## 3) Quick beginner test (recommended first)

This sends **one** request and exits:

```bash
python3 auto_access.py --url "http://10.20.64.75/irj/portal" --once
```

You should see logs like:
- `[bootstrap] status=...`
- `[poll] status=...`

---

## 4) Continuous mode (keeps running)

This checks every 60 seconds until you stop it:

```bash
python3 auto_access.py --url "http://10.20.64.75/irj/portal" --interval 60
```

Press `Ctrl + C` to stop.

---

## 5) If you have a form login endpoint

Only use this if your system team gave you a login URL (example shown below):

```bash
python3 auto_access.py \
  --url "http://10.20.64.75/irj/portal" \
  --login-url "http://10.20.64.75/irj/j_security_check" \
  --username "YOUR_USERNAME" \
  --password "YOUR_PASSWORD" \
  --poll-path "/irj/portal" \
  --interval 60
```

---

## 6) Common issues (simple troubleshooting)

- **Connection timeout / refused**: Check VPN/network and whether the portal is reachable from your machine.
- **Always redirected to another login page**: likely SSO flow; this script cannot complete JS-based login pages.
- **401/403 status**: credentials/session not accepted for that endpoint.

---

## 7) Safe next steps

1. Run `--once` first.
2. Confirm status codes.
3. Move to `--interval 60` continuous mode.
4. If SSO redirects happen, switch to browser automation (Playwright/Selenium).
