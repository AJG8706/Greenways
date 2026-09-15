# Greenways — Gate 1 Phase Report

**Phase 1: Design system & clickable mockups · September 15, 2026 · Status: Gate 1 approved by Alton, Sep 15, 2026 — Phase 2 kicked off in Claude Code**

## What's built

**Clickable prototype (published artifact "Greenways Prototype").** One page, two surfaces, switchable at the top. Open it on your phone for the buyer walk and on a desktop for the admin console.

- *Buyer walk:* welcome → permission explainer → intro flyover (placeholder motion over the aerial) → arrow HUD with live distance, corner strip, picker sheet, a map mode that takes the compass's space (compact arrow on the right edge, distance badge lower right, framed on you and the tracked corner; the tracked corner gets a larger cream-ringed pin, a pulsing halo, a name label, and a dashed guide line from your position; found corners show a check), boundary warning, arrival card with stake description (**Next corner** / **View corner**), completion screen with per-corner times, off-site preview mode with chapters, help sheet. Every screen in English and Spanish via the ES/EN chip; the choice is remembered on that phone.
- *Simulated walker on the real Lot 4 corners* (from `lot4_gaines_acres.kml`, Jefferson CAD): 1 Hz GPS with Gaussian noise, smoothing, arrival at 20 ft with debounce, boundary detection with hysteresis, compass error, walking speed, auto-walk on/off. The Demo & QA tray on the right (or "Demo controls" on a phone) is the control panel that becomes the admin Demo tab: scenarios for a clean walk, noisy GPS under trees, a 30° compass error until calibrated, and a wander outside the line at Corner 3; buttons to step outside, jump to arrival, calibrate, reset; a live readout of true position vs. GPS fix, bearing, heading, and inside/outside.
- *Admin console:* magic-link sign-in, properties list with status pills, property detail with eight tabs (Overview with assemble checklist; Corners with the lot map and CAD-verified lock; Photos as the capture-protocol checklist; Content with paired EN/ES fields and a draft-Spanish helper; Media with the generation queue and a side-by-side review pane with reject reasons; Publish with public link, real QR, per-prospect links, and the walk-pack SMS in both languages with segment count; Analytics with stat tiles, a time-to-corner chart, and recent walks; Demo with scenario launch), Team, Settings. Example data throughout, labeled as such.

**Design system in code.** `greenways.css` (semantic tokens for the light admin surface and the dark walk surface, type scale from the brand spec plus HUD sizes, buttons, pills, cards, forms, tables, tabs, HUD primitives, 56 px field tap targets) and `tailwind.preset.js` for Phase 2. Every pairing used is an approved pairing from the brand kit.

**Bilingual copy deck.** 204 strings in `en.json` / `es.json` (next-intl ready) plus a readable side-by-side deck. Spanish is neutral, *usted* register, feet as the unit.

**Arrow-HUD interaction spec.** Sensor inputs per platform (iOS `webkitCompassHeading`, Android absolute orientation, declination), local-feet geometry, position and heading filters with constants, arrival rule and hysteresis, permission flow order (orientation prompt inside the tap, audio unlock), boundary thresholds, degraded modes (course mode, calibration, weak/lost GPS, offline, screen lock), analytics events, and the Gate 3 field-test protocol. Values to tune in the field are marked.

**Claude Code hand-off.** `CLAUDE.md` encoding the locked decisions, guardrails, stack conventions, data model, and phase list, packaged with the design system, catalogs, spec, brand kit, and the pilot KML.

## Map imagery test (added Sep 15, evening)
The map now defaults to a **Google aerial test capture**: a single zoom-19 satellite screenshot of the lot, georeferenced to the CAD corners (0.985 ft per image pixel; the north line lands on the road's south edge and both "7595" address labels fall inside the outline). It is embedded in the page so it works offline and in the published artifact. A toggle in the demo tray and on the admin Demo tab switches back to the drawn placeholder. This is for looking, not shipping: a screenshot is not licensed imagery. Production uses either Google Maps Platform satellite tiles or Mapbox Satellite behind a TGP key — pick at Gate 2.

**What the real aerial tells us:** Lot 4 is wooded end to end (winter imagery, mature canopy), not open pasture. That changes three things for Phase 3: GPS accuracy under canopy will be closer to the "noisy" scenario than the "clean" one, so the arrival radius and boundary thresholds should be tuned there, not on a bare lot; the corner-approach photos and Higgsfield prompts need a wooded template, not the open-parcel fill in the Prompt Library; and the stake descriptions ("under the big oak") become the real wayfinding cue at the last 20 ft.

## What's placeholder
- Flyover motion, approach clips, and stake photos are drawn, not real. The aerial is a test capture (above). Higgsfield media arrives in Phase 4.
- Nothing touches device sensors; the walker is synthetic. Sensor work is Phase 3.
- Admin data is illustrative (properties, walks, team). Team names are placeholders for the invite list you'll confirm.

## Decisions I made that you should check
1. Corner numbering on Lot 4: C1 = NW corner at the road, C2 = NE at the road, C3 = SE rear, C4 = SW rear — clockwise from a road entrance at the midpoint of the north (Broussard Rd) edge. If the actual entrance is elsewhere, numbering rotates.
2. Spanish register is *usted*. Say the word if you want *tú*.
3. Distance unit is feet in both languages ("pies").
4. Arrival radius 20 ft, boundary warning at 10 ft outside for 3 s — both marked *tune in field*.
5. The subdomain in mockups is `greenways.texasgreenerpastures.com`.
6. Map mode frames the buyer and the tracked corner (not the whole lot) because Lot 4 is 4:1 tall; the full lot is on the admin Corners tab. Compass is the default view; say so if you want map-first.

## Open risks carried into Phase 2
- iOS Chrome compass behavior varies by version; course-mode fallback is specified but must be proven at Gate 3.
- Vercel Hobby terms exclude commercial use; plan says Pro at launch.
- "Greenways" trademark search (brand spec pre-production item) before any signage — scheduled for Gate 6.

## Inputs still needed (from the plan, §4)
Accounts and tokens (Vercel, Supabase, Mapbox, Higgsfield API, GitHub); team roster with roles; Broussard photos to protocol + stake status and descriptions; DNS host; any prospect visit date. None block Gate 1 review; items 1–3 are needed before Phase 2 ends.

## Gate 1 ask
Click through the prototype as a buyer (phone, both languages) and as an admin (desktop). Approve the look, copy, and flow, or send changes. On approval, Phase 2 starts in Claude Code from the hand-off package.
