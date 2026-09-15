# Greenways — Arrow HUD Interaction Spec

**v0.1 · Phase 1 · September 15, 2026 · Companion to the Gate 1 prototype**

The HUD is the metal detector. One tracked corner, one arrow, one number. Everything below exists to make that arrow trustworthy on a consumer phone standing in a Texas pasture. Values marked *tune in field* get their final number at the Gate 3 Broussard test.

---

## 1. Inputs

| Signal | API | Cadence | Notes |
|---|---|---|---|
| Position | `navigator.geolocation.watchPosition` with `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 10000` | ~1 Hz (device-dependent) | Each fix carries `accuracy` (m, 68% radius). Convert to feet at the edge; everything internal is feet. |
| Heading | iOS: `DeviceOrientationEvent.webkitCompassHeading` (true heading, 0 = N, clockwise). Android Chrome: `DeviceOrientationEvent` with `absolute === true`, heading = `(360 − alpha) % 360`; prefer `'deviceorientationabsolute'` when the browser fires it. | 30–60 Hz | iOS 13+ requires `DeviceOrientationEvent.requestPermission()` inside a user gesture. Heading is *magnetic* on Android; apply declination for the property's location (NOAA WMM; Beaumont ≈ +1.5° E in 2026) — small, but do it. |
| Course | `coords.heading` and `coords.speed` from the position fix | with fixes | Valid only when speed > ~1.5 mph. Used as the heading fallback. |
| Motion permission | iOS combined "motion & orientation" prompt | once | Wrapped in the one-tap explainer screen (see §6). |

## 2. Geometry

Corners and the boundary polygon come from the property record (CAD-verified KML → `corners[]` with lat/lng, ordered clockwise from the entrance). Convert to a local tangent plane in feet at first use:

```
x = (lng − lng0) · 111320 · cos(lat0) · 3.28084
y = (lat − lat0) · 110574 · 3.28084
```

with `(lat0, lng0)` the polygon centroid. Error from the flat-earth approximation over a 1,000-ft lot is well under 0.1 ft. All distances are Euclidean in this plane. Bearing from the buyer `p` to corner `c` is `atan2(c.x − p.x, c.y − p.y)` in degrees clockwise from north.

Arrow rotation on screen = `bearing − phoneHeading`, normalized to 0–360, applied as a CSS `rotate()` on the arrow. Positive = clockwise on screen.

## 3. Filtering

**Position.** Raw fixes jitter 10–15 ft even standing still. Use an exponential filter on position weighted by reported accuracy:

```
α = clamp(0.35 · (12 / max(accuracyFt, 12)), 0.15, 0.6)
fix = fix + α · (raw − fix)
```

Reject a raw fix outright when `accuracyFt > 100` or when it implies a jump faster than 25 ft/s from the last accepted fix (teleport guard). Keep the last good fix on screen with the "weak GPS" status line rather than blanking the number.

**Heading.** Sensor heading is noisy but fast. Low-pass it on the circle (interpolate the shortest angular path) with `β = 0.25` per event, then quantize the displayed rotation to 1°. Never animate the arrow through the long way around: compute the delta as `((target − current + 540) mod 360) − 180`.

**Displayed distance.** Round to the nearest foot above 30 ft; show whole feet below. Never show tenths. Rate-limit the number to 4 updates/s so it counts down rather than flickers.

## 4. Arrival

- Arrival radius `R_arrive = 20 ft` *(tune in field; expected range 15–25 ft)*.
- Fire arrival when the *filtered* distance has been `≤ R_arrive` for **2 consecutive seconds**, or the raw distance is `≤ 8 ft` on any fix (fast path when GPS is good).
- Hysteresis: once arrived, the corner is marked found and stays found. The buyer never "loses" a corner because GPS drifted after the ding.
- On arrival: `navigator.vibrate([70, 50, 70])` where supported (Android; iOS Safari ignores it — the tone carries the moment there), a two-note tone (880 Hz → 1320 Hz, 350 ms) through a WebAudio context created during the permission tap so it is unlocked, and the arrival card slides up over the HUD. The card shows the stake description and the stake photo (or approach clip once media exists). Primary action **Next corner** re-targets the nearest unfound corner; **Stay here** returns to the HUD with the found corner still selected.
- Within `R_arrive` the arrow pulses gently and the status line reads "You're here". The arrow keeps pointing (it does not spin) because the stake may still be a few steps away.

## 5. Corner selection

- On start, track the nearest unfound corner to the buyer's first good fix (usually C1 or C2 at the road).
- The picker sheet lists every corner with live distance, marks found ones, and labels the nearest unfound one. Tapping a tile re-targets immediately; the sheet closes. The strip under the arrow mirrors the same state for one-tap switching without opening the sheet.
- Exactly one corner is tracked at all times while on the HUD. The tracked corner's name is the largest text on the screen after the distance.

## 6. Permission flow

1. Welcome → **Start walking** → Permission explainer (one screen, one button, plain language, tells them the phone will ask twice on iPhone).
2. The button's tap handler, synchronously: create/resume the AudioContext, call `DeviceOrientationEvent.requestPermission()` (iOS) and then `watchPosition`. Order matters: the orientation prompt must be inside the gesture; geolocation may follow.
3. Denied location → the denied state on the same screen with **Try again** and a route to **Preview the walk**. If the browser reports `PERMISSION_DENIED` permanently, show the "turn it on in Settings" copy instead of retry.
4. Denied/unavailable orientation → run in **course mode** (§8) and say so in the status line.

## 7. Boundary awareness

- Compute signed distance from the filtered fix to the polygon (positive inside). Because fixes wander, the warning is deliberately lazy: show only when the buyer has been **more than 10 ft outside for 3 s** *(tune in field)*. Clear when back inside for 2 s.
- The banner is informational, not modal: it never covers the arrow or the distance, and it does not sound. One tap dismisses it for the current corner. Log a `boundary_exit` event with the edge index for analytics.
- Edges bordering the road entrance are exempt near the entrance (a 40-ft radius) so parking on the shoulder does not trigger it.

## 8. Degraded modes

| Condition | Detection | Behavior |
|---|---|---|
| No compass heading (denied, unsupported, or `alpha` null) | no orientation event within 2 s of start | **Course mode:** heading = GPS course while moving > 1.5 mph; when stopped, freeze the last heading and show "Walk a few steps so the arrow can point." |
| Compass unreliable (magnetic interference, uncalibrated) | iOS `webkitCompassAccuracy` > 30° or heading variance > 25° over 2 s while stationary | Status line: "Turn slowly in a circle to calibrate the compass." Arrow stays on screen at reduced opacity. Clear when accuracy improves. |
| Weak GPS | accuracy > 40 ft for 5 s | Status line "Weak GPS. Keep walking — it will settle." Arrival threshold does not widen (better a late ding than a wrong one). |
| GPS lost | no fix for 10 s | Status "No GPS right now. Step away from trees or vehicles." Distance shows the last value with a dimmed style. |
| Offline | `navigator.onLine === false` or fetch failure | Nothing changes: all assets were precached on open. Show the offline chip on the welcome screen only. |
| Screen lock | `visibilitychange` | Re-request `watchPosition` on return; acquire a wake lock (`navigator.wakeLock.request('screen')`) while on the HUD so the screen stays on while walking. |

## 9. Motion and feedback

- Arrow: 180 ms ease-out on heading changes; capped at 12°/frame so it sweeps rather than snaps. Respect `prefers-reduced-motion` (no pulse, instant rotation).
- Distance: tabular numerals, no layout shift as digits change; unit label baseline-aligned.
- Haptics only on arrival. Audio only on arrival and (softly) when a corner is re-targeted from the picker. No ticking, no "hot/cold" pitch — buyers will be talking to a salesperson.
- Screen stays portrait; landscape shows a rotate prompt.

## 10. Placement and sizing (portrait phone)

Top to bottom: found-count chip and language toggle (40 px targets); tracking label + corner name (display serif); arrow ring sized to `min(64vw, 260px)`; distance at `clamp(64px, 22vw, 104px)`; status line; corner strip (56 px tiles); Map/Corners buttons (56 px); GPS-honesty line.

**Map mode** (toggle **Map** ↔ **Compass**): the map takes the arrow ring's space (north-up, framed on the buyer and the tracked corner, re-framed only when either drifts within 12% of the edge so the base tiles are not redrawn every fix); a 68 px compact arrow chip sits on the right edge, vertically centered, rotating exactly as the big arrow would; the distance moves to a badge in the lower right ("40 ft away"); an N chip sits top left. The corner strip, buttons, and honesty line stay where they are so the two modes share muscle memory.

**Tracked corner on the map:** larger pin (14 px vs 10) in Trailhead Green with a cream ring, a pulsing halo, a name label above the pin (below it when near the top edge, clamped inside the view), and a dashed Trailhead Green guide line with a dark casing from the buyer's dot to the pin. Found corners are green with a check; untracked, unfound corners are Harvest Gold with their number. All pins, strokes, and labels are sized in screen pixels (feet-per-pixel scaling), so they stay the same size at every zoom. The lot line is Trailhead Green over a dark casing so it reads on canopy as well as grass. Nothing on the HUD is smaller than 40 px to tap; primary actions are 56 px. Contrast follows the brand kit's dark pairings (Prairie Cream and Sage Mist on Pine Shadow; Trailhead Green for the arrow; Harvest Gold for corner pins).

## 11. Analytics events (walk_events)

`walk_opened`, `permission_granted|denied`, `intro_skipped`, `corner_tracked {n}`, `corner_found {n, seconds, accuracyFt}`, `clip_played {n}`, `boundary_exit {edge}`, `compass_unreliable`, `gps_weak`, `language_switched {to}`, `walk_completed {seconds}`, `preview_played {chapter}`. Batched and sent when online; queued in IndexedDB when not. Per-prospect tokens attach the GHL contact id server-side; public links stay anonymous.

## 12. Field test protocol (Gate 3)

1. Two phones: a mid-range Android on Chrome and an iPhone on Chrome; also Safari on the iPhone once.
2. Start at the road with data on; open the link; confirm the offline chip; turn data off.
3. A non-technical tester finds all four corners with no instructions beyond the SMS. Time each corner, note where the arrow felt wrong, and the accuracy figure at each ding.
4. Repeat one corner under the rear tree line for the noisy-GPS case; repeat one start with the phone near a truck to provoke the compass prompt.
5. Record: arrival radius that felt right, false dings, missed dings, boundary false alarms, battery used, screen readable in sun (brightness at max).
6. Feed the numbers back into `R_arrive`, the boundary thresholds, and the filter constants above.

## 13. What the prototype simulates

The Gate 1 prototype implements §2, §3 (position filter at fixed α = 0.5), §4, §5, §7 and the language toggle with a synthetic walker on the real Lot 4 corners: 1 Hz GPS with Gaussian noise, adjustable compass error, walking speed, and a boundary-exit scenario. It does not touch device sensors; that is Phase 3.
