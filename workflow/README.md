# workflow/

This folder holds the **sanitized** n8n workflow export (`ats-autopilot.json`) ; placeholders only, no secrets.

## How to (re)generate it safely

1. In n8n, open the workflow → **⋯ menu → Download** (or Export). Save it as `workflow/ats-autopilot.raw.json` (this filename is git-ignored).
2. Run the sanitizer to produce the committable file:

   ```bash
   node scripts/sanitize-workflow.mjs workflow/ats-autopilot.raw.json > workflow/ats-autopilot.json
   ```

3. **Verify** `workflow/ats-autopilot.json` contains no real tokens/keys/URLs (search for `apify_api_`, `gsk_`, `sb_`, `.supabase.co`, your email). The sanitizer redacts these, but always eyeball it.
4. Commit `workflow/ats-autopilot.json` only. Never commit the `.raw.json`.

## What the sanitizer strips
- Config node secrets → placeholders (`apifyToken`, `supabaseKey`, `supabaseUrl`, `profileDocId`, `userEmail`, `resumeFileId`)
- Credential IDs, webhook IDs, `meta.instanceId`
- Safety-net redaction of anything matching known secret patterns

## Importing
In n8n: **Import from File** → `ats-autopilot.json`. Then open each credentialed node and select your own credentials, and fill the **Workflow Configuration** node (see [../docs/setup.md](../docs/setup.md)).
