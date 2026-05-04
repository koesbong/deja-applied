// tests/parser-shim.js — Déjà Applied
//
// Extracts pure parser functions from content.js for Node/Jest testing.
// content.js is a browser content script — it references `document` and
// `chrome` globals. This shim mocks those globals so the parser logic
// can run in Node without a browser.
//
// ⚠️  KEEP IN SYNC WITH content.js
// When you change any of the following functions in content.js, apply
// the same change here:
//   - parseLinkedInJobEmail, cleanToken, isLikelyRole,
//     isLikelyCompany, isLikelyLocation, ROLE_KEYWORDS, DIGEST_SUBJECT_RE

// ── Mock browser globals ──────────────────────────────────────────────────────
global.document = {
  querySelector: () => {
    // Return a fake subject element when tests set global.__mockSubject
    return global.__mockSubject !== undefined
      ? { innerText: global.__mockSubject, getAttribute: () => null }
      : null;
  }
};
global.chrome = {};
global.__mockSubject = "";

// ── Parser implementation (verbatim copy from content.js) ────────────────────

const DIGEST_SUBJECT_RE = /^(jobs similar to|your job alert|new jobs|jobs for you|recommended jobs|new job match|jobs in |top jobs)/i;

function parseLinkedInJobEmail(text) {
  if (!text || text.length < 20) return null;

  const isLinkedIn = /linkedin/i.test(text.substring(0, 800));
  const subjectEl = document.querySelector(".hP");
  const subject = subjectEl?.innerText || "";
  const isLinkedInSubject =
    /linkedin/i.test(subject) ||
    /job.*alert/i.test(subject) ||
    /jobs.*for.*you/i.test(subject) ||
    /recommended.*job/i.test(subject) ||
    /new.*job.*match/i.test(subject) ||
    /jobs similar to/i.test(subject);

  if (!isLinkedIn && !isLinkedInSubject) return null;

  const isDigestSubject = DIGEST_SUBJECT_RE.test(subject.trim());

  // Strategy 1: body digest
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  const allJobs = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    if (!isLikelyRole(line)) continue;

    const companyLocationMatch = nextLine.match(/^([A-Za-z][^·\n]{1,80}?)\s*·\s*(.+)$/);
    if (companyLocationMatch) {
      const company = cleanToken(companyLocationMatch[1]);
      if (isLikelyCompany(company)) {
        allJobs.push({ role: cleanToken(line), company });
        continue;
      }
    }

    if (isLikelyCompany(nextLine)) {
      const afterCompany = lines[i + 2] || "";
      if (isLikelyLocation(afterCompany) || /\d+ (day|hour|week|month)s? ago/i.test(afterCompany)) {
        allJobs.push({ role: cleanToken(line), company: cleanToken(nextLine) });
        continue;
      }
    }
  }

  if (allJobs.length > 0) {
    const seen = new Set();
    return allJobs.filter(job => {
      const key = `${job.role}__${job.company}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Strategy 2: subject line (single-job only, never digest)
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

  // Strategy 3: "Role at Company" in body
  const bodyMatch = text.match(/^(.{2,80}?)\s+at\s+([A-Z][^\n]{2,60}?)(?:\s*[\n\r·•|,]|$)/m);
  if (bodyMatch) {
    const role = cleanToken(bodyMatch[1]);
    const company = cleanToken(bodyMatch[2]);
    if (isLikelyRole(role) && isLikelyCompany(company)) return { role, company };
  }

  // Strategy 4: labeled fields
  const positionMatch = text.match(/(?:position|job title|role)[:\s]+([^\n]{3,80})/i);
  const companyMatch  = text.match(/(?:company|employer|organisation|organization)[:\s]+([^\n]{2,60})/i);
  if (positionMatch && companyMatch) {
    return { role: cleanToken(positionMatch[1]), company: cleanToken(companyMatch[1]) };
  }

  return null;
}

function cleanToken(str) {
  return str.replace(/\s+/g, " ").replace(/^[\s·•\-–—,]+|[\s·•\-–—,]+$/g, "").trim();
}

const ROLE_KEYWORDS = [
  "engineer","developer","manager","designer","analyst","scientist","architect",
  "lead","director","coordinator","specialist","consultant","officer","associate",
  "intern","head of","VP","president","product","marketing","sales","operations",
  "finance","data","software","frontend","backend","fullstack","full-stack",
  "mobile","ios","android","devops","sre","qa","security","cloud",
  "infrastructure","research","growth","recruiter","platform engineer","platform lead"
];

function isLikelyRole(str) {
  if (!str || str.length < 3 || str.length > 100) return false;
  if (/[·]/.test(str)) return false;
  if (/^(your job alert|new jobs|jobs in|new job match|match your|jobs similar|jobs for you)/i.test(str)) return false;
  const lower = str.toLowerCase();
  return ROLE_KEYWORDS.some(k => lower.includes(k));
}

function isLikelyCompany(str) {
  if (!str || str.length < 2 || str.length > 80) return false;
  if (/^https?:\/\//.test(str)) return false;
  if (/^\d/.test(str)) return false;
  if (/^(view|apply|click|see|check|update|unsubscribe|follow|actively|easy|new jobs|your job|jobs in|match your|new job|jobs similar|jobs for)/i.test(str)) return false;
  return /^[A-Z]/.test(str) || /^[a-z][a-zA-Z0-9]+$/.test(str);
}

function isLikelyLocation(str) {
  return /\b(remote|hybrid|on.?site|new york|san francisco|london|berlin|paris|madrid|barcelona|valencia|amsterdam|toronto|sydney|singapore|bangalore|india|usa|uk|canada|australia|spain|france|germany|finland|espoo|helsinki|emea)\b/i.test(str) ||
    /,\s*[A-Z]{2}$/.test(str);
}

module.exports = {
  parseLinkedInJobEmail,
  cleanToken,
  isLikelyRole,
  isLikelyCompany,
  isLikelyLocation,
};
