# Extension integration notes
Original ZIPs are retained under `extensions/original-zips/`. A per-extension `.original-source/` backup is also retained beside each updated extension. `auth.js` adds a login gate to each popup and stores only short-lived access/rotating refresh credentials in `chrome.storage.local`. The popup's existing HTML and JS remain present and are revealed after successful login.

Before production packaging:
1. Replace `https://YOUR-BACKEND.onrender.com` in each `auth.js` and manifest host_permissions with the deployed API origin.
2. Add the production origin to backend `CORS_ORIGINS`.
3. Load each extension folder containing its manifest.json in Chrome.
4. Create extension-specific users in the admin panel/API.
5. Test each original feature flow after login.

Security boundary: this initial gate controls popup access; it does not yet proxy every pre-existing background/content-script action through the API. If you need enforcement against direct extension-internal invocation, each privileged operation must additionally validate a live backend session in its service worker before running. Do not treat a hidden popup as authorization for server-side business APIs.

## Production gates
Popup code now loads only after the extension-specific login/session check. This is a popup gate, not a full authorization boundary for all background message listeners or content scripts. Those privileged service-worker handlers still need per-operation live-session validation before production. Original scraping selectors and matching algorithms were retained.

A proxy credential literal found in original sender source was replaced in working copies with a configuration placeholder. Put the real proxy secret and DoubleTick API key only in server-side environment variables. Live DoubleTick sending requires valid provider credentials and approved templates; no live send was executed.

## Manual regression checklist
For each extension, load its manifest folder through `chrome://extensions` with Developer Mode enabled, sign in using a user assigned to that exact extension key, and verify the original feature flow on its target site. Then sign out, disable the user, disable the extension, expire/revoke the session, and verify that popup login fails in each case. Test wrong-extension credentials by attempting each user's username/password against another extension key; it must fail. For extensions that send WhatsApp messages, use a non-production test contact only after server-side proxy secrets and provider template approvals are configured.
