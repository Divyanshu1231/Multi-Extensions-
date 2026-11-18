SHINE CANDIDATE EXTRACTOR
=========================

INSTALLATION
-------------

1. Create a folder:

   shine-extension

2. Put these files inside:

   manifest.json
   popup.html
   popup.js
   content.js
   styles.css
   README.txt


CHROME INSTALLATION
-------------------

1. Open Chrome.

2. Go to:

   chrome://extensions

3. Enable:

   Developer mode

4. Click:

   Load unpacked

5. Select:

   shine-extension


USAGE
-----

1. Login to Shine recruiter normally in Chrome.

2. Open the candidate search page.

3. Make sure candidate cards are visible.

4. Click the extension icon.

5. Click:

   Scan Current Page

6. Candidate names and profile URLs will appear.

7. Click:

   Export CSV


IMPORTANT
---------

The extension uses the current logged-in Chrome tab/session.

No Shine username/password is stored by the extension.

Phone/contact-number harvesting is intentionally not implemented.

FIX APPLIED (2026-09-30): Bulk Send Template now merges DOUBLE_TICK_CONFIG so the configured sender number is included. This fixes 'Sender number is empty' during bulk sending while keeping the successful Test Send flow unchanged.
