# Greenways — Buyer Copy Deck (EN / ES)

**v0.1 · Phase 1 · September 15, 2026** · Source files: `messages/en.json`, `messages/es.json` (shipped as the next-intl catalogs).

Writing rules: short lines, one idea per screen, readable in sun on a phone; no jargon; feet everywhere (buyers pace land in feet); Spanish is neutral Latin American Spanish in the *usted* register. Admin console copy is English only and lives under the `admin` key in `en.json`. Per-property words (display name, stake descriptions, arrival note) are entered by the team in both languages in the admin Content tab; interface strings below ship translated.

`{name}` marks a variable filled at runtime.

## Shared

| Key | English | Español |
|---|---|---|
| `common.appName` | Greenways | Greenways |
| `common.byline` | by Texas Greener Pastures | por Texas Greener Pastures |
| `common.switchLanguage` | Español | English |
| `common.switchLanguageShort` | ES | EN |
| `common.back` | Back | Atrás |
| `common.close` | Close | Cerrar |
| `common.ok` | OK | OK |
| `common.ft` | ft | pies |
| `common.acres` | {n} acres | {n} acres |
| `common.corner` | Corner {n} | Esquina {n} |
| `common.cornerShort` | C{n} | E{n} |

## Welcome

| Key | English | Español |
|---|---|---|
| `welcome.eyebrow` | Self-guided walk | Recorrido guiado |
| `welcome.title` | Walk the land. Find every corner. | Camine el terreno. Encuentre cada esquina. |
| `welcome.body` | Your phone points you to each corner stake. No app to install, no account. | Su teléfono le señala cada estaca de esquina. Sin instalar nada, sin cuenta. |
| `welcome.start` | Start walking | Empezar a caminar |
| `welcome.preview` | Preview the walk from home | Ver el recorrido desde casa |
| `welcome.loadHint` | Best on site. Open this link before you leave pavement so everything loads. | Funciona mejor en el terreno. Abra este enlace antes de salir del pavimento para que cargue todo. |
| `welcome.saved` | Saved for offline · {mb} MB | Guardado sin conexión · {mb} MB |

## Permission explainer

| Key | English | Español |
|---|---|---|
| `permission.title` | Greenways needs your location and compass | Greenways necesita su ubicación y su brújula |
| `permission.body` | That's how the arrow points you to each stake. Nothing about you is stored. | Así la flecha le señala cada estaca. No se guarda nada sobre usted. |
| `permission.cta` | Allow location & compass | Permitir ubicación y brújula |
| `permission.iosNote` | Your phone will ask twice. Tap Allow both times. | Su teléfono preguntará dos veces. Toque Permitir las dos veces. |
| `permission.denied` | Without location, the arrow can't point. You can still preview the walk. | Sin ubicación, la flecha no puede señalar. Aún puede ver el recorrido. |
| `permission.retry` | Try again | Intentar de nuevo |
| `permission.openSettings` | Location is off for this browser. Turn it on in Settings, then come back. | La ubicación está apagada para este navegador. Actívela en Configuración y vuelva. |

## Intro flyover

| Key | English | Español |
|---|---|---|
| `intro.label` | Intro flyover | Vista aérea |
| `intro.skip` | Skip intro | Saltar intro |
| `intro.duration` | {s} sec | {s} seg |

## Arrow HUD

| Key | English | Español |
|---|---|---|
| `hud.tracking` | Tracking | Buscando |
| `hud.away` | away | de distancia |
| `hud.here` | You're here | Está aquí |
| `hud.honesty` | Stakes mark the exact corner. The arrow gets you within a few steps. | Las estacas marcan la esquina exacta. La flecha lo deja a unos pasos. |
| `hud.calibrate` | Turn slowly in a circle to calibrate the compass. | Gire despacio en un círculo para calibrar la brújula. |
| `hud.gpsWeak` | Weak GPS. Keep walking — it will settle. | Señal GPS débil. Siga caminando, se estabiliza. |
| `hud.gpsLost` | No GPS right now. Step away from trees or vehicles. | Sin GPS por ahora. Aléjese de árboles o vehículos. |
| `hud.map` | Map | Mapa |
| `hud.hideMap` | Hide map | Ocultar mapa |
| `hud.corners` | Corners | Esquinas |
| `hud.found` | Found | Encontrada |
| `hud.foundCount` | {found} of {total} found | {found} de {total} encontradas |
| `hud.nextNearest` | Next nearest | La más cercana |
| `hud.menu` | More | Más |
| `hud.restart` | Start over | Empezar de nuevo |
| `hud.help` | Help | Ayuda |
| `hud.compass` | Compass | Brújula |

## Corner picker

| Key | English | Español |
|---|---|---|
| `picker.title` | Pick a corner | Elija una esquina |
| `picker.subtitle` | One at a time. The arrow follows the one you pick. | Una a la vez. La flecha sigue la que elija. |
| `picker.nearest` | Nearest | Más cercana |
| `picker.found` | Found | Encontrada |
| `picker.trackThis` | Track this corner | Buscar esta esquina |

## Arrival card

| Key | English | Español |
|---|---|---|
| `arrival.title` | You found Corner {n} | Encontró la Esquina {n} |
| `arrival.subtitle` | The stake is within a few steps. | La estaca está a unos pasos. |
| `arrival.lookFor` | Look for | Busque |
| `arrival.clip` | Watch the approach | Ver la llegada |
| `arrival.next` | Next corner | Siguiente esquina |
| `arrival.stay` | View corner | Ver la esquina |
| `arrival.allDone` | That was the last one | Esa fue la última |

## Boundary warning

| Key | English | Español |
|---|---|---|
| `boundary.title` | You're just outside the lot line | Está justo fuera del límite del lote |
| `boundary.body` | Head back toward the arrow. The line runs along the fence side. | Regrese hacia la flecha. El límite va por el lado de la cerca. |
| `boundary.dismiss` | Got it | Entendido |

## Completion

| Key | English | Español |
|---|---|---|
| `done.title` | You walked all {n} corners | Caminó las {n} esquinas |
| `done.body` | That's the whole lot, edge to edge. Questions? We're a text away. | Ese es todo el lote, de punta a punta. ¿Preguntas? Estamos a un mensaje. |
| `done.homesite` | See the homesite | Ver el sitio para la casa |
| `done.text` | Text Texas Greener Pastures | Enviar mensaje a Texas Greener Pastures |
| `done.again` | Walk it again | Caminarlo otra vez |
| `done.share` | Send this walk to someone | Enviar este recorrido a alguien |

## Preview mode (off-site)

| Key | English | Español |
|---|---|---|
| `preview.title` | Preview the walk | Ver el recorrido |
| `preview.body` | The whole tour from home: the flyover, the entrance, every corner, the homesite. | Todo el recorrido desde casa: la vista aérea, la entrada, cada esquina, el sitio para la casa. |
| `preview.play` | Play the tour | Reproducir |
| `preview.chapters` | Chapters | Capítulos |
| `preview.chapterIntro` | Flyover | Vista aérea |
| `preview.chapterEntrance` | Entrance from the road | Entrada desde el camino |
| `preview.chapterCorner` | Corner {n} | Esquina {n} |
| `preview.chapterHomesite` | Homesite | Sitio para la casa |
| `preview.goOnSite` | On the property? Start walking | ¿Está en el terreno? Empezar a caminar |

## Offline states

| Key | English | Español |
|---|---|---|
| `offline.saved` | Saved for offline | Guardado sin conexión |
| `offline.noSignal` | No signal. Everything you need is already loaded. | Sin señal. Todo lo que necesita ya está cargado. |
| `offline.loading` | Loading the walk… {pct}% | Cargando el recorrido… {pct}% |

## Walk-pack SMS (sent by GHL)

| Key | English | Español |
|---|---|---|
| `sms.walkPack` | Your Greenways walk for {property} is ready: {link} ⏎ Open it before you leave pavement so it loads. It points you to every corner stake. — Texas Greener Pastures | Su recorrido Greenways de {property} está listo: {link} ⏎ Ábralo antes de salir del pavimento para que cargue. Le señala cada estaca de esquina. — Texas Greener Pastures |

## Help sheet

| Key | English | Español |
|---|---|---|
| `help.title` | How this works | Cómo funciona |
| `help.s1` | Pick a corner. The arrow points at it and the number is how far in feet. | Elija una esquina. La flecha la señala y el número es la distancia en pies. |
| `help.s2` | Walk until it says you're there. Look for the stake described on the card. | Camine hasta que diga que llegó. Busque la estaca que describe la tarjeta. |
| `help.s3` | Tap Next corner. The lot line is on the map if you want to see it. | Toque Siguiente esquina. El límite del lote está en el mapa si quiere verlo. |
| `help.s4` | If the arrow seems wrong, turn slowly in a circle to reset the compass. | Si la flecha parece equivocada, gire despacio en un círculo para reiniciar la brújula. |

## Per-property content (example: Broussard Lot 4)

| Field | English | Español |
|---|---|---|
| Display name | Broussard Rd — Lot 4 | Broussard Rd — Lote 4 |
| Corner 1 name | NW corner at the road | Esquina noroeste, junto al camino |
| Corner 2 name | NE corner at the road | Esquina noreste, junto al camino |
| Corner 3 name | SE rear corner | Esquina sureste, al fondo |
| Corner 4 name | SW rear corner | Esquina suroeste, al fondo |
| Corner 1 stake | Orange-capped rebar, knee height, pink flagging | Varilla con tapa naranja, a la altura de la rodilla, cinta rosa |
| Corner 2 stake | Orange-capped rebar at the fence post, pink flagging | Varilla con tapa naranja junto al poste de la cerca, cinta rosa |
| Corner 3 stake | Orange-capped rebar under the big oak, pink flagging | Varilla con tapa naranja bajo el roble grande, cinta rosa |
| Corner 4 stake | Orange-capped rebar, knee height, near the culvert | Varilla con tapa naranja, a la altura de la rodilla, cerca de la alcantarilla |

Stake descriptions above are placeholders until the Broussard stakes are set and described.
