// tests/parser.test.js — Déjà Applied
// Unit tests for content.js parser logic
// Run with: npm test

const {
  parseLinkedInJobEmail,
  cleanToken,
  isLikelyRole,
  isLikelyCompany,
  isLikelyLocation,
} = require("./parser-shim");

// Wraps body text with LinkedIn signals so the gate check passes
const liWrap = (body) =>
  `LinkedIn Job Alert\n\n${body}\n\nUnsubscribe · LinkedIn Corporation`;

// ─── cleanToken ───────────────────────────────────────────────────────────────
describe("cleanToken", () => {
  test("trims outer whitespace", () => {
    expect(cleanToken("  Head of Engineering  ")).toBe("Head of Engineering");
  });
  test("collapses internal whitespace", () => {
    expect(cleanToken("Head  of   Engineering")).toBe("Head of Engineering");
  });
  test("strips leading/trailing middot and dashes", () => {
    expect(cleanToken("· Head of Engineering –")).toBe("Head of Engineering");
  });
  test("returns empty string for empty input", () => {
    expect(cleanToken("")).toBe("");
  });
});

// ─── isLikelyRole ─────────────────────────────────────────────────────────────
describe("isLikelyRole", () => {
  test("accepts standard engineering titles", () => {
    expect(isLikelyRole("Head of Engineering")).toBe(true);
    expect(isLikelyRole("Senior Software Engineer")).toBe(true);
    expect(isLikelyRole("VP of Engineering")).toBe(true);
    expect(isLikelyRole("Engineering Manager")).toBe(true);
    expect(isLikelyRole("Director of Product")).toBe(true);
  });
  test("accepts titles with gender/language qualifiers", () => {
    expect(isLikelyRole("Head of Engineering (m/w/d)")).toBe(true);
    expect(isLikelyRole("VP Engineering (CTO-Track) - Remote (Europe)")).toBe(true);
    expect(isLikelyRole("Senior Engineering Manager - Corporate Engineering | Germany | Remote")).toBe(true);
    expect(isLikelyRole("Engineering Manager (f/m/d)")).toBe(true);
  });
  test("rejects strings containing · (company·location lines)", () => {
    expect(isLikelyRole("TargetVideo · Munich (Remote)")).toBe(false);
    expect(isLikelyRole("Grafana Labs · Germany (Remote)")).toBe(false);
    expect(isLikelyRole("plancraft · Hamburg, Germany (Remote)")).toBe(false);
  });
  test("rejects digest/alert boilerplate phrases", () => {
    expect(isLikelyRole("Your job alert for Head of Engineering")).toBe(false);
    expect(isLikelyRole("New jobs in Berlin")).toBe(false);
    expect(isLikelyRole("Jobs similar to Head of Engineering")).toBe(false);
    expect(isLikelyRole("Jobs for you")).toBe(false);
  });
  test("rejects strings that are too short or too long", () => {
    expect(isLikelyRole("SW")).toBe(false);
    expect(isLikelyRole("A".repeat(101))).toBe(false);
  });
  test("rejects plain sentences without role keywords (no ^[A-Z][a-z] fallback)", () => {
    expect(isLikelyRole("Community marketplace for holiday accommodation")).toBe(false);
    expect(isLikelyRole("Privacy Protection")).toBe(false);
    expect(isLikelyRole("Online GP platform and app")).toBe(false);
  });
  test("rejects null/undefined", () => {
    expect(isLikelyRole(null)).toBe(false);
    expect(isLikelyRole(undefined)).toBe(false);
  });
});

// ─── isLikelyCompany ──────────────────────────────────────────────────────────
describe("isLikelyCompany", () => {
  test("accepts standard capitalised company names", () => {
    expect(isLikelyCompany("Grafana Labs")).toBe(true);
    expect(isLikelyCompany("Revolut")).toBe(true);
    expect(isLikelyCompany("KDR Talent Solutions")).toBe(true);
    expect(isLikelyCompany("TargetVideo")).toBe(true);
    expect(isLikelyCompany("Contentsquare")).toBe(true);
  });
  test("accepts lowercase single-word stylised brands", () => {
    expect(isLikelyCompany("plancraft")).toBe(true);
    expect(isLikelyCompany("vivenu")).toBe(true);
    expect(isLikelyCompany("qdrant")).toBe(true);
  });
  test("rejects multi-word lowercase strings (likely sentences)", () => {
    expect(isLikelyCompany("privacy protection software")).toBe(false);
    expect(isLikelyCompany("online gp platform")).toBe(false);
  });
  test("rejects URLs", () => {
    expect(isLikelyCompany("https://careers.company.com")).toBe(false);
  });
  test("rejects strings starting with a digit", () => {
    expect(isLikelyCompany("123 Company")).toBe(false);
  });
  test("rejects CTA / boilerplate openers", () => {
    expect(isLikelyCompany("View all jobs")).toBe(false);
    expect(isLikelyCompany("Apply now")).toBe(false);
    expect(isLikelyCompany("Unsubscribe from this list")).toBe(false);
  });
  test("rejects strings that are too short or too long", () => {
    expect(isLikelyCompany("A")).toBe(false);
    expect(isLikelyCompany("A".repeat(81))).toBe(false);
  });
  test("rejects null/undefined", () => {
    expect(isLikelyCompany(null)).toBe(false);
    expect(isLikelyCompany(undefined)).toBe(false);
  });
});

// ─── isLikelyLocation ─────────────────────────────────────────────────────────
describe("isLikelyLocation", () => {
  test("recognises remote/hybrid/onsite keywords", () => {
    expect(isLikelyLocation("Remote")).toBe(true);
    expect(isLikelyLocation("Hybrid")).toBe(true);
    expect(isLikelyLocation("On-site")).toBe(true);
  });
  test("recognises known cities and countries", () => {
    expect(isLikelyLocation("Berlin, Germany")).toBe(true);
    expect(isLikelyLocation("London")).toBe(true);
    expect(isLikelyLocation("Valencia, Spain")).toBe(true);
    expect(isLikelyLocation("Amsterdam")).toBe(true);
    expect(isLikelyLocation("Hamburg, Germany (Remote)")).toBe(true);
  });
  test("recognises US state abbreviation format", () => {
    expect(isLikelyLocation("Austin, TX")).toBe(true);
    expect(isLikelyLocation("New York, NY")).toBe(true);
  });
  test("rejects non-location strings", () => {
    expect(isLikelyLocation("Head of Engineering")).toBe(false);
    expect(isLikelyLocation("Grafana Labs")).toBe(false);
    expect(isLikelyLocation("Thank you for applying")).toBe(false);
  });
});

// ─── parseLinkedInJobEmail ────────────────────────────────────────────────────
describe("parseLinkedInJobEmail", () => {

  // ── Single-job subject line (Strategy 2) ───────────────────────────────
  describe("single-job subject line", () => {
    beforeEach(() => { global.__mockSubject = "Head of Engineering at Treatwell"; });

    test("parses 'Role at Company' from subject", () => {
      const result = parseLinkedInJobEmail(liWrap("Some body content here."));
      expect(result).toMatchObject({ role: "Head of Engineering", company: "Treatwell" });
    });

    test("does NOT use digest subjects as single-job source", () => {
      global.__mockSubject = "Jobs similar to Head of Engineering (m/w/d) at Recare";
      const result = parseLinkedInJobEmail(liWrap("Some body content here."));
      if (result && !Array.isArray(result)) {
        expect(result.company).not.toBe("Head of Engineering");
      }
    });
  });

  // ── Digest email body parsing (Strategy 1) ─────────────────────────────
  describe("digest email body parsing", () => {
    beforeEach(() => { global.__mockSubject = "Jobs similar to Head of Engineering (m/w/d) at Recare"; });

    test("parses Company · Location format across multiple jobs", () => {
      const body = liWrap(
        "Head of Engineering\nTHRYVE · Germany (Remote)\n\n" +
        "Head of Engineering\nKDR Talent Solutions · Germany (Remote)\n\n" +
        "VP of Engineering (d/f/m)\nvivenu · Germany (Remote)\n"
      );
      const result = parseLinkedInJobEmail(body);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toContainEqual({ role: "Head of Engineering", company: "THRYVE" });
      expect(result).toContainEqual({ role: "Head of Engineering", company: "KDR Talent Solutions" });
      expect(result).toContainEqual({ role: "VP of Engineering (d/f/m)", company: "vivenu" });
    });

    test("parses lowercase single-word brand names (plancraft, vivenu)", () => {
      const body = liWrap(
        "Engineering Manager (f/m/d)\nplancraft · Hamburg, Germany (Remote)\n"
      );
      const result = parseLinkedInJobEmail(body);
      const jobs = Array.isArray(result) ? result : (result ? [result] : []);
      expect(jobs).toContainEqual(
        expect.objectContaining({ role: "Engineering Manager (f/m/d)", company: "plancraft" })
      );
    });

    test("does NOT create backwards company-as-role pairs", () => {
      const body = liWrap(
        "VP Engineering (CTO-Track) - Remote (Europe)\nTargetVideo · Munich (Remote)\n"
      );
      const result = parseLinkedInJobEmail(body);
      const jobs = Array.isArray(result) ? result : (result ? [result] : []);
      jobs.forEach(job => {
        expect(job.role).not.toMatch(/TargetVideo/);
        expect(job.company).not.toBe("Head of Engineering");
      });
    });

    test("deduplicates identical role+company pairs", () => {
      const body = liWrap(
        "Head of Engineering\nTHRYVE · Germany (Remote)\n\n" +
        "Head of Engineering\nTHRYVE · Germany (Remote)\n"
      );
      const result = parseLinkedInJobEmail(body);
      expect(Array.isArray(result)).toBe(true);
      expect(result.filter(j => j.company === "THRYVE")).toHaveLength(1);
    });

    test("handles company and location on separate lines", () => {
      const body = liWrap("Senior Software Engineer\nZalando\nBerlin, Germany\n");
      const result = parseLinkedInJobEmail(body);
      const jobs = Array.isArray(result) ? result : (result ? [result] : []);
      expect(jobs).toContainEqual(
        expect.objectContaining({ role: "Senior Software Engineer", company: "Zalando" })
      );
    });
  });

  // ── Labeled fields (Strategy 4) ────────────────────────────────────────
  describe("labeled fields", () => {
    beforeEach(() => { global.__mockSubject = ""; });

    test("parses explicit Position/Company labels", () => {
      const body = liWrap("Position: Staff Engineer\nCompany: Stripe\n");
      const result = parseLinkedInJobEmail(body);
      expect(result).toMatchObject({ role: "Staff Engineer", company: "Stripe" });
    });
  });

  // ── Non-LinkedIn emails ─────────────────────────────────────────────────
  describe("non-LinkedIn emails", () => {
    beforeEach(() => { global.__mockSubject = "Newsletter"; });

    test("returns null for a plain email with no LinkedIn signal", () => {
      const result = parseLinkedInJobEmail("Hello, here is your newsletter. Thanks!");
      expect(result).toBeNull();
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────
  describe("edge cases", () => {
    test("returns null for empty string", () => {
      expect(parseLinkedInJobEmail("")).toBeNull();
    });
    test("returns null for null", () => {
      expect(parseLinkedInJobEmail(null)).toBeNull();
    });
    test("returns null for very short input", () => {
      expect(parseLinkedInJobEmail("hi")).toBeNull();
    });
  });
});
