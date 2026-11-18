Naukri Resdex Email Extractor v5.1.0

Workflow:
1. Open a Naukri Resdex search-results page.
2. Set the number of visible profiles to process.
3. Start extraction.
4. The extension collects candidate profile links from the results page.
5. It opens each profile in a temporary browser tab.
6. It extracts EMAIL ONLY from the profile.
7. It closes that profile tab and returns to the search-results tab.
8. Export CSV with Name, Email.

This version does not click View phone number and does not scrape phone numbers.

v5.1 changes:
- Admin/recruiter email (e.g. the logged-in account email in the header) is no longer scraped. Emails shown on the search page, emails inside header/nav/account areas, and the "Admin email(s) to ignore" list are all skipped.
- Only candidates with the triangle icon (title "Profile viewed by you on ..." / "Profile viewed by other on ...") are processed. Popup lets you choose both / only you / only other / all.

v5.2: CSV now also has Experience, Salary, Location, Current, Previous, Education, Pref. location, Key skills, May also know, Profile Summary, Viewed, Profile URL (taken from the search-result card).

v5.3: clicks "View phone number" on each profile and adds a Phone column (can be turned off in popup). NOTE: Naukri may count each reveal against your phone-view quota.

v5.4: load your Airtable CSV in the popup; candidates whose name matches are skipped, only unmatched ones are opened for phone + email. "Export Match Report" lists matched/unmatched.

v5.5: export button renamed "Export Unmatched Candidate Mobile And Email CSV"; random wait 12-1200s between profiles (min/max editable); Name/Email/Phone/Location always saved, other details saved randomly per profile (can be turned off).

v5.5.1: added toolbar/extension icon (icons/ folder). Replace icons/icon16/32/48/128.png with the official Naukri logo if you prefer.

v5.5.2: icon replaced with the provided Naukri logo.
