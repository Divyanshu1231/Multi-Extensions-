(function () {
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  function cleanCandidateName(value) {
    let x = clean(value);
    // Remove common Shine availability/status labels if they were appended to a name.
    x = x.replace(/\s*\b(?:Open\s+to\s+Contractual|Open\s+to\s+Work|Actively\s+Looking|Immediately\s+Available)\b.*$/i, "").trim();
    x = x.replace(/\s*\b(?:View\s+Profile|View\s+Resume|Branded\s+CV|Your\s+Branded\s+CV)\b.*$/i, "").trim();
    return x;
  }

  function valueOf(selector) {
    const el = document.querySelector(selector);
    if (!el) return "";
    return clean(el.value ?? el.getAttribute("value") ?? el.textContent);
  }

  function isValidEmail(value) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || "").trim());
  }

  function findEmail() {
    const selectors = [
      "#candidate_email",
      "input[type='email']",
      "input[id*='email' i]",
      "input[name*='email' i]",
      "[data-email]",
      "a[href^='mailto:']"
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const value = clean(el.value || el.getAttribute("value") || el.getAttribute("data-email") || el.getAttribute("href")?.replace(/^mailto:/i, "") || el.textContent);
        if (isValidEmail(value)) return value;
      }
    }
    // Search visible profile text only as a fallback; do not inspect scripts/styles.
    const text = document.body?.innerText || "";
    const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0] : "";
  }

  function findMobile() {
    const selectors = [
      "#id_mobile_num", "input[name='mobile_num']", "input[name='mobile']",
      "input[id*='mobile' i]", "input[id*='phone' i]", "input[name*='phone' i]",
      "[data-mobile]", "[data-phone]"
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const value = clean(el.value || el.getAttribute("value") || el.getAttribute("data-mobile") || el.getAttribute("data-phone") || el.textContent);
        const digits = value.replace(/\D/g, "");
        if (digits.length >= 7 && digits.length <= 15 && value !== "1") return value;
      }
    }
    const text = document.body?.innerText || "";
    const matches = text.match(/(?:\+?91[\s-]?)?[6-9]\d(?:[\s-]?\d){8,9}/g) || [];
    return matches.find((value) => value.replace(/\D/g, "").length >= 10) || "";
  }

  function findName() {
    const selectors = [
      "#candidate_name", "input[name='candidate_name']", "input[id*='candidate_name' i]",
      "[data-candidate-name]", "#profile-root h1", ".profile_top h1", ".profile_base h1",
      "#profile-root [class*='name' i]", ".profile_top [class*='name' i]", ".profile_base [class*='name' i]"
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const value = cleanCandidateName(el.value || el.getAttribute("value") || el.getAttribute("data-candidate-name") || el.textContent);
        if (value && value.length > 2 && value.length < 120 && !/branded cv|your branded|view profile|view resume/i.test(value)) return value;
      }
    }
    return "";
  }

  function scanList() {
    const out = [];
    const seenUrls = new Set();
    const seenNames = new Set();
    const links = document.querySelectorAll("a[href*='/recruiter/search/profile/']");

    for (const link of links) {
      const href = link.getAttribute("href");
      if (!href) continue;
      const url = new URL(href, location.href).href;
      if (seenUrls.has(url)) continue;

      const card = link.closest("article, li, [class*='candidate' i], [class*='profile' i], [class*='result' i] ");
      const candidates = [
        card?.querySelector("h1,h2,h3,h4,[class*='candidate-name' i],[class*='profile-name' i],[class*='name' i]"),
        link.querySelector("h1,h2,h3,h4,[class*='name' i]"),
        link
      ].filter(Boolean);
      let name = "";
      for (const el of candidates) {
        const candidate = cleanCandidateName(el.getAttribute("data-candidate-name") || el.textContent);
        if (candidate && candidate.length > 2 && candidate.length < 120 && !/view profile|view resume|download|contact|shortlist|branded cv/i.test(candidate)) {
          name = candidate;
          break;
        }
      }
      // Some result cards store the candidate name in attributes.
      if (!name && card) {
        const attrEl = card.querySelector("[data-candidate-name]");
        if (attrEl) name = cleanCandidateName(attrEl.getAttribute("data-candidate-name"));
      }
      if (!name) continue;

      const normalized = name.toLowerCase().replace(/^(dr|mr|mrs|ms|miss|prof|md)\.?\s+/i, "").replace(/[^a-z0-9]+/g, "");
      if (!normalized || seenNames.has(normalized)) continue;
      seenUrls.add(url);
      seenNames.add(normalized);
      out.push({ url, name });
    }
    return out;
  }

  function extractProfile() {
    return {
      isProfile: /\/recruiter\/search\/profile\//i.test(location.pathname),
      name: findName(),
      email: findEmail(),
      mobile: findMobile()
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SCAN_LIST") sendResponse({ profiles: scanList() });
    else if (message.type === "EXTRACT_PROFILE") sendResponse(extractProfile());
    return true;
  });
})();
