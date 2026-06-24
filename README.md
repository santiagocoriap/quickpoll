# PollForge

A generic, self-hosted polling & voting tool with a **no-code configurable rules system**.
Built for clubs, gaming leagues, friend groups, and small organizations that need polls with
custom rules — per-group vote limits, weighted votes, ranked choice, score voting, tie-break
runoff phases, and more — without writing any code.

> Example: a sim-racing championship votes on car classes and tracks. Regular drivers can pick
> up to 3 of each; the previous champion can pick up to 4. If the result ties, an admin spins up
> a runoff phase from the tied options in one click.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start (Docker)](#quick-start-docker)
- [First run & demo data](#first-run--demo-data)
- [Creating the demo sim-racing poll by hand](#creating-the-demo-sim-racing-poll-by-hand)
- [The rule system explained](#the-rule-system-explained)
- [Local development](#local-development)
- [Database migrations & seeding](#database-migrations--seeding)
- [Backups](#backups)
- [Reverse proxy (Nginx / Caddy)](#reverse-proxy-nginx--caddy)
- [Security](#security)
- [Tests](#tests)
- [Known limitations](#known-limitations)

---

## Features

**Roles**
- **Super Admin** — first account created during setup; manages everything.
- **Poll Admin** — creates and manages their own polls, invites voters, runs tie-breaks.
- **Voter** — votes in polls they can access; sees results when allowed.

**Polls**
- Multiple **sections** per poll, each with its own options, voting method, rules, visibility and tie-breaker.
- Lifecycle: `Draft → Scheduled → Open → Closed → Needs tie-break → Finalized → Archived`.
- Preview as a voter, open/close/reopen, finalize, archive.
- **Sequential stages (optional):** vote one section at a time in order. Only the active stage accepts
  votes; the admin must resolve any tie (runoff) before advancing, and finished stages show their
  results so voters can decide the next stage informed. Ideal for "pick the cars first, then the
  tracks." Advanced a stage by mistake? **Reopen the previous stage** with one click — it's
  non-destructive, so votes already cast are kept. Leave it off and all sections are open at once
  (the default).

**Voting methods**
- Single choice, multiple choice (up to N), ranked choice (instant-runoff + top-N), score voting, approval voting.

**No-code rules**
- Voter groups (Regular Voter, Previous Champion, Steward, …).
- Per-group selection limits (min / max / exact) with a conflict strategy when a voter is in several groups
  (highest, lowest, group priority, or manual override).
- Weighted voting (separate from selection count — e.g. a Steward's vote counts as 2).
- Option eligibility (hide/disable specific options for specific groups).
- Voter eligibility (only certain groups may vote, or exclude groups).
- Deadlines (opens/closes), manual early close, vote editing toggle, anonymity levels.
- An optional **advanced JSON rule mode** (a safe declarative DSL — never executed as code).

**Results & tie-breaks**
- Per-method counting with raw + weighted totals, eligible voters, turnout, winners, tie detection,
  and a plain-English explanation of how the winner was computed.
- Ranked choice shows round-by-round elimination.
- Configurable tie-breakers: manual, runoff phase, instant-runoff, previous round, most first-place,
  most approvals, random draw (visible auditable seed), or keep tie.
- Create a runoff phase from tied options; the original eligible voter list is preserved, and the
  **original round is locked** so its tally can't shift during the tie-break.
- **Runoffs have their own voting config** (method + selection limits), independent of the parent
  section — defaulting to "pick exactly the open seats" (single choice for one seat) so a tie-break
  can actually discriminate, and fully overridable by the admin when creating the runoff.

**Operational**
- Audit log of every important event. Email/password auth, invite links, one-time voter codes,
  public share links, private polls. Server-side validation everywhere. Rate limiting on login & voting.

**Interface**
- **Spanish-first i18n** (default `es`, with an English toggle) — the active language is stored in a
  cookie and rendered server-side, so there is no flash of the wrong language. Switch with the ES/EN
  control in the header (or on the auth screens).
- **Dark mode** — toggle with the 🌙/☀️ button. The choice persists (cookie + localStorage) and is
  applied during SSR, so there is no flash of the wrong theme.

---

## Tech stack

Next.js 14 (App Router) · TypeScript · React · Tailwind CSS · shadcn/ui components
(Radix UI + class-variance-authority) · lucide-react icons · PostgreSQL · Prisma ORM ·
Zod validation · JWT sessions (httpOnly cookies) · bcrypt password hashing · Docker Compose ·
Vitest. No paid third-party services required.

The interface is built on a shadcn/ui-style component kit (`src/components/ui.tsx`, configured via
`components.json`), uses lucide icons throughout (no emojis), and ships light + dark themes.

---

## Quick start (Docker)

Requires Docker + Docker Compose.

```bash
# 1. Configure environment
cp .env.example .env
#    then edit .env and set a strong AUTH_SECRET, e.g.:
#    openssl rand -base64 48

# 2. Build & run
docker compose up --build
```

The app is served on **http://localhost:3000**.

On startup the `web` container automatically waits for Postgres and runs `prisma migrate deploy`,
so the schema is created for you. The first time you open the app you'll be sent to a **setup page**
to create the Super Admin account.

To stop: `Ctrl-C`, then `docker compose down` (add `-v` to also wipe the database volume).

---

## First run & demo data

**Option A — start clean:** open http://localhost:3000 and complete the setup form. Two starter
groups (`Regular Voter`, `Guest`) are created automatically.

**Option B — load the demo sim-racing poll:**

```bash
docker compose exec web npm run db:seed
```

This creates groups, users, and the **"Season 4 Championship Vote"** poll (sections *Car Classes*
and *Tracks*) with per-group limits and a deliberately engineered tie in the *Tracks* section so you
can try the runoff flow immediately.

Demo accounts:

| Role               | Email                       | Password   |
| ------------------ | --------------------------- | ---------- |
| Super Admin        | `admin@pollforge.local`     | `admin1234`|
| Regular Voter      | `voter@pollforge.local`     | `voter1234`|
| Regular Voter      | `rookie@pollforge.local`    | `voter1234`|
| Previous Champion  | `champion@pollforge.local`  | `voter1234`|

> Log in as `admin`, open the poll → **Results** to see the Monza/Spa tie, then the **Tie-break** tab
> to create a runoff phase. Log in as a voter to cast a ballot and watch the live limits
> ("You can select up to 3 tracks" vs. "…up to 4" for the champion).

---

## Creating the demo sim-racing poll by hand

If you'd rather build it through the UI (the no-code path):

1. **Groups** → create `Regular Voter` and `Previous Champion` (give the champion a higher priority,
   e.g. 10, if you plan to use the *PRIORITY* conflict strategy). Assign users to groups in **Users**.
2. **Polls → New poll**:
   - **Step 1 – Basics:** title `Season 4 Championship Vote`, visibility *Private*.
   - **Step 2 – Sections & options:** add a `Car Classes` section (options GT3, GT4, LMP2, TCR, Hypercar)
     and a `Tracks` section (Monza, Spa, Silverstone, Suzuka, Bathurst). Method = *Multiple choice*.
   - **Step 3 – Rules:** in the *Per-group limits* table set `Regular Voter` max = 3 and
     `Previous Champion` max = 4 for each section. Set the tie-breaker to *Runoff phase*.
   - **Step 4 – Review & publish.**
3. Back on the poll page, click **Open poll**, then invite voters (invite link or one-time codes in
   the **Voters & access** tab).
4. After voting, open **Results**; if a section ties, use the **Tie-break** tab to create a runoff.

---

## The rule system explained

Every section carries a rule configuration. At vote time the **rule engine** (`src/lib/rules/engine.ts`)
produces a per-voter evaluation:

```ts
{
  canVote: true,
  minSelections: 0,
  maxSelections: 4,
  voteWeight: 1,
  visibleOptionIds: [...],
  disabledOptionIds: [...],
  explanation: "You are in the Previous Champion group, so you can select up to 4 option(s)."
}
```

How limits resolve when a voter is in **several** groups is controlled by the section's
**conflict strategy**:

- **Highest limit wins** — take the most generous limit.
- **Lowest limit wins** — take the strictest.
- **Group priority order** — use the limit from the voter's highest-priority group.
- **Manual override** — a per-user override on the section wins.

**Weight is independent of selection count.** A champion may pick 4 options while each ballot still
counts once; a steward may pick 3 options while their ballot counts as 2.

**Advanced JSON mode** (optional) lets power users express rules declaratively. It is a *safe*
interpreter — never `eval`, no arbitrary code — validated with Zod before saving and previewed in the UI:

```json
{
  "rules": [
    { "when": { "hasGroup": "Steward" }, "then": { "voteWeight": 2 } },
    { "when": { "hasAnyGroup": ["Guest"] }, "then": { "maxSelections": 1 } }
  ]
}
```

Conditions: `hasGroup`, `hasAnyGroup`, `hasAllGroups`, `and`, `or`, `not`, `always`.
Effects: `minSelections`, `maxSelections`, `exactSelections`, `voteWeight`, `canVote`.

The **result engine** (`src/lib/rules/results.ts`) and **tie-break engine** (`src/lib/rules/tiebreak.ts`)
are pure, deterministic and unit-tested. Random tie-breaks use a **visible seed** so any outcome can be
reproduced and audited.

All ballots are validated **server-side** on submission; client-side checks are a convenience only.

---

## Local development

```bash
npm install
cp .env.example .env        # point DATABASE_URL at a local Postgres

# start a throwaway Postgres if you don't have one:
docker run -d --name pf-pg -e POSTGRES_USER=pollforge -e POSTGRES_PASSWORD=pollforge \
  -e POSTGRES_DB=pollforge -p 5432:5432 postgres:16-alpine

npx prisma migrate deploy   # or: npx prisma migrate dev
npm run db:seed             # optional demo data
npm run dev                 # http://localhost:3000
```

Useful scripts: `npm run build`, `npm start`, `npm test`, `npm run prisma:generate`.

---

## Database migrations & seeding

- Migrations live in `prisma/migrations/`. In production the container runs
  `prisma migrate deploy` on start (see `docker-entrypoint.sh`).
- Create a new migration after schema changes: `npx prisma migrate dev --name <change>`.
- Seed demo data: `npm run db:seed` (locally) or `docker compose exec web npm run db:seed`.

---

## Backups

PostgreSQL data is stored in the `pgdata` Docker volume. Back it up with `pg_dump`:

```bash
# Create a compressed dump
docker compose exec -T db pg_dump -U pollforge -Fc pollforge > pollforge-$(date +%F).dump

# Restore into a running db service
docker compose exec -T db pg_restore -U pollforge -d pollforge --clean < pollforge-YYYY-MM-DD.dump
```

Plain SQL alternative: `pg_dump -U pollforge pollforge > backup.sql`.
Schedule the dump with cron on the host for regular backups.

---

## Reverse proxy (Nginx / Caddy)

Run the app behind a proxy that terminates TLS. Keep port 3000 internal (don't publish it publicly).

**Caddy** (automatic HTTPS) — `Caddyfile`:

```
polls.example.com {
    reverse_proxy localhost:3000
}
```

**Nginx**:

```nginx
server {
    listen 443 ssl;
    server_name polls.example.com;

    ssl_certificate     /etc/letsencrypt/live/polls.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/polls.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set `NEXT_PUBLIC_APP_URL` to your public HTTPS URL so invite/share links are generated correctly.
Behind a proxy, session cookies are `Secure` in production — serve over HTTPS.

---

## Security

- Passwords hashed with **bcrypt** (cost 12).
- Sessions are signed **JWTs** in `httpOnly`, `SameSite=Lax`, `Secure` (prod) cookies.
- All inputs validated with **Zod**; all authorization checks run server-side.
- Vote submission re-validates every ballot against the rule engine regardless of the client.
- **Duplicate voting** prevented by a unique constraint per `(section, phase, voter)`.
- One-time voter codes are stored **hashed** (only shown once at creation).
- **Rate limiting** on login and vote submission.
- Advanced rules are a sandboxed declarative DSL — **no arbitrary code execution**.
- Secrets come from environment variables (`AUTH_SECRET`, `DATABASE_URL`).

> Note: the in-memory rate limiter and JWT sessions suit a single-instance private deployment.
> For horizontal scaling, move the limiter to Redis and consider a shared session store.

---

## Tests

Pure-engine unit tests (rule evaluation, vote validation, result calculation, tie detection,
ranked-choice elimination, per-group limits, weighted voting, advanced DSL) run with Vitest:

```bash
npm test
```

Includes the required sim-racing scenario: regular voters max 3 tracks, champion max 4, a regular
voter submitting 4 is rejected, a champion submitting 4 is accepted, ties are detected, and a runoff
phase can be created from tied options.

---

## Known limitations

- **Multi-winner ranked choice** uses *sequential instant-runoff* (extract one winner at a time),
  not full STV with surplus transfer. Single-winner IRV is standard.
- The **rate limiter is in-memory** (per instance) and **sessions are stateless JWTs** — great for a
  single-node private deployment, less so for multi-node without Redis/a shared store.
- No built-in transactional **email** sending — invites/codes are shared as links/codes by the admin.
- Poll editing after creation is intentionally limited (status transitions, access, tie-break phases);
  deep re-editing of an open poll's options is out of scope for the MVP to protect ballot integrity.
- The advanced JSON DSL covers limits/weight/eligibility effects; it is intentionally small and safe
  rather than a general expression language.
- i18n covers the full UI chrome and the voter-facing "your limits" explanations. A few
  **server-generated result explanations** (e.g. the round-by-round winner rationale produced by the
  result engine) are still emitted in English; localizing those would mean returning structured
  explanation data from the engine, which is left as a follow-up. Only `es` and `en` ship today; adding
  a locale is just another dictionary in `src/lib/i18n.ts`.
```
