CENTRAL EXTENSION PLATFORM - UPDATED EXTENSIONS

Backend API: https://central-extension-platform-api.onrender.com

The five extension auth.js files now normalize the API base URL and build paths without double slashes.
The five active manifest.json files include the Render API host permission.
The backend CORS middleware was updated in backend/app/main.py to allow Chrome extension origins matching chrome-extension://[a-p]{32}.

INSTALL / UPDATE
1. Extract this ZIP.
2. Open chrome://extensions in Chrome and enable Developer mode.
3. For each extension, click Load unpacked and select the folder containing its manifest.json.
   If it is already installed, use the folder path in the list below and click Reload.
4. Create a separate user for each extension in the Super Admin dashboard.
5. Sign in with that extension's assigned username and password.

EXTENSION FOLDERS
1. extension-01-naukri-resdex-extractor
2. extension-02-shine-recruiter-sender
3. extension-03-csv-doubletick-bulk
4. extension-04-shine-airtable-matcher/shine_candidate_scraper
5. extension-05-naukri-airtable-matcher/Naukri_ResDex_Airtable_Name_Matcher_v6

IMPORTANT
- Deploy the updated backend/app/main.py to Render before testing extension login, otherwise CORS may still fail.
- Confirm Render API is healthy at /health.
- This login gate only protects the popup UI. It does not yet secure every privileged background/content-script action; do not treat it as a complete production authorization boundary.
- Original backup source folders and original ZIPs are intentionally excluded from this distribution.
