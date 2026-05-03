// content.js — Déjà Applied
// Gmail content script: watches for email opens, parses LinkedIn job emails, shows overlay

const OVERLAY_ID = "deja-applied-overlay";
let lastCheckedMessageId = null;
let checkTimeout = null;

const observer = new MutationObserver(() => {
  clearTimeout(checkTimeout);
  checkTimeout = setTimeout(detectAndCheck, 600);
});
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(detectAndCheck, 1500);

// ── Email Detection ───────────────────────────────────────────────────────────

function detectAndCheck() {
  const emailContainer = findOpenEmail();
  if (!emailContainer) { removeOverlay(); return; }

  const messageId = getMessageId(emailContainer);
  if (messageId && messageId === lastCheckedMessageId) return;

  const emailText = extractEmailText(emailContainer);
  if (!emailText) return;

  const parsed = parseLinkedInJobEmail(emailText);
  if (!parsed) { removeOverlay(); lastCheckedMessageId = messageId; return; }

  const jobs = Array.isArray(parsed) ? parsed : [parsed];

  lastCheckedMessageId = messageId;
  showLoadingOverlay(jobs);
  triggerBackgroundCheckAll(jobs);
}

function findOpenEmail() {
  return (
    document.querySelector('[data-message-id]') ||
    document.querySelector('.a3s.aiL') ||
    document.querySelector('.gs .ii.gt') ||
    null
  );
}

function getMessageId(container) {
  let el = container;
  for (let i = 0; i < 10; i++) {
    if (!el) break;
    const id = el.getAttribute?.("data-message-id");
    if (id) return id;
    el = el.parentElement;
  }
  const match = window.location.hash.match(/#[^/]+\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function extractEmailText(container) {
  const bodyEl =
    container.closest?.(".a3s") ||
    container.querySelector?.(".a3s") ||
    container.querySelector?.(".ii.gt") ||
    container;
  if (!bodyEl) return null;
  return bodyEl.innerText || bodyEl.textContent || "";
}

// ── LinkedIn Email Parser ─────────────────────────────────────────────────────

// Subject patterns that indicate a digest/alert — never use subject as role+company source
const DIGEST_SUBJECT_RE = /^(jobs similar to|your job alert|new jobs|jobs for you|recommended jobs|new job match|jobs in |top jobs)/i;

function parseLinkedInJobEmail(text) {
  if (!text || text.length < 20) return null;

  const isLinkedIn = /linkedin/i.test(text.substring(0, 800));
  const fromEl = document.querySelector('.gD, [email*="linkedin"]');
  const fromEmail = fromEl?.getAttribute("email") || fromEl?.innerText || "";
  const isLinkedInSender = /linkedin/i.test(fromEmail);
  const subjectEl = document.querySelector('h2[data-legacy-thread-id], .hP');
  const subject = subjectEl?.innerText || "";
  const isLinkedInSubject =
    /linkedin/i.test(subject) ||
    /job.*alert/i.test(subject) ||
    /jobs.*for.*you/i.test(subject) ||
    /recommended.*job/i.test(subject) ||
    /new.*job.*match/i.test(subject) ||
    /jobs similar to/i.test(subject);

  if (!isLinkedIn && !isLinkedInSender && !isLinkedInSubject) return null;

  const isDigestSubject = DIGEST_SUBJECT_RE.test(subject.trim());

  // Strategy 1: Body digest — parse ALL visible job cards first.
  // Always run this for digest emails; also run for single-job emails in case body has better data.
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  const allJobs = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    if (!isLikelyRole(line)) continue;

    // Format: "Company · Location" on next line
    const companyLocationMatch = nextLine.match(/^([A-Z][^·\n]{2,80}?)\s*·\s*(.+)$/);
    if (companyLocationMatch) {
      const company = cleanToken(companyLocationMatch[1]);
      if (isLikelyCompany(company)) {
        allJobs.push({ role: cleanToken(line), company });
        continue;
      }
    }

    // Format: company and location on separate lines
    if (isLikelyCompany(nextLine)) {
      const afterCompany = lines[i + 2] || "";
      if (isLikelyLocation(afterCompany) || /\d+ (day|hour|week|month)s? ago/i.test(afterCompany)) {
        allJobs.push({ role: cleanToken(line), company: cleanToken(nextLine) });
        continue;
      }
    }
  }

  if (allJobs.length > 0) {
    // Deduplicate
    const seen = new Set();
    return allJobs.filter(job => {
      const key = `${job.role}__${job.company}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Strategy 2: Subject line — ONLY for single-job subjects, never for digest/alert subjects
  if (!isDigestSubject) {
    for (const pat of [
      /^(.{2,80}?)\s+at\s+([A-Z][^\-–—·\n]{2,60}?)(?:\s*[-–—·\n]|$)/,
      /^(.{2,80}?)\s+@\s+([A-Z][^\-–—·\n]{2,60}?)(?:\s*[-–—·\n]|$)/
    ]) {
      const m = subject.match(pat);
      if (m) {
        const role = cleanToken(m[1]);
        const company = cleanToken(m[2]);
        if (isLikelyRole(role) && isLikelyCompany(company)) return { role, company };
      }
    }
  }

  // Strategy 3: "Role at Company" anywhere in body
  const bodyMatch = text.match(/^(.{2,80}?)\s+at\s+([A-Z][^\n]{2,60}?)(?:\s*[\n\r·•|,]|$)/m);
  if (bodyMatch) {
    const role = cleanToken(bodyMatch[1]);
    const company = cleanToken(bodyMatch[2]);
    if (isLikelyRole(role) && isLikelyCompany(company)) return { role, company };
  }

  // Strategy 4: Labeled fields
  const positionMatch = text.match(/(?:position|job title|role)[:\s]+([^\n]{3,80})/i);
  const companyMatch = text.match(/(?:company|employer|organisation|organization)[:\s]+([^\n]{2,60})/i);
  if (positionMatch && companyMatch) {
    return { role: cleanToken(positionMatch[1]), company: cleanToken(companyMatch[1]) };
  }

  return null;
}

// ── Parser Helpers ────────────────────────────────────────────────────────────

function cleanToken(str) {
  return str.replace(/\s+/g, " ").replace(/^[\s·•\-–—,]+|[\s·•\-–—,]+$/g, "").trim();
}

const ROLE_KEYWORDS = [
  "engineer","developer","manager","designer","analyst","scientist","architect",
  "lead","director","coordinator","specialist","consultant","officer","associate",
  "intern","head of","VP","president","product","marketing","sales","operations",
  "finance","data","software","frontend","backend","fullstack","full-stack",
  "mobile","ios","android","devops","sre","qa","security","cloud","platform",
  "infrastructure","research","growth","recruiter"
];

function isLikelyRole(str) {
  if (!str || str.length < 3 || str.length > 100) return false;
  if (/^(your job alert|new jobs|jobs in|new job match|match your|jobs similar|jobs for you)/i.test(str)) return false;
  const lower = str.toLowerCase();
  return ROLE_KEYWORDS.some(k => lower.includes(k)) || /^[A-Z][a-z]/.test(str);
}

function isLikelyCompany(str) {
  if (!str || str.length < 2 || str.length > 80) return false;
  if (/^https?:\/\//.test(str)) return false;
  if (/^\d/.test(str)) return false;
  if (/^(view|apply|click|see|check|update|unsubscribe|follow|actively|easy|new jobs|your job|jobs in|match your|new job|jobs similar|jobs for)/i.test(str)) return false;
  return /^[A-Z]/.test(str);
}

function isLikelyLocation(str) {
  return /\b(remote|hybrid|on.?site|new york|san francisco|london|berlin|paris|madrid|barcelona|valencia|amsterdam|toronto|sydney|singapore|bangalore|india|usa|uk|canada|australia|spain|france|germany|finland|espoo|helsinki|emea)\b/i.test(str) ||
    /,\s*[A-Z]{2}$/.test(str);
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function showLoadingOverlay(jobs) {
  removeOverlay();
  const count = jobs.length;
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="da-header">
      <span class="da-icon">🔍</span>
      <div class="da-title-group">
        <span class="da-title">Déjà Applied</span>
        <span class="da-meta">Checking ${count} job${count > 1 ? "s" : ""}…</span>
      </div>
      <button class="da-close" title="Close">✕</button>
    </div>
    <div class="da-body">
      <div class="da-loading">
        <span class="da-spinner"></span>
        Searching your Gmail…
      </div>
    </div>
  `;
  overlay.querySelector(".da-close").onclick = removeOverlay;
  document.body.appendChild(overlay);
}

function showMultiResultsOverlay(jobs, hits, error) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  let bodyHtml = "";
  if (error === "needsAuth") {
    bodyHtml = `
      <div class="da-auth-prompt">
        <p>Sign in with Google to search your Gmail for prior applications.</p>
        <button class="da-btn da-btn-primary" id="da-signin-btn">Sign in with Google</button>
      </div>`;
  } else if (error) {
    bodyHtml = `<div class="da-error">⚠️ ${escHtml(error)}</div>`;
  } else if (hits.length === 0) {
    bodyHtml = `
      <div class="da-no-results">
        <span class="da-check-icon">✅</span>
        <span>No prior applications found across ${jobs.length} job${jobs.length > 1 ? "s" : ""} in this email.</span>
      </div>`;
  } else {
    bodyHtml = hits.map(({ job, results }) => `
      <div class="da-found-badge">⚠️ ${escHtml(job.role)} at ${escHtml(job.company)}</div>
      <ul class="da-results-list">
        ${results.map(r => `
          <li class="da-result-item">
            <div class="da-result-subject">${escHtml(r.subject)}</div>
            <div class="da-result-meta">
              <span class="da-result-from">${escHtml(truncate(r.from, 40))}</span>
              <span class="da-result-date">${escHtml(r.date)}</span>
            </div>
            ${r.snippet ? `<div class="da-result-snippet">${escHtml(truncate(r.snippet, 120))}</div>` : ""}
          </li>`).join("")}
      </ul>`).join("");
  }

  overlay.querySelector(".da-body").innerHTML = bodyHtml;

  const signInBtn = overlay.querySelector("#da-signin-btn");
  if (signInBtn) {
    signInBtn.onclick = () => {
      chrome.runtime.sendMessage({ type: "SIGN_IN" }, (resp) => {
        if (resp?.success) { showLoadingOverlay(jobs); triggerBackgroundCheckAll(jobs); }
        else showMultiResultsOverlay(jobs, [], "Sign-in failed. Please try again.");
      });
    };
  }
}

function removeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

// ── Background Communication ──────────────────────────────────────────────────

function triggerBackgroundCheckAll(jobs) {
  if (!jobs.length) return;

  chrome.runtime.sendMessage({ type: "CHECK_APPLICATION", company: jobs[0].company, role: jobs[0].role }, (firstResp) => {
    if (chrome.runtime.lastError) { showMultiResultsOverlay(jobs, [], "Extension error. Try reloading Gmail."); return; }
    if (!firstResp?.success) { showMultiResultsOverlay(jobs, [], firstResp?.error || "Unknown error"); return; }
    if (firstResp.needsAuth) { showMultiResultsOverlay(jobs, [], "needsAuth"); return; }

    const remaining = jobs.slice(1).map(j =>
      new Promise(resolve => {
        chrome.runtime.sendMessage({ type: "CHECK_APPLICATION", company: j.company, role: j.role }, (resp) => {
          resolve({ job: j, results: resp?.results || [] });
        });
      })
    );

    Promise.all(remaining).then(restResults => {
      const allHits = [
        { job: jobs[0], results: firstResp.results || [] },
        ...restResults
      ].filter(r => r.results.length > 0);

      showMultiResultsOverlay(jobs, allHits, null);
    });
  });
}

function escHtml(str) {
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.substring(0, max) + "…";
}
