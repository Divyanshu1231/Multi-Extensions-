let state = {
  running: false, phase: "idle", tabId: null, listUrl: null,
  profiles: [], queue: [], index: 0, results: [], airtable: [],
  unmatched: [], matchSummary: null, error: ""
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function save() { await chrome.storage.local.set({ shineScraperState: state }); }
async function load() {
  const stored = await chrome.storage.local.get("shineScraperState");
  if (stored.shineScraperState) state = { ...state, ...stored.shineScraperState };
}
const ready = load();

function statusText() {
  const airtableCount = state.airtable.length;
  const total = state.profiles.length;
  const contacts = state.results.filter((row) => row.status !== "MATCHED_SKIP").length;
  const matched = state.results.filter((row) => row.status === "MATCHED_SKIP").length;
  if (state.running) {
    if (state.phase === "names") return `Phase 1/3: Scanning candidate names\nCandidates found: ${total}\nAirtable records: ${airtableCount}`;
    if (state.phase === "matching") return `Phase 2/3: Matching names\nCandidates found: ${total}\nAirtable records: ${airtableCount}`;
    return `Phase 3/3: Opening unmatched profiles\nProgress: ${Math.min(state.index, state.queue.length)}/${state.queue.length}\nMatched and skipped: ${matched}\nUnmatched profiles processed: ${contacts}`;
  }
  if (state.error) return `${state.error}\n\nAirtable records: ${airtableCount}\nCandidates found: ${total}`;
  if (state.matchSummary) return `Completed.\nCandidates found: ${state.matchSummary.total}\nMatched and skipped: ${state.matchSummary.matched}\nUnmatched profiles processed: ${state.matchSummary.unmatched}\nContact found: ${state.matchSummary.withContact}\nAirtable records: ${airtableCount}\n\nClick Export Unmatched CSV.`;
  return `Ready.\nUpload Airtable CSV first.\nAirtable records: ${airtableCount}\nCandidates found: ${total}`;
}

async function sendToTab(message) {
  if (state.tabId == null) return null;
  try { return await chrome.tabs.sendMessage(state.tabId, message); } catch { return null; }
}

async function waitLoaded(tabId, timeout = 18000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") setTimeout(finish, 500);
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(finish, timeout);
  });
}

function cleanCandidateDisplayName(value) {
  return String(value || "")
    .replace(/\s+/g, " ").trim()
    .replace(/\s*\b(?:Open\s+to\s+Contractual|Open\s+to\s+Work|Actively\s+Looking|Immediately\s+Available)\b.*$/i, "")
    .replace(/\s*\b(?:View\s+Profile|View\s+Resume|Branded\s+CV|Your\s+Branded\s+CV)\b.*$/i, "").trim();
}

function normName(value) {
  let name = cleanCandidateDisplayName(value).toLowerCase().trim();
  name = name.replace(/^(dr|mr|mrs|ms|miss|prof|md)\.?\s+/i, "");
  name = name.replace(/\b(?:open\s+to\s+contractual|open\s+to\s+work|actively\s+looking|immediately\s+available|branded\s+cv|your\s+branded\s+cv)\b.*$/i, "");
  return name.replace(/[^a-z0-9]+/g, "");
}

function cleanHeader(header) {
  return String(header || "").toLowerCase().trim().replace(/[\s_\-]+/g, "").replace(/[^\w]/g, "");
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  text = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(cleanHeader);
  return rows.slice(1).filter((values) => values.some((value) => String(value).trim())).map((values) => {
    const record = {};
    headers.forEach((header, index) => { record[header] = String(values[index] ?? "").trim(); });
    return record;
  });
}

function findField(record, type) {
  const keys = Object.keys(record || {});
  const candidates = {
    name: ["name", "fullname", "candidatename", "contactname", "applicantname", "doctorname", "employeename"],
    email: ["email", "emailaddress", "mail", "candidateemail"],
    mobile: ["mobile", "mobileno", "mobilenumber", "phone", "phonenumber", "contactnumber", "contactno", "number"]
  }[type] || [];
  for (const candidate of candidates) {
    const key = keys.find((item) => item === candidate || item.includes(candidate));
    if (key && record[key]) return record[key];
  }
  return "";
}

function findAirtableNameSet() {
  const names = new Set();
  for (const record of state.airtable) {
    const name = normName(findField(record, "name"));
    if (name) names.add(name);
  }
  return names;
}

function csvEscape(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function csv(rows, headers) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\r\n");
}
async function downloadCsv(filename, text) {
  const url = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(text);
  await chrome.downloads.download({ url, filename, saveAs: true });
}

async function importAirtable(raw, filename) {
  const rows = parseCSV(raw);
  if (!rows.length) return { text: "Could not read Airtable CSV. Please upload the exported CSV again." };
  if (!rows.some((row) => findField(row, "name"))) return { text: "CSV loaded but no candidate name column was detected. Use a column such as Name, Full Name, Candidate Name or Applicant Name." };
  state.airtable = rows;
  state.profiles = []; state.queue = []; state.index = 0; state.results = []; state.unmatched = []; state.matchSummary = null; state.error = "";
  await save();
  return { text: `Airtable CSV loaded: ${rows.length} records\nFile: ${filename}\nReady to scan Shine names first.` };
}

async function start() {
  if (!state.airtable.length) {
    state.error = "Upload the Airtable CSV first, then click Start Current Page.";
    await save();
    return { text: statusText() };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https:\/\/(www\.)?shine\.com\//i.test(tab.url) && !/^https:\/\/recruiter\.shine\.com\//i.test(tab.url)) {
    state.error = "Open the Shine recruiter candidate-search results page first.";
    await save(); return { text: statusText() };
  }
  state.running = true; state.phase = "names"; state.tabId = tab.id; state.listUrl = tab.url;
  state.profiles = []; state.queue = []; state.index = 0; state.results = []; state.unmatched = []; state.matchSummary = null; state.error = "";
  await save();

  const scan = await sendToTab({ type: "SCAN_LIST" });
  if (!scan?.profiles?.length) {
    state.running = false;
    state.error = "No candidate names/profile links found. Refresh Shine, scroll to load candidate results, and try again.";
    await save(); return { text: statusText() };
  }

  // Phase 1: only names and profile URLs are read from the search results page.
  const airtableNames = findAirtableNameSet();
  const seen = new Set();
  state.profiles = scan.profiles.map((profile) => ({ ...profile, name: cleanCandidateDisplayName(profile.name) }))
    .filter((profile) => {
      const normalized = normName(profile.name);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized); return true;
    });

  // Phase 2: exact normalized-name match. Matched candidates never have their profile opened.
  state.phase = "matching";
  state.results = state.profiles.map((profile) => {
    const name = cleanCandidateDisplayName(profile.name);
    const matched = airtableNames.has(normName(name));
    return { name, email: "", mobile: "", profile_url: profile.url, status: matched ? "MATCHED_SKIP" : "PENDING_CONTACT", match_result: matched ? "MATCHED" : "UNMATCHED" };
  });
  state.queue = state.results.map((result, index) => ({ result, index })).filter((item) => item.result.status === "PENDING_CONTACT");
  await save();

  if (!state.queue.length) {
    state.running = false;
    state.matchSummary = { total: state.profiles.length, matched: state.profiles.length, unmatched: 0, withContact: 0 };
    await save(); return { text: statusText() };
  }
  state.phase = "contacts";
  await save();
  processNext();
  return { text: statusText() };
}

async function processNext() {
  if (!state.running) return;
  if (state.index >= state.queue.length) {
    state.running = false;
    const matched = state.results.filter((row) => row.status === "MATCHED_SKIP").length;
    const unmatchedRows = state.results.filter((row) => row.match_result === "UNMATCHED");
    state.unmatched = unmatchedRows.map((row) => ({
      Name: row.name, Email: row.email, Mobile: row.mobile,
      "Profile URL": row.profile_url, Status: row.status,
      "Match Result": "UNMATCHED"
    }));
    state.matchSummary = {
      total: state.profiles.length, matched,
      unmatched: unmatchedRows.length,
      withContact: unmatchedRows.filter((row) => row.email || row.mobile).length
    };
    await save(); return;
  }

  const item = state.queue[state.index];
  const profile = item.result;
  try {
    await chrome.tabs.update(state.tabId, { url: profile.profile_url });
    await waitLoaded(state.tabId);
    await sleep(1200);
    let extracted = null;
    for (let attempt = 0; attempt < 10 && state.running; attempt++) {
      extracted = await sendToTab({ type: "EXTRACT_PROFILE" });
      if (extracted?.isProfile && (extracted.email || extracted.mobile || extracted.name)) break;
      await sleep(500);
    }
    profile.name = cleanCandidateDisplayName(extracted?.name || profile.name);
    profile.email = extracted?.email || "";
    profile.mobile = extracted?.mobile || "";
    profile.status = profile.email || profile.mobile ? "CONTACT_FOUND" : "NO_CONTACT_FOUND";
  } catch (error) {
    profile.status = "PROFILE_ERROR";
  }

  state.index++;
  await save();
  try {
    await chrome.tabs.update(state.tabId, { url: state.listUrl });
    await waitLoaded(state.tabId);
  } catch (error) { /* Keep processing even if the list page cannot be restored. */ }
  if (state.running) setTimeout(processNext, 500);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ready;
    if (message.type === "START") return sendResponse(await start());
    if (message.type === "STOP") { state.running = false; await save(); return sendResponse({ text: "Stopped. Completed results are preserved." }); }
    if (message.type === "GET_STATUS") return sendResponse({ text: statusText() });
    if (message.type === "IMPORT_AIRTABLE_CSV") return sendResponse(await importAirtable(message.csv, message.filename || "Airtable.csv"));
    if (message.type === "MATCH") {
      if (!state.airtable.length) return sendResponse({ text: "Upload the Airtable CSV first." });
      if (!state.profiles.length) return sendResponse({ text: "Click Start Current Page on the Shine candidate results page first." });
      return sendResponse({ text: "Matching is part of Start Current Page now. Matched candidates are skipped automatically." });
    }
    if (message.type === "EXPORT_SCRAPED") {
      const rows = state.results.filter((row) => row.match_result === "UNMATCHED").map((row) => ({
        Name: row.name, Email: row.email, Mobile: row.mobile,
        "Profile URL": row.profile_url, Status: row.status
      }));
      await downloadCsv("shine_unmatched_contacts.csv", csv(rows, ["Name", "Email", "Mobile", "Profile URL", "Status"]));
      return sendResponse({ text: `Unmatched contacts CSV exported: ${rows.length} records.` });
    }
    if (message.type === "EXPORT_UNMATCHED") {
      if (state.running) return sendResponse({ text: "Scraping is still running. Export after it completes." });
      const rows = state.unmatched.length ? state.unmatched : state.results.filter((row) => row.match_result === "UNMATCHED").map((row) => ({
        Name: row.name, Email: row.email, Mobile: row.mobile,
        "Profile URL": row.profile_url, Status: row.status, "Match Result": "UNMATCHED"
      }));
      await downloadCsv("shine_unmatched_candidates.csv", csv(rows, ["Name", "Email", "Mobile", "Profile URL", "Status", "Match Result"]));
      return sendResponse({ text: `Unmatched CSV exported: ${rows.length} records.` });
    }
    if (message.type === "CLEAR") {
      state = { running: false, phase: "idle", tabId: null, listUrl: null, profiles: [], queue: [], index: 0, results: [], airtable: [], unmatched: [], matchSummary: null, error: "" };
      await save(); return sendResponse({ text: "Airtable data and scraped results cleared." });
    }
  })().catch((error) => sendResponse({ text: `Error: ${error?.message || error}` }));
  return true;
});
