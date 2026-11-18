NAUKRI RESDEX NAME MATCHER — INSTALLATION

1. Extract the ZIP file into a folder.
2. In Chrome, open: chrome://extensions
3. Turn on Developer mode (top-right).
4. Click "Load unpacked".
5. Select the extracted folder containing manifest.json.
6. Open and sign in to Naukri ResDex, then open a candidate search results page.
7. Click the extension icon.
8. Upload the Airtable CSV export.
9. Check that the "Candidate name column" dropdown points to the correct name column.
10. Click "Scan pages automatically" to try scanning the search result pages, or use "Collect names from this page" on each page.
11. Click "Match against Airtable CSV".
12. Click "Export unmatched names CSV".

NOTES
- The extension processes the CSV locally in your browser. It does not upload the CSV to a server.
- Candidate name extraction is based on visible page structure and may need selector updates if Naukri changes its layout.
- Automatic page scanning is best-effort. Keep the ResDex tab open and in the foreground. Verify the collected count and page count.
- Use this only with data you are authorized to access and in accordance with Naukri's terms and your organization's privacy requirements.
- Matching normalizes case, spaces, punctuation and common titles (Dr/Mr/Mrs/Ms/Prof). It does not do fuzzy spelling matches.

VERSION 1.1.0 FIX
- Name extraction now prefers candidate-result cards and avoids scanning every heading/link, reducing false positives.
- Verify the detected card/name count against the visible result page; Naukri may change its HTML structure.

VERSION 2.0 MULTI-PAGE SCAN
- Attempts to click the ResDex next-page control until the end of results (up to 100 pages).
- Combines names across pages and removes normalized duplicates.
- Naukri's pager structure can change; verify the scanned page count and final names.

VERSION 3.0 SELECTOR FIX
- Uses the exact candidate name selector observed in the supplied DevTools screenshot: a.candidate-name.
- Multi-page scan follows the ResDex pager and reports the page number when available.
- The extension only reads visible page content and the uploaded CSV locally.

VERSION 4.0 — UNMATCHED CONTACT COLUMNS
- Unmatched CSV includes Candidate Name, Phone Number, Profile URL, and Match Status.
- Phone numbers are collected only when already visible in the candidate card/page. The extension does not click “View phone number” or reveal hidden contact details.
- If no phone number is visible, the Phone Number field remains blank.

VERSION 5.0 — STRICT NAME SELECTOR FIX
- Uses only visible links matching div.candidate-headline a.candidate-name, based on the supplied DevTools screenshot.
- Excludes hidden/invisible links and generic candidate-name-like links elsewhere on the page.
- To update: remove the previous extension, extract this ZIP, then Load unpacked the extracted folder.
- Phone number is only included if it is already visibly rendered in the card/page; this extension does not click View phone number.

VERSION 6.0 — EXACT PROFILE ENTRY COUNT
- Reads only visible div.candidate-headline a.candidate-name links. No generic headings/body-text scanning.
- Deduplicates repeated DOM occurrences by profile URL, not by name; same-name profiles with different URLs are preserved as separate entries.
- To update, remove the older extension, extract this ZIP, then Load unpacked the extracted v6 folder and refresh the Naukri tab.
