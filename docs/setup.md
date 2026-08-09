# Setup Guide

End-to-end deployment. Budget ~30–45 min the first time (Google OAuth is the fiddliest part). Everything here uses free tiers.

## Prerequisites
- Docker (Docker Desktop on macOS/Windows, or Docker Engine on Linux)
- A Google account
- Free accounts: [Groq](https://console.groq.com), [Apify](https://apify.com), [Supabase](https://supabase.com)

---

## 1. Run self-hosted n8n

```bash
docker volume create n8n_data

docker run -d --name n8n --restart unless-stopped -p 5678:5678 \
  -e GENERIC_TIMEZONE="Europe/Berlin" \
  -e TZ="Europe/Berlin" \
  -e N8N_SECURE_COOKIE=false \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

Open <http://localhost:5678>, create the owner account. Set the timezone to yours ; it controls when the daily trigger fires.

> Data lives in the `n8n_data` volume and survives restarts. If it ever stops (Mac sleep, Docker quit): `docker start n8n`.

---

## 2. Create the Supabase tables

Supabase → **SQL Editor** → run [`db/schema.sql`](../db/schema.sql). This creates `profile` and `applications` and disables RLS (single-user backend).

Grab your **Project URL** and an **API key** (Settings → API). Use the `service_role` key if you keep RLS on; otherwise the `anon`/publishable key is fine with RLS disabled.

---

## 3. Google Cloud ; one OAuth client for Drive + Docs + Gmail

1. [Cloud Console](https://console.cloud.google.com) → create/select a project.
2. **Enable APIs**: Google Drive API, Google Docs API, Gmail API.
3. **OAuth consent screen** → External → add your own email under **Test users** (avoids app verification).
4. **Credentials → Create OAuth client ID → Web application.** Add the redirect URI n8n shows:
   `http://localhost:5678/rest/oauth2-credential/callback`
5. Copy the **Client ID** and **Client secret**.

In n8n, create two credentials with the **same** Client ID/Secret:
- **Google Drive OAuth2 API** → click *Sign in with Google* → approve.
- **Gmail OAuth2 API** → same client → *Sign in with Google* → approve.

> "Access blocked / not verified" → you're not on the Test users list, or you're in the wrong project. Fix that, retry.

---

## 4. Other credentials

- **Groq** ; [console.groq.com](https://console.groq.com) → API Keys → create `gsk_...`. In n8n create a **Groq** credential. (The workflow has 3 Groq model nodes; they can share one credential.)
- **Apify** ; [console.apify.com/settings/integrations](https://console.apify.com/settings/integrations) → personal token `apify_api_...`. This goes in the **config node**, not an n8n credential.
- **Supabase** ; n8n **Supabase API** credential (URL + key), if you use the Supabase node anywhere. (Most Supabase calls here are plain HTTP using the key from config.)

---

## 5. Import the workflow

Workflows → **Import from File** → [`workflow/ats-autopilot.json`](../workflow/). Nodes with a red badge just need a credential selected ; open each and pick the matching credential you created.

Credential-to-node map:

| Credential | Nodes |
|---|---|
| Google Drive OAuth2 | Google Docs API, Create Google Doc, Export to PDF, Upload PDF to Drive |
| Gmail OAuth2 | Send a message |
| Groq | Groq Chat Model 1/2/3 |

---

## 6. Fill the config node

Open **Workflow Configuration1** and set:

| Field | Value |
|---|---|
| `profileDocId` | Google Doc ID of your profile (step 7) |
| `jobSearchQuery` | e.g. `Backend Engineer Java Developer Germany` |
| `userEmail` | where the summary email is sent |
| `apifyToken` | your `apify_api_...` token |
| `apifyActorId` | `curious_coder~linkedin-jobs-scraper` (default) |
| `supabaseUrl` | `https://YOUR_PROJECT.supabase.co` |
| `supabaseKey` | your Supabase key |
| `matchScoreThreshold` | `75` (tune later) |

Also edit **Build LinkedIn URL** if you want a different location/filters (default is Germany-wide, last 24h).

---

## 7. Create your profile Doc

1. Copy [`profile/CANDIDATE_PROFILE.example.md`](../profile/CANDIDATE_PROFILE.example.md) into a new **Google Doc**.
2. Replace every field with your own details. **Keep the section headings unchanged.**
3. Copy the Doc ID from its URL (`docs.google.com/document/d/`**`THIS`**`/edit`) into `profileDocId`.

---

## 8. Test, then activate

1. **Execute workflow** (full run). Watch each stage go green.
2. Verify: a row appears in Supabase `profile` and `applications`, an editable Doc + PDF land in Drive, and a dashboard email arrives.
3. Set **Daily 7 AM Trigger1** to your real time (Hour/Minute), then toggle the workflow **Active**.

---

## Notes & gotchas

- **Groq rate limits** are per-minute and per-day. Repeated *testing* can hit them; a once-daily run won't. Keep `Limit to 5 Jobs` low while testing.
- **The laptop must be awake and Docker running** for the schedule to fire. For unattended daily runs, put the same container on an always-on host (a small VPS) or use n8n Cloud.
- **Dedup** relies on the `applications` table ; the first run of a job generates it; later runs skip it.
- **Model choice matters**: use a capable model (`llama-3.3-70b-versatile`). Small models produce malformed JSON and hallucinate.
