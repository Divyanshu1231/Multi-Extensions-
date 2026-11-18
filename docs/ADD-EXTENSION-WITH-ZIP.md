# Add a Chrome extension from the Super Admin Dashboard

## ZIP upload
Upload a normal Chrome Manifest V3 extension ZIP. The ZIP must contain `manifest.json` at its root, or inside one enclosing project folder. You do NOT need to add `auth.js` or `popup.html` yourself.

The backend automatically:
- assigns the next extension key (`extension-06`, `extension-07`, ...);
- creates the platform `auth.js` login gate and configures the API URL/key;
- adds the required `storage` permission and backend host permission;
- preserves an existing popup and injects the login gate, or creates a simple login popup if none exists;
- stores the updated ZIP for download in the dashboard.

## Download and install
After upload, download the integrated ZIP, extract it, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose the extracted folder containing `manifest.json`. Create users for that extension in User Management.

## Compatibility and security notes
- Supports Chrome Manifest V3 only.
- Upload limits: 15 MB compressed, 40 MB expanded, 300 files.
- Popup login gates the extension's popup UI. It does not automatically secure privileged service-worker or content-script actions. Those actions must validate the access token server-side before performing protected work.
- Chrome cannot silently install a ZIP from a web dashboard. Users must load it unpacked or receive it through Chrome Web Store / managed browser policy.
- Packages are stored in PostgreSQL in this project. For large packages or frequent uploads, use object storage such as R2/S3 instead.

## Download and update existing extensions from the dashboard
- Every registered extension card now has a **Download extension ZIP** action.
- For the five built-in extensions, the API creates a ZIP from the matching `extensions/extension-XX-*` folder when no package has been uploaded yet.
- To publish a newer version, choose the extension under **Add or Update Extension**, upload its normal Manifest V3 ZIP, and submit. The existing extension key and assigned users are retained; its package and manifest version are replaced.
- Choose **Register as a new extension** only when adding a genuinely new extension.
- After deploying the API and dashboard, refresh the admin page. Test each downloaded ZIP in `chrome://extensions` using Developer mode → Load unpacked after extracting it.

Note: the fallback download for built-in extensions packages the source folder committed to this repository. Updating an extension replaces its stored package; it does not automatically update Chrome installations already on users' computers. Users must install the new ZIP/version or a separate managed update-distribution mechanism must be configured.
