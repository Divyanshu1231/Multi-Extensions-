# Existing extension feature inventory (from supplied ZIPs)

| Platform key | Source ZIP | Existing documented behavior |
|---|---|---|
| extension-01 | Naukri_Resdex_Extractor_v5.5.2_NAUKRI_ICON | ResDex visible candidate/profile processing; email/phone extraction options; Airtable CSV matching/skip; randomized wait; CSV exports and match report |
| extension-02 | Shine_Recruiter_Extension_Sender_Fixed | Shine recruiter-page scraping; candidate/phone counts; DoubleTick template settings; test send; preview; CSV export; bulk template send |
| extension-03 | csv_doubletick_bulk_extension_EMPTY_LOCATION_OPTION | CSV import with delimiter/BOM/quoted-field handling; optional location; empty-location filtering; DoubleTick template bulk send; proxy settings |
| extension-04 | Shine_Candidate_Scraper_Airtable_Name_Matcher_v2.3 | Shine visible candidate-name collection; exact normalized-name Airtable CSV matching; unmatched-only profile processing; contact CSV exports |
| extension-05 | Naukri_ResDex_Airtable_Name_Matcher_v6 | Visible candidate-card name extraction; multi-page scan; profile-URL deduplication; exact normalized-name matching; unmatched/all CSV exports |

## Observed integration details
- All manifests are Manifest V3.
- Service workers exist for extension-01 through extension-04; extension-05 has no background service worker.
- DoubleTick proxy URL is embedded in the source for extension-02 and extension-03.
- Airtable CSV processing is local in extension-04 and extension-05 according to their READMEs.
- Existing selectors, scraping behavior and proxy flows have not intentionally been rewritten in this integration baseline.

## Regression tests still required
The ZIP contents do not include browser automation tests or credentials for the logged-in Naukri/Shine/DoubleTick services. Therefore live scraping, candidate selectors, real template sending, quota behavior, and the external proxy cannot be truthfully certified from static source inspection alone.
