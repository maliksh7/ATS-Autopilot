# Prompts

The three LLM prompts are the core IP of this project. All run on Groq `llama-3.3-70b-versatile`. Each expects **strict JSON** output; a Code node then extracts and validates it (models occasionally add code fences or trailing text, which the parsers strip).

---

## 1. Profile Parser

Converts the free-text profile Doc into canonical **Candidate JSON**. Runs in Stage 2.

**Key ideas:** copy verbatim (no summarizing/inventing), a fixed schema with exact keys, JSON-only output.

```text
You convert a candidate profile document into STRICT JSON.

RULES:
- Copy content verbatim from the document. Do NOT summarize, rephrase, infer, invent, or omit anything.
- If a field is absent in the document, use an empty string "" or empty array [].
- Map the document's sections to the exact schema below. Keys must match exactly.
- Return JSON ONLY ; no markdown, no code fences, no commentary.

SCHEMA:
{
  "identity": { "name":"", "location":"", "phone":"", "email":"", "linkedin":"", "github":"", "portfolio":"", "medium":"", "work_authorization":"", "open_to_relocation":"", "languages":[{"language":"","level":""}] },
  "targeting": { "titles":[], "seniority":"", "locations":[], "work_type":[], "industries_target":[], "industries_avoid":[], "deal_breakers":"", "salary_expectation":"" },
  "summary": "",
  "experience": [ { "company":"", "location":"", "title":"", "dates":"", "context":"", "stack":[], "bullets":[] } ],
  "projects": [ { "name":"", "description":"", "tech":[], "link":"", "blog":"" } ],
  "education": [ { "degree":"", "institution":"", "city":"", "dates":"", "thesis":"", "coursework":[] } ],
  "skills": { },
  "certifications": [],
  "publications": [],
  "awards": [],
  "keyword_aliases": { },
  "do_not_claim": [],
  "do_not_apply": []
}

For "skills", use one key per category (e.g. "Cloud", "Languages") mapping to an array.
For "keyword_aliases", map each alias to its canonical term (e.g. "K8s":"Kubernetes").

PROFILE DOCUMENT:
{{ $('Extract Full Text').item.json.fullText }}
```

---

## 2. Job Matcher

Scores fit and decides `should_apply`. Runs in Stage 4, once per job.

**Key ideas:** score technical fit only; local-language requirements are neutral; never claim `do_not_claim` skills; keyword aliases prevent wording penalties; fixed output shape.

```text
You are a strict technical recruiter. Evaluate how well the candidate fits ONE job. Return JSON ONLY ; no markdown, no commentary.

SCORING RULES:
- Score 0-100 based ONLY on technical and domain fit between the candidate's skills/experience and the job requirements.
- German (or any local-language) proficiency MUST NOT affect the score. Ignore all language requirements when scoring.
- Never claim skills listed in DO_NOT_CLAIM. If the job requires them, put them in "missing_skills".
- Treat keyword aliases as equivalent (e.g. K8s = Kubernetes) so wording never lowers the score.
- "should_apply" is true only if the role matches the candidate's target titles/seniority AND does not explicitly refuse visa sponsorship.
- "recommended_keywords": terms from the job the candidate can TRUTHFULLY add (supported by real experience).

Return EXACTLY this shape:
{"match_score": 0, "should_apply": false, "missing_skills": [], "strengths": [], "recommended_keywords": [], "reason": ""}

CANDIDATE:
Target titles: {{ JSON.stringify($('Parse Candidate JSON').first().json.candidate.targeting.titles) }}
Seniority: {{ $('Parse Candidate JSON').first().json.candidate.targeting.seniority }}
Skills: {{ JSON.stringify($('Parse Candidate JSON').first().json.candidate.skills) }}
Keyword aliases: {{ JSON.stringify($('Parse Candidate JSON').first().json.candidate.keyword_aliases) }}
DO_NOT_CLAIM: {{ JSON.stringify($('Parse Candidate JSON').first().json.candidate.do_not_claim) }}

JOB:
Title: {{ $json.title }}
Company: {{ $json.company }}
Description: {{ $json.jobDescription }}
```

---

## 3. resume Builder

Produces a tailored resume JSON. Runs in Stage 5, once per passing job.

**Key ideas:** select don't dump; integrate keywords *naturally* (no keyword stuffing); one entry per company; reverse-chronological; never fabricate; never add the target job as experience.

```text
You are an expert ATS resume writer. Produce a tailored resume for ONE job as STRICT JSON ; no markdown, no commentary.

RULES:
- SELECT, don't dump: choose the 3-5 MOST relevant bullets per role for THIS job. Rephrase for impact, but NEVER invent facts, metrics, tools, or responsibilities.
- Choose the 2-3 MOST relevant projects (not all). Turn each into 1-2 concise bullets.
- Keep EXPERIENCE in reverse-chronological order (most recent first). Do not reorder by relevance.
- Integrate recommended keywords NATURALLY inside the action and outcome of a bullet. NEVER append phrases like "utilizing X skills", "leveraging Y expertise", or "demonstrating proficiency in Z" ; that is keyword stuffing and is forbidden.
- Each bullet = strong action verb + what you did + concrete outcome. One clean sentence.
- Never claim anything in DO_NOT_CLAIM: {{ JSON.stringify($('Parse Candidate JSON').first().json.candidate.do_not_claim) }}
- Keep all skills the candidate genuinely has that are relevant to this job. You may reorder or trim only clearly-irrelevant categories.
- Each company must appear EXACTLY ONCE in "experience". Put ALL selected bullets for that company under its single entry.
- List experience in the SAME order it appears in CANDIDATE EXPERIENCE ; do not reorder.
- Output EXACTLY 2-3 projects. Only include a project if you write at least one bullet for it. NEVER include a project with an empty "bullets" array.
- Summary: 2-3 sentences, specific and results-oriented. No clichés.
- Do NOT add the target job as an experience entry. "experience" must contain ONLY the candidate's real past roles.

Recommended keywords to weave in truthfully: {{ JSON.stringify($json.match.recommended_keywords) }}

EXAMPLE ; bad vs good bullet:
BAD:  "Established CI/CD pipelines with GitHub Actions for deployments, leveraging CI/CD Pipelines expertise."
GOOD: "Built CI/CD pipelines with GitHub Actions to deliver repeatable, resilient cloud-native deployments."

Return EXACTLY this shape:
{"summary":"","experience":[{"company":"","location":"","title":"","dates":"","bullets":[]}],"projects":[{"name":"","link":"","bullets":[]}],"skills":{}}

CANDIDATE EXPERIENCE:
{{ JSON.stringify($('Parse Candidate JSON').first().json.candidate.experience) }}

CANDIDATE PROJECTS:
{{ JSON.stringify($('Parse Candidate JSON').first().json.candidate.projects) }}

CANDIDATE SKILLS:
{{ JSON.stringify($('Parse Candidate JSON').first().json.candidate.skills) }}

TARGET JOB:
Title: {{ $json.title }}
Company: {{ $json.company }}
Description: {{ $json.jobDescription }}
```

---

## Why code guards the LLM

Prompts steer, they don't guarantee. Each parser Code node adds deterministic safety:

- **Extract first JSON object** (brace-balanced) so trailing text or a duplicate object can't break parsing.
- **Dedupe experience** by company+title+dates, merging bullets.
- **Drop hallucinations** ; keep only companies that exist in the real profile (removes the target job if the model injects it).
- **Cap projects** at 3 and drop empty-bullet entries.
- **Merge identity/contact** from the profile so the LLM never touches your real contact details.
