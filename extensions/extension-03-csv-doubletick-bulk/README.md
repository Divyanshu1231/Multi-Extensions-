# CSV → DoubleTick Bulk WhatsApp v1.1

### Fixed CSV upload
- Fixed popup JavaScript scope error caused by duplicate `DEFAULT_CONFIG`.
- Supports comma, semicolon, and tab-separated CSV.
- Handles Excel UTF-8 BOM.
- Handles quoted values and commas inside quoted fields.
- Explicitly opens the file picker when the upload card is clicked.

### Flow
Upload CSV → detect Name/Phone/Location (location is optional) → select multiple locations, including Empty location → enter template → send.

### CSV examples
Name,Mobile No.,Preferred Location(City)
Dr A,9876543210,Ahmedabad
Dr B,919876543210,Thanjavur

If the CSV has different column names, set the exact names in Settings.
\n### Empty location support\n- Blank/missing location values are retained during CSV import.\n- Select **Empty location** in the Location / State filter to target only candidates with no location.\n- The location column is optional; if it is missing, all imported candidates are treated as Empty location.\n