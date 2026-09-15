# Greenways by Texas Greener Pastures — Project Plan & Approval Gates

**Texas Greener Pastures · v1.1 · September 15, 2026 · Status: Gate 0 approved Sep 15 · Gate 1 approved Sep 15 · Phase 2 underway in Claude Code**

This plan turns the two planning docs (Phased Development Plan v1.0, Higgsfield Prompt Library v1.0) and the Greenways brand kit v1.0 into a buildable, gated program. Decisions confirmed with Alton on 2026-09-15 are marked **[locked]**. Everything else is my recommendation and is open to change at Gate 0.

**v1.1 changes:** product is named **Greenways** and uses the Greenways brand kit (Development Planning/Branding); buyer app is **bilingual English/Spanish** from day one; inputs 4 and 6 in §4 are resolved.

---

## 1. What is being built

**Greenways** — one web application, three surfaces, one database:

| Surface | Users | Device | Purpose |
|---|---|---|---|
| **Admin Console** | TGP team (invite-only) | Desktop browser | Create properties, import KML, place/verify corners on satellite, upload photos to protocol, run Higgsfield generation, review/approve media, publish, issue links + QR, see walk analytics. |
| **Buyer Walkthrough** | Prospects (no account, ever) | Android + iPhone, mostly Chrome | Metal-detector corner finder: one big labeled arrow, live distance, arrival ding + stake photo, corner picker, satellite mini-map, boundary warning, cinematic intro and corner clips, off-site preview mode. Works after data drops. **English and Spanish** — auto-detects the phone's language, one-tap toggle always visible. |
| **Demo / QA Mode** | Team + exhibition audiences | Any | Launched from the Admin Console via a "Demo example" selector. Simulates a polished buyer walk corner-to-corner (GPS and heading synthesized along a path) so the full experience — arrow, countdown, arrival, clips — plays anywhere. Same code path as the real walk, so it is also the QA tool. |

### Locked product decisions
- **[locked]** Full platform (admin + DB + auth + analytics), not static pages.
- **[locked]** Vercel + Supabase, built correctly, minimal spend during build/test.
- **[locked]** Higgsfield media generated **directly via API** with a human review queue.
- **[locked]** Links are **both**: one public link + QR per property, plus tokenized per-prospect links from the GHL booking trigger.
- **[locked]** Team sign-in: **email magic links, invite-only**.
- **[locked]** Buyer app includes a **satellite mini-map** with lot outline, corner pins, live position — arrow HUD stays primary.
- **[locked]** Exhibition = **simulated-walk demo mode inside the admin portal**, not a public landing page.
- **[locked]** Approvals: **gate per phase with a live preview URL**.
- **[locked]** Buyer app is **bilingual English/Spanish** from the first mockup. Admin console is English; buyer-facing free-text the team enters (property display name, stake descriptions, custom corner names, arrival notes) gets paired EN/ES fields with a one-click draft-translation helper the editor reviews before publish.
- **[locked]** Brand = **Greenways brand kit v1.0** (Development Planning/Branding): Pasture Green / Pine Shadow / Prairie Cream / Sage Mist / Harvest Gold core, Trailhead Green for path, hotspots and "you are here," Harvest Gold for corner pins, Fence Post Red for errors only; Zilla Slab headings, Atkinson Hyperlegible Next UI; light surfaces for admin, dark Pine Shadow chrome for the walk so the land stays the brightest thing on screen. `greenways-tokens.css` / `.json` are the source of truth for design tokens; logos ship from the SVG masters; PWA icons and favicons come straight from the kit.
- Standing guardrails from the plan carry over unchanged: one tracked corner at a time; media must depict real land; GPS honesty copy in the UI; corners from CAD-verified geometry only; buyer never needs an account or install; link → walking in under 30 seconds.

---

## 2. Architecture & stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | One codebase for admin, buyer PWA, and API routes; Vercel-native. |
| UI | **Tailwind CSS + shadcn/ui**, themed from `greenways-tokens.css`; fonts self-hosted via `next/font` (Zilla Slab, Atkinson Hyperlegible Next) | Fast to build, consistent, accessible; tokens keep brand exact; self-hosted fonts render offline in the field. |
| i18n | **next-intl**, cookie-based locale (no path prefix) so one link/QR serves both languages; full EN + ES message catalogs; localized number/distance formatting | Bilingual buyers, single shareable link. |
| Database / auth / storage | **Supabase** (Postgres, Auth magic links, Storage, Row Level Security) | One vendor for the whole backend; free tier for build/test. |
| Hosting / CI | **Vercel** with GitHub integration — every PR gets a preview URL | Gate previews for free; production deploy on merge. |
| Maps | **MapLibre GL JS + Mapbox Satellite tiles** (token in Alton's account) | Free tier (50k loads/mo) is far above need; no Google billing setup. |
| PWA / offline | **Serwist** service worker; per-property precache manifest (config, corner photos, clips) | "Open the link before you leave pavement" actually works. |
| Positioning | Geolocation API (high accuracy, watch mode) + DeviceOrientation (iOS permission wrapper, `webkitCompassHeading` fallback) + a Kalman-style smoothing filter on bearing/distance | Stable arrow, honest ±10–15 ft, no jitter. |
| Media generation | **Higgsfield API** — image-to-video with camera presets and start/end frames, per the Prompt Library; job table + polling + review queue | Hands-off except the reality-check review. |
| Integrations | **n8n** webhook (walk-pack SMS via GHL on tour booking, per-prospect link issuance), **Monday.com** API (write walkthrough link to Inventory row `18418085202`), WordPress listing link | Reuses the stack TGP already runs. |
| Testing | Vitest (units: geodesy, bearing, arrival logic), Playwright (admin flows + simulated-walk E2E), Lighthouse PWA/perf budget | Multimillion-dollar-shop hygiene, enforced in CI. |
| Observability | Vercel Analytics + Sentry (free tier) + walk-event table | Know when a buyer's compass failed before they tell you. |

### Data model (v1)
`properties` (with `i18n` jsonb for EN/ES display fields) · `corners` (label, lat/lng, order, stake description EN/ES, approach photo, stake photo) · `media_assets` (type, slot, storage path, status: generated/approved/rejected, source photo, higgsfield job id) · `generation_jobs` · `walk_links` (public or prospect-token, GHL contact id, preferred locale) · `walk_sessions` (locale used) / `walk_events` (opened, corner selected, arrived, clip played, left boundary, compass error, language switched) · `team_users` + `invites` (admin / editor) · `demo_scenarios`.

### Cost plan (minimal-budget build, correct at launch)

| Item | During build/test | At launch |
|---|---|---|
| Vercel | Hobby — $0 | **Pro $20/mo** (Hobby's terms exclude commercial use; needed for a business tool) |
| Supabase | Free — $0 (500 MB DB, 1 GB storage; project pauses after 7 idle days) | **Pro $25/mo** (no pause, 100 GB storage, backups) — or stay Free + move video to Cloudflare R2 (10 GB free, zero egress). Decide at Gate 6 from measured asset sizes. |
| Mapbox | Free | Free at TGP volume |
| Higgsfield API | Credits — validate on one property first (Prompt Library rule) | Est. ~$10–30 per property incl. regenerations; verify actual rate at Gate 4 |
| Sentry, GitHub | Free | Free |
| Domain | `greenways.texasgreenerpastures.com` CNAME — $0 (a standalone domain is your call; not needed for launch) | $0 |

Build-phase spend: effectively $0 plus Higgsfield credits. Launch run-rate: ~$45/mo plus credits.

---

## 3. Phases and approval gates

Each phase ends with: a deployed preview URL, a short phase report (built / tested / open risks / next), and a demo path you can click through. **You approve before the next phase starts.**

### Gate 0 — Plan approval *(this document)*
You approve: scope, stack, cost plan, gate structure, and the input list in §4.

### Phase 1 — Design system & clickable mockups → **Gate 1**
- Greenways design system in code: tokens from the kit, type scale (Display 40/44 → Small 14/21 per the spec), spacing, iconography, component library (buttons, pills, cards, HUD elements, map chrome), light admin theme and dark walk theme, all pairings held to the kit's WCAG grades.
- High-fidelity screens: Admin (property list, property editor with satellite corner editor, photo protocol checklist, EN/ES content fields, generation + review queue, publish/links/QR, analytics, demo selector) and Buyer (permission explainer, intro, arrow HUD, corner picker, arrival card, mini-map, boundary warning, preview mode, offline state, language toggle) — every buyer screen shown in both English and Spanish.
- Bilingual copy deck: all buyer-facing strings in EN and ES, written for non-technical readers in bright sun (short, large, no jargon), including the GPS-honesty line and the walk-pack SMS.
- Interaction spec for the arrow HUD (motion, smoothing, arrival radius, haptics, audio).
- **Acceptance:** you can click through both apps as a prospect (in either language) and as an admin and sign off on look, copy, and flow.

### Phase 2 — Foundation & Admin Console → **Gate 2**
- GitHub repo, CI (lint, typecheck, tests, Lighthouse), Vercel preview deployments, Supabase project + migrations + RLS.
- Magic-link auth, invites, roles (admin / editor).
- Property CRUD; KML import (buyer-lot-map output) → boundary polygon + auto-named corners C1…Cn clockwise from entrance; corner editor on satellite with drag-to-adjust and a "CAD-verified" lock; entrance point; stake descriptions; photo upload against the capture-protocol checklist.
- **Acceptance:** Broussard Lot 4 entered end-to-end from `lot4_gaines_acres.kml` + photos; a second team member can sign in via invite and edit.

### Phase 3 — Corner Finder PWA + Demo/QA mode → **Gate 3**
- Buyer app: permission explainer, full-screen arrow HUD with large corner label and live feet, corner picker with distances, arrival (≈20 ft: vibration + tone + stake card), boundary warning, satellite mini-map, portrait lock, precache/offline, GPS-honesty copy.
- Demo/QA mode from the admin "Demo example" selector: synthesized walk path with adjustable speed, GPS noise, and compass error, so the same UI is exercised without being on-site.
- **Acceptance:** on-site test at Broussard — a non-technical tester finds all 4 corners unassisted; bearing correct after calibration; works with data off after initial load; demo mode plays a full simulated walk on desktop and phone.

### Phase 4 — Higgsfield media pipeline → **Gate 4**
- Prompt templating from the Prompt Library (intro flyover, entrance, corner approaches with start/end frames, homesite orbit, panorama outpaint) filled from the property record.
- Job queue → Higgsfield API → asset ingest → **review queue** (generated clip beside its source photo; approve / reject-with-reason / regenerate) → approved assets fill the property's media slots.
- Credits discipline built in: generate intro + entrance first, lock style, then batch corners.
- **Acceptance:** full Broussard asset set generated and reality-verified in the review queue; rejected clips regenerate from the same job.

### Phase 5 — Integration, links & analytics → **Gate 5**
- Intro on first open (skippable), arrival triggers that corner's clip, "Preview the walk" off-site sequence per the Prompt Library stitch order; media never blocks the HUD.
- Public link + QR per property; per-prospect tokenized links; n8n/GHL webhook to issue links on the Property Tours calendar (`xBSMR6gHnlxKqJfB5Pte`) booking and drop the walk-pack SMS snippet in the contact's language (EN default, ES when the GHL contact indicates Spanish); optional GHL "Seen the Property" stage advance on first arrival event.
- Walk analytics in admin: opened, corners found, hesitation (time-to-corner), boundary exits, compass failures.
- Monday.com: walkthrough link written to the Inventory row.
- **Acceptance:** cold-open to corner-found in under 30 seconds by a first-time user; a booked test contact receives a working tokenized link; analytics show the session.

### Phase 6 — Creation automation & production hardening → **Gate 6**
- One-click **Assemble property**: KML + photos in → corners, prompts, generation, review, publish, link, QR, SMS snippet out. Remaining human steps: photos to protocol, one review pass.
- Hardening: security review (RLS, token entropy, rate limits), performance budget on a mid-range Android, accessibility pass (large targets, contrast, reduced motion), error states, Sentry, backups, runbook, team user guide.
- Launch-cost decision (Vercel Pro / Supabase Pro vs. R2 for media).
- Brand-spec pre-production items: USPTO search on "Greenways" (software + real estate classes) before any signage or public exhibition; confirm shared greens/gold against TGP's original logo source if one exists.
- **Acceptance:** second property (e.g., Sealy Lot 12) assembled start-to-finish in under one hour of hands-on time; CI green; Lighthouse PWA + performance targets met.

### Phase 7 — Pilot & launch → **Launch approval**
- Broussard Lot 4 pilot with a real prospect visit; collect the Phase 5 field data; fix list.
- Stake + QR-sign standard, walk-pack SMS automation live, walkthrough link on each active listing page and Inventory row.
- Team training session/doc; ownership handoff (accounts, secrets, runbook).

---

## 4. Inputs needed from Alton

Resolved 2026-09-15: **Brand** — Greenways brand kit v1.0 in Development Planning/Branding. **Spanish** — buyer app is bilingual EN/ES from day one.

Still needed (none block Phase 1; items 1–3 are needed before Phase 2 ends):

1. **Accounts under TGP ownership** — create Vercel, Supabase, and Mapbox accounts with alton@texasgreenerpastures.com and give me tokens (Vercel token, Supabase project URL + service key, Mapbox token). Higgsfield: API key from your existing account. GitHub: a repo under your account with me invited, or a PAT.
2. **Team roster + roles** for invites (Alton admin; Rosalia, Ferdy, Laura, Joseph, Lizzie — who is admin vs. editor?).
3. **Broussard Lot 4 field inputs** — photos taken to the capture protocol (or a date they will be), whether corner stakes are set, and stake descriptions (cap color, flagging, height). KML is already in Drive (`lot4_gaines_acres.kml`).
4. **DNS** — who hosts DNS for texasgreenerpastures.com so a CNAME for `greenways.` can be added at Gate 5.
5. **Timeline driver** — is there a Broussard prospect visit date the Phase 3 field test should hit?

---

## 5. Known risks and how the plan handles them

| Risk | Handling |
|---|---|
| iOS compass requires a user-gesture permission and returns no heading in some Chrome-on-iOS cases | One-tap explainer wrapper; fallback to GPS course-over-ground while moving; explicit "turn slowly to calibrate" prompt; tested at Gate 3 on both platforms. |
| Consumer GPS ±10–15 ft; corners under canopy drift more | Smoothing filter, arrival radius tuned in the field, GPS-honesty copy, stakes finish the job. |
| Higgsfield invents features | Mandatory side-by-side review queue; nothing reaches a buyer unapproved; prompts carry the global no-invention suffix. |
| Offline video precache size | Cap clip length/bitrate per Prompt Library specs; precache manifest per property; measure at Gate 4. |
| Supabase Free project pauses after 7 idle days | Fine during build; resolved by Pro or a keep-alive at launch (Gate 6 decision). |
| Vercel Hobby is non-commercial | Build on Hobby; move to Pro at launch. |
| Per-prospect tokens leak | Long random tokens, optional expiry, revocation from admin, no PII in the URL. |
