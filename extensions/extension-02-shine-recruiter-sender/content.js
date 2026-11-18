(() => {
    "use strict";

    const STORAGE_KEY = "shine_candidates";

    function cleanText(value) {
        return (value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    // --------------------------------------------------
    // GET PHONE DIRECTLY FROM SHINE DOM
    // --------------------------------------------------

    function getFullMobileFromElement(element) {
        if (!element) return "";

        // 1. Direct data-full-mobile
        const fullMobile = element.getAttribute("data-full-mobile");

        if (fullMobile) {
            return cleanText(fullMobile);
        }

        // 2. Search inside element
        const phoneElement = element.querySelector(
            "[data-full-mobile]"
        );

        if (phoneElement) {
            return cleanText(
                phoneElement.getAttribute("data-full-mobile")
            );
        }

        return "";
    }

    // --------------------------------------------------
    // FIND PHONE USING CANDIDATE ID
    // --------------------------------------------------

    function findPhoneByCandidateId(candidateId) {

        if (!candidateId) return "";

        const phoneButtons = Array.from(
            document.querySelectorAll(
                "a.srp_action_btn--viewphone[data-candidate-id]"
            )
        );

        for (const button of phoneButtons) {

            const buttonCandidateId =
                button.getAttribute("data-candidate-id");

            if (
                buttonCandidateId &&
                buttonCandidateId === candidateId
            ) {

                const phone =
                    button.getAttribute("data-full-mobile");

                if (phone) {
                    return cleanText(phone);
                }
            }
        }

        return "";
    }

    // --------------------------------------------------
    // FIND PHONE NEAR PROFILE LINK
    // --------------------------------------------------

    function findPhoneNearProfile(profileLink) {

        if (!profileLink) return "";

        // Walk upward through parents.
        // Shine phone button may be outside the exact
        // div.list-content element.

        let parent = profileLink;

        for (let level = 0; level < 8 && parent; level++) {

            const phoneButton = parent.querySelector(
                "a.srp_action_btn--viewphone[data-full-mobile]"
            );

            if (phoneButton) {

                const phone =
                    phoneButton.getAttribute("data-full-mobile");

                if (phone) {
                    return cleanText(phone);
                }
            }

            const anyPhone = parent.querySelector(
                "[data-full-mobile]"
            );

            if (anyPhone) {

                const phone =
                    anyPhone.getAttribute("data-full-mobile");

                if (phone) {
                    return cleanText(phone);
                }
            }

            parent = parent.parentElement;
        }

        return "";
    }

    // --------------------------------------------------
    // NAME + PROFILE LINKS
    // --------------------------------------------------

    function getProfileLinks() {

        return Array.from(
            document.querySelectorAll(
                "a.cls_circle_name.cls_loadProfile"
            )
        );
    }

    // --------------------------------------------------
    // SEARCH / SPECIALIZATION / LOCATION CONTEXT
    // --------------------------------------------------

    function getSearchQueryFromPage() {
        // First try common URL parameters.
        try {
            const currentUrl = new URL(window.location.href);
            for (const key of [
                "specialization", "speciality", "keyword", "keywords",
                "query", "search", "q", "skill", "skills"
            ]) {
                const value = cleanText(currentUrl.searchParams.get(key));
                if (value) return decodeURIComponent(value).trim();
            }
        } catch (error) {}

        // Shine commonly displays the active search directly under
        // the candidate count, e.g. `for ("MD Medicine" OR "MD (Medicine)")...`
        const countNodes = Array.from(document.querySelectorAll("body *"))
            .filter(el => /^\s*\d[\d,]*\s+Candidates?\s*$/i.test(cleanText(el.textContent || "")));

        for (const node of countNodes) {
            let parent = node.parentElement;
            for (let i = 0; i < 4 && parent; i++, parent = parent.parentElement) {
                const text = cleanText(parent.textContent || "");
                const match = text.match(/for\s+(.{3,300}?)(?:View details|$)/i);
                if (match && match[1]) {
                    return cleanText(match[1]);
                }
            }
        }

        // Fallback: look for a visible element beginning with `for`.
        const all = Array.from(document.querySelectorAll("body *"));
        for (const el of all) {
            if (el.children.length > 0) continue;
            const text = cleanText(el.textContent || "");
            if (/^for\s+/i.test(text) && text.length < 500) {
                return cleanText(text.replace(/^for\s+/i, ""));
            }
        }

        return "";
    }

    function extractPreferredLocation(cardText) {
        const text = cleanText(cardText);
        const match = text.match(/Pref\.?\s*Location\s*:\s*([^|•\n]+?)(?=\s+(?:Current:|MBBS|Education|Skills|$))/i);
        if (match && match[1]) return cleanText(match[1]);

        const fallback = text.match(/Pref\.?\s*Location\s*:\s*([^\n]+)/i);
        return fallback ? cleanText(fallback[1]).split(/\s{2,}/)[0] : "";
    }

    // --------------------------------------------------
    // EXTRACT ONE CANDIDATE
    // --------------------------------------------------

    function extractCandidate(profileLink) {

        const name = cleanText(
            profileLink.textContent
        );

        let profileUrl = "";

        if (profileLink.href) {
            profileUrl = profileLink.href;
        }

        // Candidate ID can be present in profile URL
        let candidateId = "";

        try {

            const url = new URL(profileUrl);

            candidateId =
                url.searchParams.get("candidate_id") || "";

        } catch (error) {
            // Ignore invalid URL
        }

        // --------------------------------------------------
        // PHONE
        // --------------------------------------------------

        let phone = "";

        // Method 1:
        // Search near profile link
        phone = findPhoneNearProfile(profileLink);

        // Method 2:
        // Search by candidate ID globally
        if (!phone && candidateId) {

            phone =
                findPhoneByCandidateId(candidateId);
        }

        // --------------------------------------------------
        // LOCATION
        // --------------------------------------------------

        let location = "";
        let search = getSearchQueryFromPage();

        let parent = profileLink;
        for (let level = 0; level < 8 && parent; level++) {
            const text = cleanText(parent.textContent || "");
            if (text && text.length < 2500) {
                location = extractPreferredLocation(text);
                if (!location) {
                    const locations = [
                        "Delhi", "Noida", "Mumbai", "Pune", "Bangalore", "Bengaluru",
                        "Hyderabad", "Chennai", "Kolkata", "Gurgaon", "Gurugram", "Ghaziabad"
                    ];
                    for (const city of locations) {
                        if (new RegExp(`\\b${city.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i").test(text)) {
                            location = city;
                            break;
                        }
                    }
                }
            }
            if (location) break;
            parent = parent.parentElement;
        }

        return {
            name,
            phone,
            profile_url: profileUrl,
            location,
            search,
            specialization: search,
            timestamp: new Date().toISOString()
        };
    }

    // --------------------------------------------------
    // SCRAPE PAGE
    // --------------------------------------------------

    async function scrapeCurrentPage() {

        const profileLinks =
            getProfileLinks();

        console.log(
            `[Shine Extractor] Found ${profileLinks.length} profiles`
        );

        const extracted = [];

        for (const profileLink of profileLinks) {

            const candidate =
                extractCandidate(profileLink);

            if (!candidate.name) {
                continue;
            }

            console.log(
                "[Shine Extractor] Candidate:",
                candidate.name,
                "| Phone:",
                candidate.phone || "NOT FOUND"
            );

            extracted.push(candidate);
        }

        // --------------------------------------------------
        // SAVE
        // --------------------------------------------------

        const result =
            await chrome.storage.local.get(
                STORAGE_KEY
            );

        const existing =
            result[STORAGE_KEY] || [];

        const map = new Map();

        // Existing records
        for (const candidate of existing) {

            const key =
                candidate.profile_url ||
                `${candidate.name}|${candidate.phone}`;

            map.set(key, candidate);
        }

        // New records
        for (const candidate of extracted) {

            const key =
                candidate.profile_url ||
                `${candidate.name}|${candidate.phone}`;

            const old =
                map.get(key) || {};

            map.set(key, {
                ...old,
                ...candidate
            });
        }

        const finalData =
            Array.from(map.values());

        await chrome.storage.local.set({
            [STORAGE_KEY]: finalData
        });

        const phoneCount =
            extracted.filter(
                c => c.phone
            ).length;

        console.log(
            `[Shine Extractor] Found ${extracted.length} candidates, ${phoneCount} phones`
        );

        return {
            found: extracted.length,
            phones: phoneCount,
            total: finalData.length
        };
    }

    // --------------------------------------------------
    // GET DATA
    // --------------------------------------------------

    async function getSavedCandidates() {

        const result =
            await chrome.storage.local.get(
                STORAGE_KEY
            );

        return result[STORAGE_KEY] || [];
    }

    // --------------------------------------------------
    // CLEAR DATA
    // --------------------------------------------------

    async function clearData() {

        await chrome.storage.local.remove(
            STORAGE_KEY
        );

        return true;
    }

    // --------------------------------------------------
    // MESSAGE HANDLER
    // --------------------------------------------------

    chrome.runtime.onMessage.addListener(
        (message, sender, sendResponse) => {

            if (
                message?.action ===
                "SCRAPE_PAGE"
            ) {

                scrapeCurrentPage()
                    .then(result => {

                        sendResponse({
                            success: true,
                            ...result
                        });

                    })
                    .catch(error => {

                        console.error(
                            "[Shine Extractor]",
                            error
                        );

                        sendResponse({
                            success: false,
                            error: error.message
                        });

                    });

                return true;
            }

            if (
                message?.action ===
                "GET_DATA"
            ) {

                getSavedCandidates()
                    .then(data => {

                        sendResponse({
                            success: true,
                            data
                        });

                    })
                    .catch(error => {

                        sendResponse({
                            success: false,
                            error: error.message
                        });

                    });

                return true;
            }

            if (
                message?.action ===
                "CLEAR_DATA"
            ) {

                clearData()
                    .then(() => {

                        sendResponse({
                            success: true
                        });

                    });

                return true;
            }
        }
    );

    console.log(
        "[Shine Extractor] Updated content.js loaded"
    );

})();