# Greenways — Phase 2 Kickoff (Claude Code)

**Gate 1 approved September 15, 2026. Phase 2: Foundation & Admin Console → Gate 2.**

Phase 2 is a real codebase, so it runs in Claude Code on your machine (or a Claude Code cloud environment). This page is everything needed to start it: a 10-minute setup, the prompt to hand Claude Code, the accounts it will need, and the decisions that land at Gate 2. Gate reviews come back to this Cowork Project.

---

## 1. Setup (once, ~10 minutes)

1. **Get the hand-off package.** It is in Drive at `TGP/Z Business/Operations/Property Walkthrough Tool/Development Planning/Phase 1/greenways-phase1-handoff.zip`. Unzip it somewhere local, e.g. `C:\dev\greenways`.
2. **Make it a repo.** Create an empty private GitHub repo named `greenways` under your account. In PowerShell:
   ```
   cd C:\dev\greenways
   git init && git add . && git commit -m "Phase 1 hand-off: plan, design system, catalogs, spec, brand, pilot data"
   git branch -M main && git remote add origin https://github.com/<you>/greenways.git && git push -u origin main
   ```
3. **Prerequisites on the machine:** Node 20+ (`node -v`), pnpm (`npm i -g pnpm`), Git, and Docker Desktop if you want Supabase to run locally during the build (recommended — it keeps the free tier untouched until launch). Claude Code itself: `npm i -g @anthropic-ai/claude-code`, then sign in once.
4. **Start Claude Code in the repo:** `cd C:\dev\greenways` then `claude`. It reads `CLAUDE.md` automatically. Paste the kickoff prompt from §2.

If you'd rather not install anything locally, open the repo in a Claude Code cloud environment instead; everything below works the same, except the Phase 3 field test is easier with a local dev server on your own network.

---

## 2. The kickoff prompt (paste into Claude Code)

```
You are starting Phase 2 of Greenways. Read CLAUDE.md first, then docs/TGP-Walkthrough-Project-Plan-v1.md (§3 Phase 2 acceptance) and docs/greenways-hud-interaction-spec.md. The Gate 1 prototype at phase1/dist/greenways-prototype.html is the visual and interaction reference; open it in a browser before writing UI.

Phase 2 scope — Foundation & Admin Console:
1. Scaffold: Next.js 15 App Router + TypeScript (strict), pnpm, Tailwind using phase1/src/tailwind.preset.js and phase1/src/greenways.css, shadcn/ui re-themed to the Greenways tokens, next-intl with phase1/src/messages/en.json and es.json (cookie locale, no path prefix), next/font self-hosting Zilla Slab and Atkinson Hyperlegible Next. Two surfaces: [data-surface="light"] admin, [data-surface="walk"] buyer.
2. Supabase: migrations for the v1 data model in CLAUDE.md, RLS on every table, typed client via supabase gen types, magic-link auth that only succeeds for emails present in the invites/team_users tables (invite-only), roles admin|editor. Run Supabase locally with the CLI during the build; a hosted project is wired in when the keys arrive.
3. Admin console (desktop, English): sign-in, properties list with status pills, property editor with tabs — Overview (assemble checklist), Corners (KML import → boundary polygon + corners auto-numbered clockwise from the entrance; MapLibre map with satellite when a key exists and the drawn fallback otherwise; drag-to-adjust only after admin unlock, unlock logged), Photos (capture-protocol checklist with upload to Supabase Storage), Content (paired EN/ES fields, "Draft Spanish" helper via the Anthropic API, "reviewed by a person" flag that blocks publish while unset), Team (invites). Media, Publish, Analytics and Demo tabs exist as stubs with the Phase 4–5 empty states.
4. Import data/lot4_gaines_acres.kml as the first property; data/lot4-google-aerial.jpg + .json is an internal test image only, never served to buyers.
5. Quality bar: Vitest for lib/geo (local-feet projection, bearing, point-in-polygon, signed distance), Playwright for sign-in → create property → import KML → corners table; CI on GitHub Actions (lint, typecheck, test, build); Sentry wired but optional via env.
6. Deliver as small PRs with conventional commits. When the Vercel token arrives, connect the repo so every PR gets a preview URL.

Gate 2 acceptance: Broussard Lot 4 entered end-to-end from the KML plus photos; a second team member can sign in via invite and edit; CI green; a preview URL I can click through. End the phase with docs/Gate-2-Phase-Report.md in the same shape as docs/Gate-1-Phase-Report.md (built / tested / open risks / decisions to check / inputs needed).

Rules that do not bend: the guardrails in CLAUDE.md; no hard-coded English in buyer components; corners only from CAD-verified geometry; nothing generated reaches a buyer without a human approving it.
```

---

## 3. Accounts and keys Claude Code will ask for

Create each under **alton@texasgreenerpastures.com** so nothing depends on anyone else. Hand the values to Claude Code as `.env.local` entries (never committed).

| Service | What to create | What to hand over | When it's needed |
|---|---|---|---|
| GitHub | private repo `greenways` | nothing (Claude Code uses your git login) | Day 1 |
| Supabase | free project `greenways` (region: US East) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | before Gate 2 (local Supabase covers the build until then) |
| Vercel | Hobby account, import the GitHub repo | `VERCEL_TOKEN` (Settings → Tokens) | before Gate 2 (preview URL) |
| Map imagery | see §4 — Google Maps Platform key **or** Mapbox token | `NEXT_PUBLIC_GOOGLE_MAPS_KEY` or `NEXT_PUBLIC_MAPBOX_TOKEN` | Phase 2 Corners tab; required by Phase 3 |
| Anthropic | API key for the Spanish draft helper | `ANTHROPIC_API_KEY` | Phase 2 Content tab |
| Higgsfield | API key from your existing account | `HIGGSFIELD_API_KEY` | Phase 4 |
| Sentry | free project (optional) | `SENTRY_DSN` | any time |

Also needed before Gate 2 ends: the **team roster with roles** (admin vs. editor) for the invites table, and the **Broussard photos to protocol** plus stake status/descriptions for the pilot property record.

---

## 4. Decisions that land at Gate 2

**Map imagery provider.** You liked the Google look. The trade-off is offline behavior, which the plan promised for the walk. The arrow and distance are pure math on GPS and work fully offline regardless; the question is only what the map layer does when the signal drops.

| Option | Imagery | Offline map | Cost at TGP volume | Note |
|---|---|---|---|---|
| Google Maps Platform (Maps JavaScript API, satellite) | Best, what you saw | No — Google's terms prohibit caching tiles; the map shows whatever the browser still has, and the drawn lot outline stays | Free tier covers it (per-SKU monthly free usage) | Needs a Google Cloud project with billing enabled, key restricted to the domain |
| Mapbox Satellite (MapLibre GL) | Very good, slightly older in rural TX | Browser cache only; same behavior as Google in practice | Free tier covers it | No billing setup; token in TGP account |
| Per-property static image (Mapbox Static Images, 30-day cache permitted) precached with the walk | Good | **Yes** — the one option where the map survives no-signal | Free tier | Fixed frame per property (like the test capture); pan/zoom limited to that frame |

Recommendation: **Google Maps Platform for the admin console and online walks, plus a precached Mapbox static frame per property as the offline fallback for the walk.** It gives the look you want where the signal exists and keeps the map alive where it doesn't. Claude Code can wire both behind one `MapLayer` component; the decision only needs a yes at Gate 2.

**Hosting tier timing.** Stay on Vercel Hobby and Supabase Free through Gate 5; move to Pro on both at Gate 6 (Vercel's Hobby terms exclude commercial use once real buyers are on it).

---

## 5. How gates work from here

Each phase ends with a preview URL and a `Gate-N-Phase-Report.md` in the repo. Bring the report and the link back to this Project for the review; anything that needs your connected tools (Monday, GHL/n8n wiring, Higgsfield MCP checks, Drive) runs here. Phase 3's Broussard field test uses the Gate 3 protocol in the HUD spec §12 — two phones, data off after load, a non-technical tester, and the numbers fed back into the arrival and boundary thresholds.
