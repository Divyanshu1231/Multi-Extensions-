"use strict";

const STORAGE_KEY = "shine_candidates";
const SETTINGS_KEY = "doubletick_settings";

// Pre-configured DoubleTick connection. These details are intentionally
// not exposed as editable fields in the popup.
const DOUBLE_TICK_CONFIG = Object.freeze({
    proxyUrl: "https://doubletick-proxy.divyanshusrivastava1021.workers.dev",
    proxySecret: "CONFIGURE_SERVER_SIDE_PROXY_SECRET",
    fromNumber: "918826905892",
    language: "en"
});

/*
 * Numbers already attempted (sent OR failed) in this popup
 * session. Prevents the same candidate being messaged twice
 * if Send Template is clicked again without a fresh scrape.
 * Session-only by design (item 13) — resets when the popup
 * is closed, since chrome.storage isn't needed for this and
 * keeping it in memory avoids stale cross-session dedupe.
 */
const sentThisSession = new Set();

const scrapeBtn = document.getElementById("scrapeBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const previewBtn = document.getElementById("previewBtn");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const testConnectionBtn = document.getElementById("testConnectionBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const candidateCountEl = document.getElementById("candidateCount");
const phoneCountEl = document.getElementById("phoneCount");


// ======================================================
// SETTINGS
// ======================================================

async function loadSettings() {
    const result = await chrome.storage.local.get(SETTINGS_KEY);

    const settings = result[SETTINGS_KEY] || {};

    document.getElementById("templateName").value =
        settings.templateName || "";
}


async function saveSettings() {

    const settings = {
        templateName: document.getElementById("templateName").value.trim()
    };

    await chrome.storage.local.set({
        [SETTINGS_KEY]: settings
    });

    setStatus("DoubleTick settings saved.");
}


// ======================================================
// STATUS
// ======================================================

function setStatus(message) {

    statusEl.textContent = message;

    console.log("[DoubleTick]", message);
}


// ======================================================
// ACTIVE TAB
// ======================================================

async function getActiveTab() {

    const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    return tabs[0];
}


// ======================================================
// SCRAPE
// ======================================================

scrapeBtn.addEventListener("click", async () => {

    try {

        setStatus("Scraping Shine...");

        const tab = await getActiveTab();

        if (
            !tab?.id ||
            !tab.url?.includes("recruiter.shine.com")
        ) {

            throw new Error(
                "Open Shine recruiter page first."
            );
        }

        const response =
            await chrome.tabs.sendMessage(
                tab.id,
                {
                    action: "SCRAPE_PAGE"
                }
            );

        if (!response?.success) {

            throw new Error(
                response?.error ||
                "Scraping failed."
            );
        }

        const found =
            response.found || 0;

        const phones =
            response.withPhone || 0;

        setStatus(
            `Found ${found} candidates, ${phones} phones.`
        );

        await refreshStats();

    } catch (error) {

        console.error(
            "[Scrape Error]",
            error
        );

        setStatus(
            error.message ||
            "Scraping failed."
        );
    }
});


// ======================================================
// GET CANDIDATES
// ======================================================

async function getCandidates() {

    const result =
        await chrome.storage.local.get(
            STORAGE_KEY
        );

    return result[STORAGE_KEY] || [];
}


// ======================================================
// STATS
// ======================================================

async function refreshStats() {

    const candidates =
        await getCandidates();

    const withPhone =
        candidates.filter(
            candidate =>
                candidate.phone &&
                String(candidate.phone).trim()
        );

    candidateCountEl.textContent =
        candidates.length;

    phoneCountEl.textContent =
        withPhone.length;
}


saveSettingsBtn.addEventListener("click", async () => {

    await saveSettings();

    setStatus(
        "DoubleTick settings saved."
    );
});


// ======================================================
// TEST CONNECTION
// ======================================================

testConnectionBtn.addEventListener("click", async () => {

    await saveSettings();

    const settingsResult = await chrome.storage.local.get(SETTINGS_KEY);
    const settings = { ...DOUBLE_TICK_CONFIG, ...(settingsResult[SETTINGS_KEY] || {}) };

    if (!settings.templateName) {
        setStatus("Enter and save your DoubleTick template name first.");
        return;
    }

    const candidates = await getCandidates();
    const candidate = candidates.find(c => c.phone && String(c.phone).trim());

    if (!candidate) {
        setStatus("No candidate with phone number found. Scrape candidates first.");
        return;
    }

    testConnectionBtn.disabled = true;
    resultsEl.innerHTML = "";
    setStatus(`Testing REAL template send to ${candidate.name || normalizePhone(candidate.phone)}…`);

    try {
        // IMPORTANT: this is the real send endpoint. We no longer call
        // GET /v2/templates because a 403 there does not prove that
        // template sending is forbidden for the account.
        const result = await sendDoubleTickTemplate(settings, candidate);

        candidate.message_status = "Sent";
        candidate.error = "";
        await chrome.storage.local.set({ [STORAGE_KEY]: candidates });

        resultsEl.innerHTML = "";
        const box = document.createElement("div");
        box.className = "diagnostic-box";
        box.textContent =
            `✓ TEST MESSAGE ACCEPTED\n\n` +
            `Candidate: ${candidate.name || ""}\n` +
            `Phone: ${normalizePhone(candidate.phone)}\n` +
            `Template: ${settings.templateName}\n\n` +
            `DoubleTick response:\n${formatServerResponse(201, result, JSON.stringify(result))}`;
        resultsEl.appendChild(box);
        setStatus("✓ Test template message accepted by DoubleTick.");

    } catch (error) {
        console.error("[Test Send Error]", error);

        resultsEl.innerHTML = "";
        const box = document.createElement("div");
        box.className = "diagnostic-box";
        box.textContent =
            `✗ REAL TEMPLATE SEND FAILED\n\n` +
            `${error.message || "Unknown error"}\n\n` +
            `If this is HTTP 403/FORBIDDEN, the request is reaching DoubleTick ` +
            `but the API key/request is being forbidden. Check the API key's ` +
            `browser/IP restrictions in DoubleTick or ask DoubleTick support ` +
            `to enable browser access for this key.`;
        resultsEl.appendChild(box);
        setStatus("✗ Real template send failed — see details below.");
    } finally {
        testConnectionBtn.disabled = false;
    }
});

// ======================================================
// PREVIEW
// ======================================================

previewBtn.addEventListener("click", async () => {

    const candidates =
        await getCandidates();

    resultsEl.innerHTML = "";

    if (!candidates.length) {

        resultsEl.textContent =
            "No candidates found.";

        return;
    }

    const max =
        Math.min(
            candidates.length,
            20
        );

    for (
        let i = 0;
        i < max;
        i++
    ) {

        const candidate =
            candidates[i];

        const div =
            document.createElement("div");

        div.className =
            "candidate";

        div.innerHTML = `
            <strong>
                ${escapeHtml(
                    candidate.name || ""
                )}
            </strong>

            <span>
                ${escapeHtml(
                    candidate.phone || "No Phone"
                )}
            </span>

            <small>
                ${
                    candidate.phone
                        ? "READY"
                        : "SKIPPED (no phone)"
                }
            </small>

            ${
                candidate.error
                    ? `
                        <small class="error-text">
                            ${escapeHtml(
                                candidate.error
                            )}
                        </small>
                    `
                    : ""
            }
        `;

        resultsEl.appendChild(div);
    }

    if (candidates.length > 20) {

        const more =
            document.createElement("p");

        more.textContent =
            `Showing first 20 of ${candidates.length}.`;

        resultsEl.appendChild(more);
    }
});


// ======================================================
// PHONE NORMALIZATION
// ======================================================

function normalizePhone(phone) {

    if (!phone) {
        return "";
    }

    let value =
        String(phone)
            .trim()
            .replace(/[^\d+]/g, ""); // keep only digits and +

    // Keep + if already present
    if (value.startsWith("+")) {
        return "+" + value.slice(1).replace(/\+/g, "");
    }

    // Indian number like 8079843113
    if (
        value.length === 10 &&
        /^[0-9]+$/.test(value)
    ) {
        return "+91" + value;
    }

    // 918079843113
    if (
        value.length === 12 &&
        value.startsWith("91")
    ) {
        return "+" + value;
    }

    return value;
}


// ======================================================
// DOUBLETICK PROXY
// ======================================================

/*
 * Sends the message payload to YOUR serverless proxy — never
 * to public.doubletick.io directly, and never carries the
 * DoubleTick API key. The proxy holds that key server-side and
 * forwards the actual DoubleTick call.
 * Returns { status, ok, responseData, responseText }.
 * Never logs the proxy secret.
 */
async function callProxy(proxyUrl, proxySecret, body) {
    const response = await chrome.runtime.sendMessage({
        action: "PROXY_REQUEST",
        data: { proxyUrl, proxySecret, body }
    });

    if (!response?.success) {
        throw new Error(response?.error || "Proxy request failed.");
    }

    return response.result;
}

/*
 * Turns a DoubleTick response into a readable, safe
 * (no API key) diagnostic string for on-screen display.
 */
function formatServerResponse(
    status,
    responseData,
    responseText
) {

    if (responseText && responseText.trim()) {

        try {

            return JSON.stringify(
                JSON.parse(responseText),
                null,
                2
            );

        } catch {

            return responseText.trim();
        }
    }

    return (
        `(empty response body — usually means the request was ` +
        `blocked before reaching DoubleTick's application layer, ` +
        `e.g. by a firewall/WAF or an origin/CORS check, rather ` +
        `than a payload validation error. HTTP ${status})`
    );
}

async function sendDoubleTickTemplate(
    settings,
    candidate
) {

    const to =
        normalizePhone(
            candidate.phone
        );

    const from =
        normalizePhone(
            settings.fromNumber
        );

    if (!to) {

        throw new Error(
            "Candidate phone number is empty."
        );
    }

    if (!from) {

        throw new Error(
            "Sender number is empty."
        );
    }

    /*
     * The extension no longer talks to DoubleTick directly.
     * It sends the message intent to YOUR serverless proxy,
     * which holds the real DoubleTick API key and builds the
     * actual DoubleTick request server-side.
     */

    /*
     * Only attach templateData when the user has explicitly
     * filled in variables. Do NOT infer this from the candidate
     * name — sending unexpected placeholders to a template that
     * has none can cause DoubleTick to reject the message.
     */
    const proxyPayload = {
        to,
        from,
        templateName: settings.templateName,
        language: settings.language || "en"
    };


    console.log(
        "[DoubleTick Proxy] Sending template:",
        {
            to,
            from,
            templateName:
                settings.templateName,
            language:
                settings.language || "en"
        }
    );

    const {
        status,
        ok,
        responseData,
        responseText
    } = await callProxy(
        settings.proxyUrl,
        settings.proxySecret,
        proxyPayload
    );

    if (!ok) {

        const serverResponse =
            formatServerResponse(
                status,
                responseData,
                responseText
            );

        throw new Error(
            `DoubleTick ${status}\n\nServer response:\n${serverResponse}`
        );
    }

    return responseData;
}


// ======================================================
// SEND TEMPLATE
// ======================================================

sendBtn.addEventListener("click", async () => {

    try {

        /*
         * Load settings
         */

        await saveSettings();

        const settingsResult =
            await chrome.storage.local.get(
                SETTINGS_KEY
            );

        // IMPORTANT: merge the fixed DoubleTick config here too.
        // The Test Send button already does this; the bulk sender
        // previously loaded only saved settings, so fromNumber was
        // missing and every candidate failed with:
        // "Sender number is empty."
        const settings =
            { ...DOUBLE_TICK_CONFIG, ...(settingsResult[SETTINGS_KEY] || {}) };


        // ----------------------------------------------
        // VALIDATION
        // ----------------------------------------------

        if (!settings.templateName) {

            throw new Error(
                "Enter DoubleTick template name."
            );
        }


        // ----------------------------------------------
        // GET CANDIDATES
        // ----------------------------------------------

        const candidates =
            await getCandidates();

        const ready =
            candidates.filter(
                candidate =>
                    candidate.phone &&
                    String(candidate.phone).trim()
            );


        if (!ready.length) {

            throw new Error(
                "No candidate with phone number found."
            );
        }


        // ----------------------------------------------
        // CONFIRM
        // ----------------------------------------------

        const confirmed =
            confirm(
                `Ready to send "${settings.templateName}" to ${ready.length} numbers.\n\nContinue?`
            );

        if (!confirmed) {

            setStatus(
                "Sending cancelled."
            );

            return;
        }


        sendBtn.disabled = true;

        let sent = 0;
        let failed = 0;


        // ----------------------------------------------
        // SEND ONE BY ONE
        // ----------------------------------------------

        for (
            let i = 0;
            i < ready.length;
            i++
        ) {

            const candidate =
                ready[i];

            const number =
                normalizePhone(
                    candidate.phone
                );

            if (sentThisSession.has(number)) {

                candidate.message_status =
                    "Skipped";

                candidate.error =
                    "Already attempted this session — skipped duplicate.";

                await chrome.storage.local.set({
                    [STORAGE_KEY]:
                        candidates
                });

                continue;
            }

            setStatus(
                `Sending ${i + 1}/${ready.length}: ${candidate.name || number}`
            );


            try {

                const result =
                    await sendDoubleTickTemplate(
                        settings,
                        candidate
                    );


                sent++;

                sentThisSession.add(number);

                candidate.message_status =
                    "Sent";

                candidate.error = "";

                console.log(
                    `[DoubleTick] SENT: ${candidate.name} ${number}`,
                    result
                );


            } catch (error) {

                failed++;

                candidate.message_status =
                    "Failed";

                candidate.error =
                    error.message;

                console.error(
                    `[DoubleTick] FAILED: ${candidate.name} ${number}`,
                    error
                );
            }


            // ------------------------------------------
            // SAVE PROGRESS
            // ------------------------------------------

            await chrome.storage.local.set({
                [STORAGE_KEY]:
                    candidates
            });


            /*
             * Small delay between requests
             */

            if (i < ready.length - 1) {

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            700
                        )
                );
            }
        }


        // ----------------------------------------------
        // FINAL RESULT
        // ----------------------------------------------

        setStatus(
            `Finished. Sent: ${sent}, Failed: ${failed}`
        );

        await refreshStats();

        /*
         * Show detailed results
         */

        resultsEl.innerHTML = "";

        for (
            const candidate of ready
        ) {

            const div =
                document.createElement("div");

            div.className =
                "candidate";

            const status =
                candidate.message_status;

            const isSent =
                status === "Sent";

            const isSkipped =
                status === "Skipped";

            let statusClass = "error-text";
            let statusHtml;

            if (isSent) {

                statusClass = "";
                statusHtml = "✓ SENT";

            } else if (isSkipped) {

                statusClass = "";
                statusHtml = "SKIPPED — " + escapeHtml(
                    candidate.error || "duplicate"
                );

            } else {

                statusHtml = "✗ FAILED\n" + escapeHtml(
                    candidate.error || "Unknown error"
                );
            }

            div.innerHTML = `
                <strong>
                    ${escapeHtml(
                        candidate.name || ""
                    )}
                </strong>

                <span>
                    ${escapeHtml(
                        candidate.phone || ""
                    )}
                </span>

                <small class="${statusClass}">
                    ${statusHtml}
                </small>
            `;

            resultsEl.appendChild(div);
        }


    } catch (error) {

        console.error(
            "[Send Error]",
            error
        );

        setStatus(
            error.message ||
            "Sending failed."
        );

    } finally {

        sendBtn.disabled =
            false;
    }
});


// ======================================================
// CLEAR
// ======================================================

// ======================================================
// EXPORT CSV
// ======================================================

function csvEscape(value) {
    const text = value == null ? "" : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
}

function getSpecialization(candidate) {
    return candidate.specialization || candidate.search || "";
}

function getLocation(candidate) {
    return candidate.location || "";
}

exportCsvBtn.addEventListener("click", async () => {
    try {
        const candidates = await getCandidates();
        if (!candidates.length) {
            setStatus("No candidates to export. Scrape candidates first.");
            return;
        }
        const rows = [["Name", "Number", "Specialization", "Location"], ...candidates.map(c => [
            c.name || "",
            c.phone || "",
            getSpecialization(c),
            getLocation(c)
        ])];
        const csv = rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
        const blob = new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8;"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `shine_candidates_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus(`Exported ${candidates.length} candidates to CSV.`);
    } catch (error) {
        console.error("[CSV Export Error]", error);
        setStatus(error.message || "CSV export failed.");
    }
});


clearBtn.addEventListener("click", async () => {

    const confirmed =
        confirm(
            "Clear all extracted candidates?"
        );

    if (!confirmed) {
        return;
    }

    await chrome.storage.local.remove(
        STORAGE_KEY
    );

    resultsEl.innerHTML = "";

    await refreshStats();

    setStatus(
        "Candidate data cleared."
    );
});


// ======================================================
// HTML ESCAPE
// ======================================================

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// ======================================================
// INIT
// ======================================================

(async function init() {

    try {

        await loadSettings();

        await refreshStats();

    } catch (error) {

        console.error(
            "[Init Error]",
            error
        );

    }

})();