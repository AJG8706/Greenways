# Greenways — Gate 3 Phase Report

**Phase 3: Corner Finder PWA + Demo/QA mode · September 16, 2026 · Status: built and CI-green; awaiting the Broussard on-site field test (HUD spec §12) to close the gate**

## What's built

**The buyer Corner Finder** at `/walk/<slug>` — mobile-first, dark walk surface, bilingual EN/ES with every string from the message catalogs (two strings added to both: the course-mode prompt and the rotate prompt).

- *Flow:* welcome (property name, acres, GPS-honesty framing) → permission explainer with the spec §6 tap order (audio unlock and the iOS orientation prompt inside the gesture, then geolocation) with denied and go-to-Settings states → full-screen arrow HUD → arrival card → completion screen with per-corner times. Help sheet; portrait-only with a rotate prompt; screen wake lock held on the HUD and re-acquired on return.
- *HUD (spec §2–§5, §8–§10):* one tracked corner at a time, always labeled (guardrail #1); arrow with continuous rotation that never sweeps the long way, 180 ms ease-out, reduced-motion respected; live distance in whole feet rate-limited to 4/s; accuracy-weighted position filter with the teleport guard (now re-seeding after 3 consecutive impossible fixes so drives between corners recover); heading low-pass on the circle; arrival at 20 ft held 2 s or 8 ft raw fast path, found-stays-found, vibration + two-tone ding through the pre-unlocked AudioContext; corner strip + picker sheet with live distances and nearest-unfound marking; status line covering weak GPS, lost GPS, compass calibration, and course mode (GPS course while moving when orientation is denied/unavailable); Android declination applied (constant +1.5°E for Beaumont; per-property model is a Phase 6 item).
- *Map mode (spec §10):* north-up drawn mini-map framed on the buyer and tracked corner — screen-pixel pins (tracked: larger, cream-ringed, pulsing halo, name label, dashed guide line; found: green check; others: Harvest Gold numbers), lot line in Trailhead Green over a dark casing, N chip, distance badge lower right. Drawn rendering works fully offline; satellite tiles can layer on without changing the contract.
- *Boundary awareness (spec §7):* deliberately lazy — more than 10 ft outside for 3 s, clear after 2 s back inside, 40 ft entrance exemption; informational banner that never covers the arrow and never sounds.
- *Access:* buyers are anonymous; data loads server-side through the service role while RLS stays closed to anonymous clients. A walk serves only CAD-verified, **locked** corners (guardrail #2). Stake photos come as signed URLs. Link tokens gate access in Phase 5 — until then any slug with locked corners serves, which is what the field test needs.

**Demo/QA mode — the same code path** (locked decision). `?demo=clean|noisy|compass|boundary` swaps only the position/heading source for the deterministic seeded walker (1 Hz fixes with Gaussian noise, scenario compass error until calibrated); filters, arrival, boundary and UI are byte-for-byte the field path. The Demo & QA tray (admin-only surface) has auto-walk, jump-to-arrival, step-outside (radially outward, so it crosses the line from anywhere), calibrate, and reset. The **admin Demo tab** is the launcher: four scenario cards opening the walk in a new tab, gated on locked corners, with the phone-QA URL displayed.

**PWA/offline.** Serwist service worker + web app manifest (brand icons, Pine Shadow standalone shell). App shell and static assets precache; visited walk pages runtime-cache; signed stake photos cache for six hours so arrival cards work with data off. "Open the link before you leave pavement" is the model the field test verifies.

**Walk telemetry (spec §11).** Batched logger with a localStorage offline queue (flush on interval and page-hide); service-role ingest that get-or-creates a per-property public `walk_link` and a `walk_session`. Wired events: `walk_opened`, `permission_granted|denied`, `corner_tracked`, `corner_found {n, seconds, accuracyFt}`, `boundary_exit`, `gps_weak`, `compass_unreliable`, `walk_completed {seconds}`. Demo sessions carry a `demo:` device prefix so analytics can filter them.

## What's tested

- **Unit (Vitest, 44):** everything in `lib/geo` plus the full `lib/hud` core — filter α clamps, >100 ft rejection, teleport guard and its re-seed, heading short-path and continuous rotation, arrival hold/reset/fast-path/hysteresis, boundary warn/clear/entrance-exemption timing, distance formatting and rate limit, walker determinism, speed, compass error until calibration, and wander behavior.
- **E2E (Playwright, 15, green in CI):** the Gate 2 admin suite, plus — **a full simulated walk to completion on desktop and on a phone viewport** (all four corners, arrival cards, per-corner times), map mode round-trip, picker retargeting, the boundary scenario raising and dismissing the banner, the entire walk in Spanish via the cookie locale, PWA manifest and service worker served, and the Demo tab's launch links.
- The E2E caught two real bugs before any field time: the arrival card intercepting taps behind it, and the wander geometry blind spot at corners.

## What's placeholder / deferred

- Intro flyover, corner approach clips, preview-the-walk chapters — Phase 4 media (welcome goes straight to the walk; `intro_skipped`/`clip_played`/`preview_played` events wired but unused).
- Satellite tiles on the buyer mini-map (locked decision: MapLibre + Mapbox) — the drawn map is the offline-safe base; the tile layer goes in when the Mapbox token lands, before or during Phase 5.
- Per-property precache manifest sized for clips — Phase 4/5, when there are clips to precache.
- Lighthouse in CI (stack convention) — deferred to Phase 6 hardening with a flag: Lighthouse removed its PWA category in v12, so the convention needs restating; performance on the mid-range Android profile is better measured at the field test and via Vercel Analytics until then.
- Real-device declination model (constant per property for now), `language_switched` event on the toggle, and Phase 5 link-token access control.

## Decisions I made that you should check

1. **Walks serve without link tokens until Phase 5** (any slug with locked corners). Fine for the field test; flagged so nobody shares a slug publicly before Phase 5 adds tokens.
2. **Demo telemetry is stored, tagged `demo:`** rather than dropped — same code path end to end, filterable later.
3. **Teleport guard re-seeds after 3 consecutive impossible fixes** — an addition beyond the spec so driving between corners (or a demo jump) recovers instead of freezing the arrow.
4. **Arrival keeps the card up while "found stays found"** — Next corner re-targets the nearest unfound; Stay here returns to the HUD still tracking the found corner, per spec §4.
5. Phase 3 telemetry sessions hang off a get-or-created `phase3-<slug>` public link so Phase 5's real links inherit clean session data.

## Open risks carried into the field test

- iOS Chrome compass behavior (the known Gate 1 risk) — course mode is built and unit-tested, but only the on-site test proves it on real hardware.
- Arrival radius (20 ft), boundary thresholds (10 ft / 3 s), and filter constants are all *tune in field* values; §12 says feed the measured numbers back.
- GPS under Lot 4's canopy (the whole lot is wooded — Gate 1 aerial finding): expect the "noisy" scenario, not the "clean" one; the arrival radius decision should be made under the trees.
- Offline behavior is CI-proven at the asset level; the data-off walk on real phones is the §12 step that proves it end to end.

## Inputs needed

1. **The Broussard field test** (HUD spec §12): two phones (mid-range Android Chrome + iPhone Chrome, once Safari), open the link on pavement, data off, a non-technical tester finds all four corners; record per-corner time and accuracy at the ding, false/missed dings, boundary false alarms, battery, sun readability. Send me the numbers and I tune `R_arrive`, the boundary thresholds, and the filter constants.
2. **Team roster emails with roles** — still open from Gate 2.
3. **Mapbox token** when you want satellite on the buyer mini-map (or fold into the Gate-decided Google/Mapbox split).
4. Stake status at Lot 4 (are the four stakes set, do the seeded descriptions match reality?) — the arrival cards show them to the tester.

## Gate 3 ask

Desk-check now: admin → Broussard Lot 4 → **Demo tab → launch each scenario** on your desktop and phone (the full walk, boundary wander, compass-error calibration). Then run the §12 field test at the property and send the numbers back. Gate 3 closes on the field test; Phase 4 (Higgsfield media pipeline) starts on your approval.
