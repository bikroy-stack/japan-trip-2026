# Japan Family Trip 2026 — Claude Code Instructions

Build a complete static web app for a family trip itinerary to Japan (July 12–31, 2026),
deployable to GitHub Pages as a set of static files (index.html + CSS + JS).
The app will be shared with a group of 8 travelers via a GitHub Pages URL.

**The single source of truth is `japon_itineraire_2026.md`.**
ALL content — days, activities, transport, checklist, map locations — is parsed
from this file at runtime. Never hardcode trip data in JS or HTML.
Updating the trip = editing the MD file and pushing to main.

---

## Repository structure to create

```
japan-trip-2026/
├── CLAUDE.md                       ← this file (instructions for Claude Code)
├── index.html                      ← app shell
├── style.css                       ← all styles
├── app.js                          ← tab routing, localStorage, UI
├── parser.js                       ← MD parser (key piece)
├── maps.js                         ← Leaflet map logic, MD-driven markers
├── japon_itineraire_2026.md        ← SOURCE OF TRUTH (already exists)
├── version.txt                     ← written by GitHub Actions on each deploy
├── README.md                       ← update instructions for the group
└── .github/
    └── workflows/
        └── deploy.yml              ← auto GitHub Pages deploy on push to main
```

---

## Tech stack

- Vanilla HTML + CSS + JavaScript (ES modules) — zero build step
- **marked.js** (CDN) for rendering MD content as HTML
- **Leaflet.js** (CDN) + OpenStreetMap tiles — no API key needed
- **localStorage** for votes, notes, checklist state
- No frameworks, no npm, no bundler — the repo root IS the site

---

## MD CONFIG block

Add this block at the very top of `japon_itineraire_2026.md` before any other content:

```markdown
<!-- CONFIG
trip_name: Japon en famille 2026
travelers: Denise, Caroline, Karine, Olivier, Angélie, Benjamin, Léonard, Elizabeth
adults: 6
children: 2
currency_rate_cad: 107
-->
```

`parser.js` reads this first. All other values come from the MD structure.

---

## parser.js — complete specification

```javascript
// parser.js
// Fetches japon_itineraire_2026.md and returns structured data.
// This is the ONLY place that reads the MD file.

async function loadItinerary() {
  const res = await fetch('./japon_itineraire_2026.md');
  const md = await res.text();
  return {
    config:      parseConfig(md),
    cities:      parseCities(md),
    days:        parseDays(md),
    flights:     parseFlights(md),
    transport:   parseInterCityTransport(md),
    localTransport: parseLocalTransport(md),
    checklist:   parseChecklist(md),
    mapLocations: parseMapLocations(md),  // ← NEW: maps driven by MD
  };
}
```

### parseConfig(md)
Read the `<!-- CONFIG ... -->` block. Return key-value object.

### parseCities(md)
Detect H2 headers matching: `## [emoji] CITY NAME — dates`
Examples:
- `## 🗼 TOKYO I — 12 au 16 juillet`
- `## ⛩️ KYOTO — 16 au 22 juillet`
- `## 🕊️ HIROSHIMA — 22 au 24 juillet`
- `## 🌊 OKINAWA — 24 au 28 juillet`
- `## 🗼 TOKYO II — 28 au 31 juillet`

Return array of: `{ id, name, emoji, dates, color, logement }`
- `id`: slugified name (`tokyo1`, `kyoto`, `hiroshima`, `okinawa`, `tokyo2`)
- `color`: map city name → hex color (see Design section)
- `logement`: extract from the **Logement** line in the `## Vue d'ensemble` table

### parseDays(md)
Detect H3 headers matching:
`### Jour N — Weekday DD month : Title`
Example: `### Jour 2 — Lundi 13 juillet : TeamLab + Harajuku + Café Capybara`

For each day return:
```javascript
{
  num: 2,
  cityId: 'tokyo1',         // inferred from current H2 section
  weekday: 'Lundi',
  date: '13 juillet',
  fullDate: 'Lundi 13 juillet',
  title: 'TeamLab + Harajuku + Café Capybara',
  tip: '...',               // text from > blockquote immediately after header
  items: [...]              // see item spec below
}
```

**Item parsing** — read the markdown table rows under each day header:

| Column 1 (Heure) | Column 2 (Activité) |
|---|---|
| `10h00` | `🎨 **TeamLab Planets** (Toyosu) — billets réservés ✅` |
| `—` | `🚇 **45 min** · Yurikamome → Shimbashi → Ginza Line → Omotesando + 8 min marche · ~380¥/pers` |

Return item objects:
```javascript
// Activity item
{
  type: 'activity',
  time: '10h00',
  text: 'TeamLab Planets (Toyosu) — billets réservés ✅',
  emoji: '🎨',
  tag: 'fun',        // detected from emoji + keywords (see tag rules below)
  bold: false,       // true if text contains **bold**
  confirmed: true,   // true if text contains ✅
}

// Transport item (time column is "—")
{
  type: 'transport',
  icon: '🚇',
  duration: '45 min',
  route: 'Yurikamome → Shimbashi → Ginza Line → Omotesando + 8 min marche',
  cost: '~380¥/pers',
  // raw: full text for fallback display
}
```

**Tag detection rules** (applied to emoji + text combined):
```javascript
const TAG_RULES = [
  { tag: 'UNESCO',   test: t => t.includes('UNESCO') },
  { tag: 'anime',    test: t => /🎮|🎬|🎨|Ghibli|anime|manga|Nintendo|USJ|Gundam/.test(t) },
  { tag: 'food',     test: t => /🍜|🍣|🍱|🥘|🍤|🍚|🍢|🥞|🍛|déjeuner|dîner|repas|ramen|sushi/.test(t) },
  { tag: 'nature',   test: t => /🌿|🏔️|🌊|🌸|🌳|parc|montagne|plage|forêt|lac|jardin|koï/.test(t) },
  { tag: 'culture',  test: t => /🏯|🏛️|⛩️|musée|château|temple|shrine|patrimoine|cérémonie/.test(t) },
  { tag: 'sport',    test: t => /🏋️|⚾|sumo|baseball|sport/.test(t) },
  { tag: 'fun',      test: t => /🎡|🎢|🎠|parc|zoo|aquarium|capybara|TeamLab|café/.test(t) },
  { tag: 'transport',test: t => t.type === 'transport' },
];
// Apply first matching rule; default: 'other'
```

### parseFlights(md)
Find section `## ✅ Vols confirmés` and parse its markdown table.
Each row returns:
```javascript
{
  flight: 'MM287',
  airline: 'Peach Aviation',
  from: 'Fukuoka (FUK)',
  to: 'Naha (OKA)',
  date: 'Ven. 24 juil.',
  departure: '16h55',
  arrival: '18h50',
  duration: '1h55',
  confirmed: true,
  notes: 'Bagages payants ~2 200¥/valise',
}
```

### parseInterCityTransport(md)
Find section `## 🚄 TRANSPORTS INTER-VILLES` and parse all tables.
Return array of route objects with columns: trajet, date, type, durée, prix_adulte, prix_enfant, total.
Also return the summary totals from the recap table at the bottom.

### parseLocalTransport(md)
Find section `## 🚌 TRANSPORT LOCAL PAR VILLE`.
Parse each city sub-table. Return:
```javascript
[
  {
    city: 'Tokyo I',
    tool: 'Welcome Suica',
    rows: [{ jour, destinations, option, cout }],
    total: '~22 800 ¥',
  },
  ...
]
```
Also parse the grand total table at the end (Plan A vs Plan B).

### parseChecklist(md)
Find section `## ⚠️ Réservations à faire` and parse its table.
Each row:
```javascript
{
  status: '⚠️',           // ✅ | ⚠️ | ℹ️
  name: 'Musée Ghibli',
  date: 'Mer. 15 juil.',
  details: 'Billets le 10 JUIN à 10h00 heure Tokyo...',
  urgent: true,            // computed: status === '⚠️'
}
```

---

## parseMapLocations(md) — maps driven entirely by the MD

This is the key innovation: map markers are extracted FROM THE MD, not hardcoded.

### Strategy

Parse TWO things from the MD to build map markers:

**1. Known coordinates table** — add this table to the MD file under a new section:

```markdown
## 📍 Coordonnées (pour la carte)

| Lieu | Lat | Lng | Ville | Jour | Tag |
|------|-----|-----|-------|------|-----|
| Logement Kamiochiai | 35.7117 | 139.6824 | tokyo1 | — | logement |
| TeamLab Planets | 35.6491 | 139.7898 | tokyo1 | 2 | fun |
| Café Capybara Moffu | 35.6709 | 139.7057 | tokyo1 | 2 | fun |
| Takeshita Street Harajuku | 35.6710 | 139.7052 | tokyo1 | 2 | fun |
| Carrefour Shibuya | 35.6595 | 139.7005 | tokyo1 | 2 | fun |
| Musée Ghibli Mitaka | 35.6962 | 139.5704 | tokyo1 | 4 | anime |
| Parc Inokashira (koï) | 35.7001 | 139.5773 | tokyo1 | 4 | nature |
| Shinjuku Gyoen | 35.6851 | 139.7100 | tokyo1 | 3 | nature |
| Sumo Hirakuza Ginza | 35.6734 | 139.7684 | tokyo1 | 3 | sport |
| Logement Higashiyama | 35.0115 | 135.7826 | kyoto | — | logement |
| Fushimi Inari Taisha | 34.9677 | 135.7792 | kyoto | 6 | UNESCO |
| Kiyomizudera | 34.9947 | 135.7847 | kyoto | 6 | UNESCO |
| Kinkaku-ji | 35.0394 | 135.7292 | kyoto | 7 | UNESCO |
| Forêt de bambous Arashiyama | 35.0168 | 135.6713 | kyoto | 7 | nature |
| Château Nijo | 35.0141 | 135.7484 | kyoto | 9 | UNESCO |
| Philosopher's Path | 35.0215 | 135.7942 | kyoto | 9 | nature |
| Nara Park + Todai-ji | 34.6890 | 135.8398 | kyoto | 8 | UNESCO |
| Universal Studios Japan | 34.6657 | 135.4323 | kyoto | 10 | fun |
| Logement Naka-ku Hiroshima | 34.3890 | 132.4580 | hiroshima | — | logement |
| Dôme Genbaku | 34.3955 | 132.4534 | hiroshima | 11 | UNESCO |
| Musée Mémorial de la Paix | 34.3953 | 132.4536 | hiroshima | 12 | culture |
| Ferry Miyajimaguchi | 34.3113 | 132.3051 | hiroshima | 12 | transport |
| Itsukushima Jinja Miyajima | 34.2960 | 132.3198 | hiroshima | 12 | UNESCO |
| Aéroport Fukuoka (MM287) | 33.5850 | 130.4510 | hiroshima | 13 | transport |
| Logement Chatan Okinawa | 26.3190 | 127.7570 | okinawa | — | logement |
| American Village Chatan | 26.3159 | 127.7540 | okinawa | 14 | fun |
| Château Shuri | 26.2170 | 127.7195 | okinawa | 14 | UNESCO |
| Cape Maeda Grotte Bleue | 26.4426 | 127.7739 | okinawa | 15 | nature |
| Aquarium Churaumi | 26.6943 | 127.8780 | okinawa | 16 | fun |
| Logement Kanda Tokyo II | 35.6981 | 139.7770 | tokyo2 | — | logement |
| Zoo Ueno | 35.7160 | 139.7729 | tokyo2 | 18 | fun |
| Senso-ji Asakusa | 35.7148 | 139.7967 | tokyo2 | 18 | UNESCO |
| Akihabara | 35.6997 | 139.7713 | tokyo2 | 19 | anime |
| Odaiba Gundam géant | 35.6245 | 139.7755 | tokyo2 | 19 | anime |
| Kawaguchiko Mont Fuji (Plan A) | 35.5112 | 138.7523 | tokyo2 | 18 | nature |
```

**2. Cross-reference with parsed days** — for each coordinate row:
- Find the matching day in `parseDays()` by `jour` number
- Find the matching activity item in that day by fuzzy-matching `lieu` name vs activity text
- Pull the transport description from the transport row immediately BEFORE that activity item
- Build the final marker object:

```javascript
{
  name: 'TeamLab Planets',
  lat: 35.6491,
  lng: 35.7898,
  cityId: 'tokyo1',
  day: 2,
  tag: 'fun',
  isLogement: false,
  // From cross-reference with parsed day items:
  activityText: 'TeamLab Planets (Toyosu) — billets réservés ✅',
  transportText: '🚇 50 min · Seibu → Shinjuku → Yurakucho → Toyosu · ~520¥/pers',
  confirmed: true,  // activity text contains ✅
  tip: null,        // from day tip if this is the first activity
}
```

`parseMapLocations()` returns: `Map<cityId, MarkerObject[]>`

---

## maps.js — specification

```javascript
// maps.js
// Reads parsed map locations from parser.js — NO hardcoded coordinates.
// Only Leaflet map configuration (center, zoom) is set here per city.

const CITY_MAP_CONFIG = {
  tokyo1:    { center: [35.69, 139.70], zoom: 12, label: 'Tokyo I' },
  kyoto:     { center: [35.00, 135.76], zoom: 12, label: 'Kyoto + Excursions' },
  hiroshima: { center: [34.36, 132.42], zoom: 11, label: 'Hiroshima + Miyajima' },
  okinawa:   { center: [26.44, 127.80], zoom: 10, label: 'Okinawa' },
  tokyo2:    { center: [35.71, 139.78], zoom: 13, label: 'Tokyo II + Fuji' },
};

// Called once after parser.js finishes loading
function initMaps(mapLocations) {
  for (const [cityId, config] of Object.entries(CITY_MAP_CONFIG)) {
    const markers = mapLocations.get(cityId) ?? [];
    createCityMap(cityId, config, markers);
  }
}

function createCityMap(cityId, config, markers) {
  const map = L.map(`map-${cityId}`, {
    center: config.center,
    zoom: config.zoom,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);

  // Sort markers by day number for route line
  const sorted = [...markers].sort((a, b) => (a.day ?? 99) - (b.day ?? 99));

  // Draw dashed route polyline between activity markers (skip logement)
  const routePoints = sorted
    .filter(m => !m.isLogement)
    .map(m => [m.lat, m.lng]);

  if (routePoints.length > 1) {
    L.polyline(routePoints, {
      color: getCityColor(cityId),
      weight: 2,
      opacity: 0.5,
      dashArray: '6, 6',
    }).addTo(map);
  }

  // Add markers
  for (const marker of markers) {
    const icon = createMarkerIcon(marker);
    const popup = createPopupHTML(marker);
    L.marker([marker.lat, marker.lng], { icon })
      .addTo(map)
      .bindPopup(popup);
  }
}

function createMarkerIcon(marker) {
  // Emoji icon using Leaflet divIcon
  const emoji = marker.isLogement ? '🏠'
    : TAG_EMOJI[marker.tag] ?? '📍';
  const color = marker.isLogement ? '#1a2744'
    : TAG_COLORS[marker.tag] ?? '#666';

  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};
      color:white;
      border-radius:50%;
      width:36px;height:36px;
      display:flex;align-items:center;justify-content:center;
      font-size:16px;
      box-shadow:0 2px 6px rgba(0,0,0,.35);
      border:2px solid white;
    ">${emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function createPopupHTML(marker) {
  const dayLabel = marker.day ? `Jour ${marker.day}` : 'Logement';
  const confirmedBadge = marker.confirmed
    ? '<span style="color:#1D9E75;font-weight:600">✅ Confirmé</span>' : '';
  const transportBlock = marker.transportText
    ? `<p style="color:#888;font-size:11px;margin-top:4px">${marker.transportText}</p>` : '';

  return `
    <div style="min-width:180px;font-family:sans-serif">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px">${marker.name}</div>
      <div style="font-size:11px;color:#555;margin-bottom:4px">
        <span class="tag-${marker.tag}" style="...">${marker.tag?.toUpperCase()}</span>
        &nbsp;${dayLabel} &nbsp;${confirmedBadge}
      </div>
      ${transportBlock}
      ${marker.activityText
        ? `<p style="font-size:11px;color:#333;margin-top:4px">${marker.activityText}</p>`
        : ''}
    </div>
  `;
}

const TAG_EMOJI = {
  UNESCO: '🏛️', anime: '🎮', food: '🍜', nature: '🌿',
  culture: '🏯', sport: '⚾', fun: '🎡', transport: '🚇',
};

const TAG_COLORS = {
  UNESCO: '#1565C0', anime: '#5E35B1', food: '#558B2F',
  nature: '#2E7D32', culture: '#1565C0', sport: '#B71C1C',
  fun: '#E65100', transport: '#546E7A',
};

function getCityColor(cityId) {
  return {
    tokyo1: '#C0392B', kyoto: '#1D6E4F',
    hiroshima: '#B45309', okinawa: '#1565C0', tokyo2: '#C0392B',
  }[cityId] ?? '#1a2744';
}
```

---

## app.js — tab routing and UI

```javascript
// app.js
import { loadItinerary } from './parser.js';
import { initMaps } from './maps.js';

let DATA = null;

async function init() {
  showSkeleton();
  try {
    DATA = await loadItinerary();
    initMaps(DATA.mapLocations);
    renderAgenda(DATA);
    renderTransport(DATA);
    renderChecklist(DATA);
    updateFooter(DATA.config);
    hideSkeleton();
  } catch (err) {
    showError(err);
  }
}

// Tab routing
function showTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
  document.getElementById(`tab-${tabId}`).hidden = false;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  // Invalidate Leaflet map size on switch (fixes blank map bug)
  if (tabId === 'maps') {
    setTimeout(() => window._activeCityMap?.invalidateSize(), 100);
  }
  localStorage.setItem('activeTab', tabId);
}

// Agenda — city pills + day cards
function renderAgenda(data) { /* ... */ }

// Day card with activities + transport rows + vote buttons + sticky note
function renderDayCard(day, cityColor) {
  // Activities: click 👍/👎 saves to localStorage key votes_${day.num}_${index}
  // Sticky note: auto-save textarea to localStorage key note_${day.num}
  // Transport rows: grey background, emoji icon, duration, route, cost
}

// Votes persist across sessions — load on render, save on click
function getVote(dayNum, idx) {
  return localStorage.getItem(`vote_${dayNum}_${idx}`); // 'up' | 'down' | null
}
function setVote(dayNum, idx, dir) {
  const current = getVote(dayNum, idx);
  localStorage.setItem(`vote_${dayNum}_${idx}`, current === dir ? '' : dir);
}

// Checklist — parse status, render with checkboxes
function renderChecklist(data) {
  // Each item has a checkbox: state saved to localStorage key check_${slugify(item.name)}
  // Progress bar updated on each toggle
  // Sort: ✅ confirmed last, ⚠️ urgent first
}

init();
```

---

## index.html — app shell

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Japon 2026 — Famille</title>
  <link rel="stylesheet" href="style.css">
  <!-- Leaflet CSS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
</head>
<body>

  <!-- Header -->
  <header class="app-header">
    <h1>🗾 Japon 2026</h1>
    <span class="traveler-count">8 voyageurs</span>
  </header>

  <!-- Skeleton loader -->
  <div id="skeleton" class="skeleton" aria-live="polite">
    <div class="skeleton-bar"></div>
    <div class="skeleton-bar short"></div>
    <div class="skeleton-bar"></div>
  </div>

  <!-- Tab panels -->
  <main>
    <div id="tab-agenda"    class="tab-panel" hidden></div>
    <div id="tab-maps"      class="tab-panel" hidden>
      <!-- City pill selector inserted by maps.js -->
      <div id="map-pills"></div>
      <!-- One div per city map -->
      <div id="map-tokyo1"    class="city-map" hidden></div>
      <div id="map-kyoto"     class="city-map" hidden></div>
      <div id="map-hiroshima" class="city-map" hidden></div>
      <div id="map-okinawa"   class="city-map" hidden></div>
      <div id="map-tokyo2"    class="city-map" hidden></div>
    </div>
    <div id="tab-transport" class="tab-panel" hidden></div>
    <div id="tab-checklist" class="tab-panel" hidden></div>
  </main>

  <!-- Bottom navigation (mobile) / Top tabs (desktop via CSS) -->
  <nav class="bottom-nav" role="tablist">
    <button class="nav-btn active" data-tab="agenda"    onclick="showTab('agenda')">
      <span class="nav-icon">📅</span><span class="nav-label">Agenda</span>
    </button>
    <button class="nav-btn" data-tab="maps"       onclick="showTab('maps')">
      <span class="nav-icon">📍</span><span class="nav-label">Cartes</span>
    </button>
    <button class="nav-btn" data-tab="transport"  onclick="showTab('transport')">
      <span class="nav-icon">🚄</span><span class="nav-label">Transport</span>
    </button>
    <button class="nav-btn" data-tab="checklist"  onclick="showTab('checklist')">
      <span class="nav-icon">✅</span><span class="nav-label">Checklist</span>
    </button>
  </nav>

  <!-- Footer -->
  <footer class="app-footer">
    <span id="last-updated"></span>
    <span>•</span>
    <a href="japon_itineraire_2026.md" download>⬇️ Télécharger le MD</a>
  </footer>

  <!-- Scripts -->
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script type="module" src="app.js"></script>

</body>
</html>
```

---

## style.css — key rules

```css
/* CSS custom properties for city colors */
:root {
  --c-tokyo:     #C0392B;
  --c-kyoto:     #1D6E4F;
  --c-hiroshima: #B45309;
  --c-okinawa:   #1565C0;
  --c-navy:      #1a2744;
  --c-light:     #F5F4F0;
  --c-mid:       #E8E6DF;
  --radius:      10px;
}

/* Mobile-first: bottom nav always visible */
.bottom-nav {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  display: flex;
  background: var(--c-navy);
  z-index: 100;
}
.nav-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  color: rgba(255,255,255,.6);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
}
.nav-btn.active { color: white; }

/* Desktop: top tabs instead of bottom nav */
@media (min-width: 768px) {
  .bottom-nav {
    position: static;
    flex-direction: row;
    /* restyle as top tabs */
  }
}

/* Day card */
.day-card {
  border: 1px solid var(--c-mid);
  border-radius: var(--radius);
  margin-bottom: 12px;
  overflow: hidden;
}
.day-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 2px solid var(--city-color, var(--c-navy));
}
.day-num {
  font-size: 11px;
  font-weight: 600;
  color: var(--city-color, var(--c-navy));
}

/* Activity row */
.activity-row {
  display: flex;
  gap: 8px;
  padding: 5px 14px;
  border-top: 1px solid var(--c-mid);
  align-items: flex-start;
}
.activity-time { font-size: 10px; color: #888; min-width: 38px; padding-top: 2px; }
.activity-text { flex: 1; font-size: 13px; }
.vote-btns { display: flex; gap: 2px; }
.vote-btn {
  background: none; border: none; cursor: pointer;
  font-size: 14px; opacity: .3; transition: opacity .15s, transform .15s;
}
.vote-btn.active { opacity: 1; transform: scale(1.2); }

/* Transport row */
.transport-row {
  background: #F0EEE8;
  padding: 3px 14px;
  font-size: 11px;
  color: #666;
  font-style: italic;
  border-top: 1px solid var(--c-mid);
}

/* Tag chips */
.tag {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  text-transform: uppercase;
}
.tag-UNESCO   { background: #DDEEFF; color: #0C447C; }
.tag-anime    { background: #EDE8FF; color: #3C2890; }
.tag-food     { background: #E8F5D8; color: #2D5A0E; }
.tag-nature   { background: #D8F5E8; color: #0A4A28; }
.tag-culture  { background: #DDEEFF; color: #0C447C; }
.tag-sport    { background: #FFE0E0; color: #7A1A1A; }
.tag-fun      { background: #FFF0D8; color: #7A3800; }
.tag-transport{ background: #EBEBEB; color: #444; }

/* City map */
.city-map { height: 420px; border-radius: var(--radius); }
@media (min-width: 768px) { .city-map { height: 560px; } }

/* Sticky note textarea */
.day-note {
  width: 100%;
  border: none;
  border-top: 1px dashed var(--c-mid);
  padding: 8px 14px;
  font-size: 12px;
  color: #666;
  resize: none;
  min-height: 36px;
  font-family: inherit;
}
.day-note:focus { outline: none; background: #FFFEF0; }

/* Flight card */
.flight-card {
  border: 1px solid var(--c-mid);
  border-radius: var(--radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.flight-route {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Print styles */
@media print {
  .bottom-nav, .vote-btns, .day-note, header, footer { display: none; }
  .tab-panel { display: block !important; }
  .day-card { break-inside: avoid; }
  .transport-row { background: #f5f5f5; }
}
```

---

## GitHub Actions deploy

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Write version timestamp
        run: echo "Déployé le $(date '+%d %B %Y à %H:%M') UTC" > version.txt

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## README.md content to generate

````markdown
# 🗾 Japon 2026 — Itinéraire famille

Site web de l'itinéraire partagé — powered by GitHub Pages.

**👉 [Voir le site](https://{USERNAME}.github.io/{REPO-NAME}/)**

## Mettre à jour l'itinéraire

1. Éditer `japon_itineraire_2026.md`
2. `git add japon_itineraire_2026.md && git commit -m "votre message" && git push`
3. Le site se met à jour automatiquement en ~60 secondes

## Ce que tu peux modifier dans le MD

- ✅ Horaires et descriptions des activités
- ✅ Temps et coûts de transport
- ✅ Conseils (lignes > blockquote)
- ✅ Statuts de la checklist (✅/⚠️/ℹ️)
- ✅ Détails des vols et tableaux de transport
- ✅ Coordonnées dans le tableau `## 📍 Coordonnées`

## Conventions MD attendues par le parser

| Élément | Format attendu |
|---------|---------------|
| En-tête ville | `## 🌟 CITY NAME — dates` |
| En-tête jour | `### Jour N — Weekday DD month : Titre` |
| Conseil | `> texte` (blockquote après l'en-tête de jour) |
| Ligne transport | Colonne Heure = `—` |
| Vol confirmé | Première colonne = `✅` |
| Marqueur carte | Tableau `## 📍 Coordonnées` |

## Mise en route (première fois)

```bash
# Cloner et installer
git clone https://github.com/{USERNAME}/{REPO-NAME}.git
cd {REPO-NAME}

# Activer GitHub Pages
# Settings → Pages → Source: GitHub Actions
# Pousser pour déclencher le premier déploiement
git push
```
````

---

## Deliverables — generate all of these

1. `index.html` — app shell complet
2. `style.css` — mobile-first, print-friendly, couleurs par ville
3. `app.js` — routing, localStorage, rendu de l'agenda, checklist, transport
4. `parser.js` — fetch + toutes les fonctions parse avec gestion d'erreur
5. `maps.js` — Leaflet, driven by parsed MD locations, NO hardcoded trip data
6. `japon_itineraire_2026.md` — ajouter le bloc `<!-- CONFIG -->` en haut ET
   le tableau `## 📍 Coordonnées` à la fin (ne rien supprimer d'existant)
7. `.github/workflows/deploy.yml`
8. `README.md`

## After generating, output these commands

```bash
# 1. Create GitHub repo (requires gh CLI)
gh repo create japan-trip-2026 --public --source=. --remote=origin --push

# 2. Enable GitHub Pages (requires gh CLI)
gh api repos/{OWNER}/japan-trip-2026/pages \
  --method POST \
  --field source='{"branch":"main","path":"/"}' \
  --field build_type='workflow'

# 3. Open the deployed site
gh browse
```

And remind the user:
- Replace `{OWNER}` with their GitHub username
- The site URL will be: `https://{username}.github.io/japan-trip-2026/`
- First deploy takes ~2 minutes; subsequent pushes take ~60 seconds
- To update the trip: edit the MD file, push, done
