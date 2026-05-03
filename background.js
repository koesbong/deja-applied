// background.js — Déjà Applied
// Service worker: OAuth2 token management and Gmail API calls

const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";

async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

async function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

async function gmailFetch(endpoint, token) {
  const resp = await fetch(`${GMAIL_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (resp.status === 401) {
    await removeCachedToken(token);
    throw new Error("TOKEN_EXPIRED");
  }
  if (!resp.ok) throw new Error(`Gmail API error: ${resp.status}`);
  return resp.json();
}

async function searchApplicationEmails(company, role, token) {
  const companyClean = company.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const roleClean = role ? role.replace(/[^a-zA-Z0-9 ]/g, "").trim() : "";

  const queries = [];
  if (companyClean) {
    queries.push(
      `subject:("${companyClean}") subject:(application OR applied OR "thank you for applying" OR "we received" OR "we got your application")`
    );
    queries.push(
      `("${companyClean}") ("thank you for applying" OR "application received" OR "we received your application" OR "successfully applied" OR "your application has been" OR "application submitted")`
    );
    if (roleClean) {
      queries.push(
        `subject:("${companyClean}") subject:("${roleClean.substring(0, 40)}")`
      );
    }
  }

  const allResults = [];
  const seenIds = new Set();

  for (const q of queries) {
    try {
      const data = await gmailFetch(`/messages?q=${encodeURIComponent(q)}&maxResults=5`, token);
      if (!data.messages || data.messages.length === 0) continue;

      for (const msg of data.messages) {
        if (seenIds.has(msg.id)) continue;
        seenIds.add(msg.id);

        const detail = await gmailFetch(
          `/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          token
        );
        const headers = detail.payload?.headers || [];
        const subject = headers.find(h => h.name === "Subject")?.value || "(no subject)";
        const from = headers.find(h => h.name === "From")?.value || "";
        const date = headers.find(h => h.name === "Date")?.value || "";

        allResults.push({
          id: msg.id,
          subject,
          from,
          date: formatDate(date),
          snippet: detail.snippet || ""
        });
      }
    } catch (err) {
      if (err.message === "TOKEN_EXPIRED") throw err;
      console.warn("[Déjà Applied] Query failed:", q, err);
    }
  }
  return allResults;
}

function formatDate(rawDate) {
  if (!rawDate) return "";
  try {
    return new Date(rawDate).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric"
    });
  } catch { return rawDate; }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_APPLICATION") {
    handleCheckApplication(message.company, message.role)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === "GET_AUTH_STATUS") {
    getAuthToken(false)
      .then(token => sendResponse({ authenticated: !!token }))
      .catch(() => sendResponse({ authenticated: false }));
    return true;
  }
  if (message.type === "SIGN_IN") {
    getAuthToken(true)
      .then(token => sendResponse({ success: !!token }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === "SIGN_OUT") {
    getAuthToken(false)
      .then(token => { if (token) return removeCachedToken(token); })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: true }));
    return true;
  }
});

async function handleCheckApplication(company, role) {
  let token;
  try {
    token = await getAuthToken(false);
  } catch {
    return { needsAuth: true, results: [] };
  }
  if (!token) return { needsAuth: true, results: [] };

  try {
    const results = await searchApplicationEmails(company, role, token);
    return { needsAuth: false, results };
  } catch (err) {
    if (err.message === "TOKEN_EXPIRED") return { needsAuth: true, results: [] };
    throw err;
  }
}
