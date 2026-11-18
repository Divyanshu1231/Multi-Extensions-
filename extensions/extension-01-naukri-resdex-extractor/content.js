(() => {
  const clean = s => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const visible = e => {
    if (!e || !e.getBoundingClientRect) return false;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
  };
  const text = e => clean(e?.innerText || e?.textContent || "");

  function profileHref(a) {
    const h = a?.getAttribute?.("href") || "";
    return /\/v3\/preview|tabKey=profile|\/v3\/profile/i.test(h) ? h : "";
  }

  function candidateName(a) {
    let s = text(a);
    if (!s || s.length < 2 || s.length > 120) return "";
    s = s.replace(/\s+/g, " ").trim();
    // Profile links can contain extra summary text; prefer the first short line.
    const lines = (a?.innerText || "").split(/\n+/).map(clean).filter(Boolean);
    const good = lines.find(x => x.length >= 2 && x.length <= 80 &&
      !/current|previous|education|key skills|pref\. locations|view phone|call candidate|similar profiles|₹|lacs|yrs?/i.test(x));
    return clean(good || s);
  }

  // Triangle icon: <p title="Profile viewed by you|other on DATE" class="tuple-profile-view-triangle_arrowIcon..."><span class="tuple-profile-view-triangle_triangle..."></span></p>
  function viewedType(tuple) {
    if (!tuple) return "";
    const p = tuple.querySelector('p[title^="Profile viewed by"], [class*="tuple-profile-view-triangle_arrowIcon"][title]');
    const t = (p?.getAttribute("title") || "").toLowerCase();
    if (/viewed by you/.test(t)) return "you";
    if (/viewed by other/.test(t)) return "other";
    if (p || tuple.querySelector('[class*="tuple-profile-view-triangle_triangle"]')) return "other";
    return "";
  }

  // ---- Candidate card details (everything visible on the search-result card) ----
  const LABELS = {
    "current": "Current", "previous": "Previous", "education": "Education",
    "pref. location": "Pref. location", "pref. locations": "Pref. location", "preferred location": "Pref. location",
    "key skills": "Key skills", "may also know": "May also know", "notice period": "Notice period"
  };
  const oneLine = s => clean((s || "").replace(/\n+/g, " | ")).replace(/\s*\|\s*\|\s*/g, " | ").replace(/(\s*\|)?\s*(\.\.\.|…)?\s*more$/i, "").replace(/^\|\s*|\s*\|$/g, "").trim();

  function cardDetails(tuple) {
    const d = {};
    if (!tuple) return d;
    // Overview row: experience / salary / location (icons + short text)
    const ov = tuple.querySelector(".candidate-overview");
    if (ov) {
      const leaves = [...ov.querySelectorAll("*")].filter(e => !e.children.length && text(e));
      for (const e of leaves) {
        const t = text(e);
        if (/₹|lacs?|lakh|\bcr\b|confidential|not disclosed/i.test(t)) d.Salary = d.Salary || t;
        else if (/^\d+\s*y|fresher|^\d+\s*(yrs?|years?)/i.test(t)) d.Experience = d.Experience || t;
        else if (!/^new$/i.test(t)) d.Location = d.Location || t;
      }
    }
    // Label / value rows
    for (const row of tuple.querySelectorAll(".candidate-details .detail, .candidate-details > div")) {
      const lab = row.querySelector("label");
      if (!lab) continue;
      const key = LABELS[text(lab).toLowerCase().replace(/:$/, "")] || text(lab);
      const parts = [...row.querySelectorAll("*")]
        .filter(e => !e.children.length && e !== lab && !lab.contains(e) && text(e) && !/^(\||\.\.\.|…|more|less)$/i.test(text(e)))
        .map(text);
      let val = parts.length ? parts.join(" | ") : oneLine((row.innerText || row.textContent || "").replace(lab.innerText || lab.textContent || "", ""));
      val = val.replace(/\s*\|\s*(\.\.\.|…)$/, "");
      if (val && !d[key]) d[key] = val;
    }
    // Right-section summary ("Jobseeker with ...")
    const rs = tuple.querySelector(".right-section");
    if (rs) {
      const lines = (rs.innerText || "").split(/\n+/).map(clean).filter(Boolean)
        .filter(x => !/view phone number|call candidate|verified phone|^more$/i.test(x));
      const sum = lines.sort((a, b) => b.length - a.length)[0] || "";
      if (sum.length > 20) d["Profile Summary"] = sum;
    }
    return d;
  }

  window.__resdexEmailCandidates = (mode = "both") => {
    const out = [], seen = new Set(), seenTuples = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      if (!visible(a)) continue;
      const href = profileHref(a);
      if (!href) continue;
      const tuple = a.closest("div.tuple, [data-tuple-id]");
      if (mode !== "all") {
        if (!tuple) continue;
        const vt = viewedType(tuple);
        if (!vt) continue;                         // no triangle icon -> skip
        if (mode === "you" && vt !== "you") continue;
        if (mode === "other" && vt !== "other") continue;
      }
      if (tuple) {                                  // one link per candidate card
        if (seenTuples.has(tuple)) continue;
      }
      const r = a.getBoundingClientRect();
      const name = candidateName(a) || `Candidate ${out.length + 1}`;
      const url = new URL(href, location.href).href;
      if (seen.has(url)) continue;
      seen.add(url);
      if (tuple) seenTuples.add(tuple);
      out.push({ name, url, top: r.top + scrollY, viewed: tuple ? viewedType(tuple) : "", details: cardDetails(tuple) });
    }
    return out.sort((a,b) => a.top - b.top);
  };

  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  // Containers that hold the logged-in recruiter/admin info, not the candidate.
  const SHELL_SEL = 'header, nav, footer, [role="banner"], [role="navigation"], [class*="header" i], [class*="navbar" i], [class*="nav-bar" i], [class*="topbar" i], [class*="profile-menu" i], [class*="user-menu" i], [class*="userMenu" i], [class*="account" i], [class*="myNaukri" i], [class*="drawer" i]';

  // All emails visible anywhere on the current page (used on the search page to learn the admin email).
  window.__resdexAllEmails = () => {
    const s = new Set();
    for (const m of (document.documentElement.innerText || "").match(EMAIL_RE) || []) s.add(m.toLowerCase());
    for (const a of document.querySelectorAll('a[href^="mailto:"]')) {
      const m = (a.getAttribute("href") || "").match(/mailto:([^?\s]+)/i);
      if (m) s.add(m[1].toLowerCase());
    }
    return [...s];
  };

  const BAD = /^(example|test|no-reply|noreply)@/i;
  const isIgnored = (e, ignore) => {
    e = e.toLowerCase();
    return BAD.test(e) || (ignore || []).some(x => x && (e === x || (x.startsWith("@") && e.endsWith(x))));
  };

  function extractEmailNow(ignore) {
    const found = [];                                // {email, score}
    const add = (email, el, score) => {
      email = (email || "").trim().replace(/[.,;:)]+$/, "");
      if (!email || isIgnored(email, ignore)) return;
      if (el && el.closest && el.closest(SHELL_SEL)) return;   // admin / header area -> ignore
      found.push({ email, score });
    };

    for (const a of document.querySelectorAll('a[href^="mailto:"]')) {
      const m = (a.getAttribute("href") || "").match(/mailto:([^?\s]+)/i);
      if (m) add(m[1], a, 3);
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue || "";
      if (t.indexOf("@") < 0) continue;
      const el = n.parentElement;
      if (el && /^(script|style|noscript)$/i.test(el.tagName)) continue;
      const near = (el?.parentElement?.innerText || "").slice(0, 120);
      for (const m of t.match(EMAIL_RE) || []) add(m, el, /e-?mail/i.test(near) ? 2 : 1);
    }

    for (const el of document.querySelectorAll("[title],[aria-label],[data-email],[data-value]")) {
      for (const k of ["title", "aria-label", "data-email", "data-value"]) {
        const m = String(el.getAttribute(k) || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (m) add(m[0], el, 1);
      }
    }
    found.sort((a, b) => b.score - a.score);
    return found[0]?.email || "";
  }

  // ---- Phone: click "View phone number", then read the number shown on the button ----
  const PHONE_BTN_RE = /^\+?\d[\d\s-]{8,14}\d\s*(\([A-Za-z]\))?$/;
  function findPhone() {
    for (const el of document.querySelectorAll("button span, button, a span, span")) {
      if (el.children.length > 1) continue;
      const t = clean(el.textContent || "");
      if (t.length < 10 || t.length > 22 || !PHONE_BTN_RE.test(t)) continue;
      if (el.closest(SHELL_SEL)) continue;
      return t.replace(/\s*\([A-Za-z]\)\s*$/, "").replace(/[\s-]/g, "");
    }
    return "";
  }
  function findViewPhoneBtn() {
    for (const el of document.querySelectorAll("button, span, a")) {
      if (el.children.length > 1) continue;
      if (/^view phone number$/i.test(clean(el.textContent || ""))) return el.closest("button") || el;
    }
    return null;
  }
  async function getPhone() {
    let phone = findPhone();
    if (phone) return phone;
    for (let i = 0; i < 10 && !findViewPhoneBtn(); i++) {       // wait for page to render the button
      await new Promise(r => setTimeout(r, 300));
      phone = findPhone();
      if (phone) return phone;
    }
    const btn = findViewPhoneBtn();
    if (!btn) return "";
    btn.scrollIntoView({ block: "center" });
    btn.click();
    for (let i = 0; i < 30; i++) {                                // up to ~9s
      await new Promise(r => setTimeout(r, 300));
      phone = findPhone();
      if (phone) return phone;
    }
    return "";
  }

  window.__resdexExtractEmail = async (ignore = [], wantPhone = true) => {
    ignore = (ignore || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);
    const phone = wantPhone ? await getPhone() : "";
    let email = extractEmailNow(ignore);
    for (let i = 0; i < 30 && !email; i++) {
      await new Promise(r => setTimeout(r, 300));
      email = extractEmailNow(ignore);
    }
    return {
      Name: clean(document.querySelector("h1,h2,[class*='name'],[class*='Name']")?.innerText || document.title || ""),
      Email: email,
      Phone: phone,
      ProfileURL: location.href
    };
  };

  window.__resdexDiagnosticEmail = () => ({
    url: location.href,
    isSearch: /\/v3\/search/i.test(location.pathname),
    profileLinks: document.querySelectorAll('a[href*="/v3/preview"],a[href*="tabKey=profile"],a[href*="/v3/profile"]').length,
    email: extractEmailNow([])
  });
})();
