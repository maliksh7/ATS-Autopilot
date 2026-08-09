#!/usr/bin/env node
/**
 * Sanitize an n8n workflow export before committing it.
 *
 * Usage:
 *   node scripts/sanitize-workflow.mjs path/to/export.json > workflow/ats-autopilot.json
 *   # or in place:
 *   node scripts/sanitize-workflow.mjs path/to/export.json --in-place
 *
 * What it does:
 *  - Replaces secret values in the "Workflow Configuration" Set node with placeholders
 *    (apifyToken, supabaseKey, supabaseUrl, profileDocId, userEmail, resumeFileId).
 *  - Replaces credential IDs with a placeholder (n8n re-maps these on import anyway).
 *  - Replaces meta.instanceId and any webhookIds.
 *  - Redacts anything that still looks like a live secret (apify_api_..., gsk_..., sb_...,
 *    *.supabase.co, JWT-like strings) anywhere in the JSON, as a safety net.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const inPlace = process.argv.includes('--in-place');
if (!file) {
  console.error('Usage: node scripts/sanitize-workflow.mjs <export.json> [--in-place]');
  process.exit(1);
}

const PLACEHOLDERS = {
  apifyToken:   'YOUR_APIFY_TOKEN',
  supabaseKey:  'YOUR_SUPABASE_KEY',
  supabaseUrl:  'https://YOUR_PROJECT.supabase.co',
  profileDocId: 'YOUR_PROFILE_GOOGLE_DOC_ID',
  userEmail:    'you@example.com',
  resumeFileId: 'YOUR_GOOGLE_DOC_ID',
};

const wf = JSON.parse(readFileSync(file, 'utf8'));

// 1) Config Set node values
for (const node of wf.nodes ?? []) {
  if (node.type === 'n8n-nodes-base.set' && /Configuration/i.test(node.name || '')) {
    const assigns = node.parameters?.assignments?.assignments ?? [];
    for (const a of assigns) {
      if (a.name in PLACEHOLDERS) a.value = PLACEHOLDERS[a.name];
    }
  }
  // 2) Credential IDs
  if (node.credentials) {
    for (const key of Object.keys(node.credentials)) {
      if (node.credentials[key]?.id) node.credentials[key].id = 'REPLACE_WITH_YOUR_CREDENTIAL_ID';
    }
  }
  // 3) webhookIds
  if (node.webhookId) node.webhookId = 'REPLACE_WITH_YOUR_WEBHOOK_ID';
}

// 4) meta.instanceId
if (wf.meta?.instanceId) wf.meta.instanceId = 'REPLACE_WITH_YOUR_INSTANCE_ID';

// 5) Safety-net redaction of anything that still looks secret
const SECRET_PATTERNS = [
  /apify_api_[A-Za-z0-9]+/g,
  /gsk_[A-Za-z0-9]+/g,
  /sb_(?:publishable|secret)_[A-Za-z0-9_\-]+/g,
  /https:\/\/[a-z0-9]{20}\.supabase\.co/g,
  /eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, // JWT-ish
];
let json = JSON.stringify(wf, null, 2);
for (const re of SECRET_PATTERNS) json = json.replace(re, 'REDACTED');

if (inPlace) {
  writeFileSync(file, json + '\n');
  console.error(`Sanitized in place: ${file}`);
} else {
  process.stdout.write(json + '\n');
}
