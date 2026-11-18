# Shine Candidate Scraper + Airtable Name Matcher v2.3

## Workflow

1. Export your existing candidate table from Airtable as a CSV.
2. Open the extension and upload that CSV first.
3. Open the Shine recruiter candidate-search results page while logged in. Scroll/load the candidate results you want to scan.
4. Click **Start: Scan Names → Match → Unmatched Contacts**.
5. The extension first collects candidate names and profile URLs from the results page only.
6. It normalizes candidate names and compares Shine names with names in the Airtable CSV.
7. Candidates with an exact normalized-name match are skipped; their profiles are not opened.
8. Only unmatched Shine profiles are opened to look for email and mobile details.
9. Export the unmatched candidates CSV when the run completes.

## Matching

- Shine → Airtable only. Airtable-only records are ignored.
- Name is the primary and sufficient match key; email and mobile are optional.
- Matching uses exact normalized-name equality after lowercasing, removing common titles (Dr/Mr/Mrs/Ms/Prof), punctuation and spaces.
- Shine UI suffixes such as “Open to Contractual”, “Open to Work”, “Actively Looking” and “Immediately Available” are removed before matching.
- Duplicate candidate names in the Shine results are deduplicated before profile processing.
- Partial-name matching is intentionally disabled to avoid false positives.

## Export

`shine_unmatched_candidates.csv` contains only unmatched Shine candidates, with columns:

- Name
- Email
- Mobile
- Profile URL
- Status
- Match Result

Missing email or mobile details are left blank. The Airtable CSV is read-only and is not modified. The extension only reads data visible/available in the user's logged-in Shine session and does not bypass access controls.
