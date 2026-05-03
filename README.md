# 🔍 Déjà Applied

> Never accidentally apply to the same job twice.

A Chrome extension that detects when you open a LinkedIn job listing email in Gmail, then silently searches your archived emails to check if you already applied to that company or role.

---

## How It Works

1. Open a LinkedIn job alert email in Gmail
2. Déjà Applied parses the company name and job title from the email
3. Searches your Gmail archive for application acknowledgment emails
4. Shows a small overlay in the bottom-right corner with results

---

## Setup (Personal Use)

### Step 1 — Create a Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project
2. Go to **APIs & Services → Library**, search for **Gmail API**, click **Enable**

### Step 2 — Configure OAuth Consent Screen
1. Go to **APIs & Services → OAuth consent screen**
2. Select **External**, fill in app name + your email
3. Add your own Google account as a **Test User**

### Step 3 — Create OAuth Credentials
1. **Credentials → + Create Credentials → OAuth 2.0 Client ID**
2. Application type: **Chrome extension**
3. Copy the **Client ID** (looks like `xxxx.apps.googleusercontent.com`)

### Step 4 — Add Your Client ID
1. Make a copy of `manifest.json.template' and name it `manifest.json`
2. Open `manifest.json` and replace `YOUR_GOOGLE_CLIENT_ID`:
```json
"client_id": "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
```

### Step 5 — Load the Extension
1. Go to `chrome://extensions`, enable **Developer mode**
2. Click **Load unpacked** → select this folder
3. Copy your **Extension ID** shown on the card
4. Go back to Google Cloud → edit your OAuth credential → set **Item ID** to your Extension ID → Save

### Step 6 — Sign In
Click the Déjà Applied icon in Chrome → **Sign in with Google** → grant Gmail read access.
If prompted about an "unverified app", click **Advanced → Go to app** (safe for your own app).

---

## File Structure

| File | Purpose |
|---|---|
| `manifest.json` | Extension config — put your OAuth Client ID here |
| `background.js` | Service worker: token management + Gmail API search |
| `content.js` | Gmail content script: email detection, parsing, overlay UI |
| `overlay.css` | Styles for the bottom-right results panel |
| `popup.html/js` | Toolbar popup: sign in/out and status |
| `icons/` | 16/48/128px icons |

---

## Email Parser

The parser in `content.js` tries five strategies in order to extract company and role:

| # | Strategy | Example |
|---|---|---|
| 1 | `"Role at Company"` in email body | `Software Engineer at Acme Corp` |
| 2 | Subject line parsing | `SWE at Acme Corp – LinkedIn Job Alert` |
| 3 | Consecutive role + company lines | LinkedIn digest card format |
| 4 | Labeled fields | `Position: SWE / Company: Acme` |
| 5 | Contextual phrases | `Hiring: SWE at Acme` |

---

## Gmail Search

For each detected company, Déjà Applied runs up to three Gmail API queries using keywords like:
- `"thank you for applying"`
- `"application received"`
- `"we received your application"`
- `"successfully applied"`

Only email **metadata** is fetched (Subject, From, Date, snippet) — no full email bodies are ever read.

---

## Publishing Publicly

1. **OAuth Verification** — submit via the OAuth consent screen; provide a privacy policy URL and a short video demo; expect 1–4 weeks for Google review
2. **Privacy Policy** — state that only Gmail metadata is read locally and nothing is stored or shared
3. **Chrome Web Store** — $5 one-time developer account; upload as `.zip` with 1280×800 screenshots
4. **Tighten CSP** — add to `manifest.json` for the public release:
   ```json
   "content_security_policy": {
     "extension_pages": "script-src 'self'; object-src 'self'"
   }
   ```

---

## Privacy

- Reads only email **metadata** (Subject, From, Date, snippet) — never full bodies
- All processing runs locally in your browser
- OAuth tokens managed by Chrome's built-in `chrome.identity` API
- Nothing is sent to any server except Google's own Gmail API

---

## Contributing

To contribute, you'll need to set up your own Google Cloud project and OAuth Client ID (see Setup above). The `client_id` field in `manifest.json` is intentionally left as a placeholder — do not commit your real Client ID to a public fork.

MIT License
