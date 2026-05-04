# Contributing to Déjà Applied

Thank you for your interest in contributing! This document covers how to set up your development environment, run tests, and submit changes.

## Project Structure

```
deja-applied/
├── manifest.json       # Chrome extension manifest (MV3)
├── content.js          # Gmail content script — email detection, parsing, overlay UI
├── background.js       # Service worker — OAuth2 token management, Gmail API calls
├── overlay.css         # Styles for the in-Gmail overlay panel
├── popup.html          # Extension popup (toolbar icon click)
├── popup.js            # Popup logic — sign in/out, auth status
├── icons/              # Extension icons (16, 48, 128px)
├── package.json        # Dev dependencies (Jest)
└── tests/
    ├── parser.test.js  # Unit tests for parser logic
    └── parser-shim.js  # Node-compatible copy of content.js parser functions
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later (for running tests)
- Google Chrome (for loading the extension)
- A Google Cloud project with the Gmail API enabled and an OAuth2 client ID ([setup guide](https://developers.google.com/gmail/api/quickstart/js))

## Running Tests

Install dependencies and run the test suite:

```bash
npm install
npm test
```

To run tests in watch mode (re-runs on file save):

```bash
npm run test:watch
```

Tests are located in `tests/parser.test.js` and cover all parser helper functions and the main `parseLinkedInJobEmail` logic. All 35 tests should pass before submitting a PR.

### How the test setup works

`content.js` is a browser content script and cannot run directly in Node. The file `tests/parser-shim.js` is a Node-compatible copy of all the pure parser functions from `content.js`, with browser globals (`document`, `chrome`) mocked out.

> ⚠️ **Keep the shim in sync.** When you change any parser function in `content.js` — `parseLinkedInJobEmail`, `cleanToken`, `isLikelyRole`, `isLikelyCompany`, `isLikelyLocation`, `ROLE_KEYWORDS`, or `DIGEST_SUBJECT_RE` — apply the same change to `tests/parser-shim.js`. Tests will fail if the shim drifts from the real implementation.

## Loading the Extension Locally

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** and select the `deja-applied/` folder
4. Open Gmail — the extension will activate on `mail.google.com`

After making changes to `content.js` or `background.js`, click the refresh icon on the extension card in `chrome://extensions`, then hard-reload Gmail (`Cmd+Shift+R` / `Ctrl+Shift+R`).

## Setting Up OAuth2

The extension requires a Google OAuth2 client ID to call the Gmail API:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Gmail API** under APIs & Services
4. Create an **OAuth 2.0 Client ID** of type **Chrome Extension**, using the extension's ID from `chrome://extensions`
5. Paste the client ID into `manifest.json`:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
   }
   ```

## Making Changes

### Parser logic (`content.js`)

The parser is the heart of the extension. Key functions:

- **`parseLinkedInJobEmail(text)`** — top-level function; runs four strategies in order and returns `{ role, company }` or an array of jobs for digest emails, or `null` if no jobs found
- **`isLikelyRole(str)`** — returns `true` if a string looks like a job title; requires a keyword match from `ROLE_KEYWORDS`
- **`isLikelyCompany(str)`** — returns `true` if a string looks like a company name; accepts capitalised names and lowercase single-word stylised brands (e.g. `plancraft`, `vivenu`)
- **`isLikelyLocation(str)`** — returns `true` if a string looks like a location

When adding a new role keyword to `ROLE_KEYWORDS`, add it to both `content.js` and `tests/parser-shim.js`, and add a corresponding test case in `tests/parser.test.js`.

### Gmail search queries (`background.js`)

Queries live in the `queries` array inside `searchApplicationEmails()`. All queries must:
- Include the company name as a required term
- Include `-subject:"Chat with"` to exclude Google Chat messages
- Keep `maxResults` at 5 or below to avoid slow API responses

### Adding support for a new job platform

Non-LinkedIn platforms (Welcome to the Jungle, Otta, etc.) are not officially supported yet. The recommended approach is a **per-sender parser**: detect the sender domain in `parseLinkedInJobEmail` and run a platform-specific parsing strategy before the generic strategies. Open an issue first to discuss the approach.

## Submitting a Pull Request

1. Fork the repository and create a branch: `git checkout -b fix/my-fix`
2. Make your changes
3. Run `npm test` — all tests must pass
4. If you changed parser logic, update `tests/parser-shim.js` and add test cases
5. Open a PR with a clear description of what changed and why

## Reporting Issues

Please include:
- The sender and subject line of the email that caused the issue (redact personal info)
- What the extension showed vs. what you expected
- Your Chrome version
