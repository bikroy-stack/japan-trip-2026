// explore.js — "Itinéraire & Carte" tab
// Combines the city map with a day-by-day activity list. Selecting an
// activity centers the map on its marker (if any), opens its popup, and
// shows the transport route(s) leading to that activity.
// No hardcoded trip data — everything comes from parser.js output.

import { CITY_MAP_CONFIG, CITY_COLORS, createCityMap, escHtml } from './maps.js';

const _maps = {};
let _activeCityId = null;
const _wikiCache = new Map(); // wiki title -> summary JSON | null (failed/no thumbnail)

let _DATA = null;
let _markerIndex = null;       // `${dayNum}::${activityText}` -> marker
let _currentDay = null;
let _currentDayActivities = []; // [{ item, transports }]

export function initExplore(data) {
  _DATA = data;
  _markerIndex = buildMarkerIndex(data.mapLocations);
  buildCityPills();
  const firstCity = Object.keys(CITY_MAP_CONFIG)[0];
  selectCity(firstCity);
}

export function invalidateActiveExploreMap() {
  if (_activeCityId && _maps[_activeCityId]) {
    setTimeout(() => _maps[_activeCityId].invalidateSize(), 100);
  }
}

function buildMarkerIndex(mapLocations) {
  const idx = new Map();
  for (const markers of mapLocations.values()) {
    for (const m of markers) {
      if (m.day != null && m.activityText) {
        idx.set(`${m.day}::${m.activityText}`, m);
      }
    }
  }
  return idx;
}

function buildCityPills() {
  const container = document.getElementById('explore-pills');
  if (!container) return;
  container.innerHTML = '';
  for (const [cityId, cfg] of Object.entries(CITY_MAP_CONFIG)) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'map-pill';
    pill.dataset.city = cityId;
    pill.style.background = CITY_COLORS[cityId] ?? '#1a2744';
    pill.textContent = cfg.label;
    pill.onclick = () => selectCity(cityId);
    container.appendChild(pill);
  }
}

function selectCity(cityId) {
  document.querySelectorAll('#explore-pills .map-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.city === cityId);
  });

  document.querySelectorAll('#tab-explore .city-map').forEach(d => { d.hidden = true; });
  const mapDiv = document.getElementById(`explore-map-${cityId}`);
  if (mapDiv) mapDiv.hidden = false;

  if (_maps[cityId]) {
    _maps[cityId].invalidateSize();
  } else {
    const cfg = CITY_MAP_CONFIG[cityId];
    const markers = _DATA.mapLocations.get(cityId) ?? [];
    _maps[cityId] = createCityMap(`explore-map-${cityId}`, cityId, cfg, markers);
  }
  _activeCityId = cityId;

  buildDayPills(cityId);
}

function buildDayPills(cityId) {
  const container = document.getElementById('explore-days');
  container.innerHTML = '';
  const days = _DATA.days.filter(d => d.cityId === cityId);

  // Some day numbers appear twice (alternate plans A/B) — disambiguate pills
  const counts = {};
  days.forEach(d => { counts[d.num] = (counts[d.num] ?? 0) + 1; });
  const seen = {};

  days.forEach((day, idx) => {
    let label = `J${day.num}`;
    if (counts[day.num] > 1) {
      const n = seen[day.num] ?? 0;
      label += String.fromCharCode(65 + n);
      seen[day.num] = n + 1;
    }
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'day-pill';
    pill.textContent = label;
    pill.title = day.title;
    pill.onclick = () => selectDay(cityId, idx);
    container.appendChild(pill);
  });

  if (days.length) selectDay(cityId, 0);
}

function selectDay(cityId, idx) {
  document.querySelectorAll('#explore-days .day-pill').forEach((p, i) => {
    p.classList.toggle('active', i === idx);
  });

  const days = _DATA.days.filter(d => d.cityId === cityId);
  const day = days[idx];
  _currentDay = day;
  renderActivityList(day);
  renderDetailPanel(day);
  fitMapToDay(cityId, day);
}

function renderActivityList(day) {
  const container = document.getElementById('explore-activities');
  _currentDayActivities = [];
  let html = '';

  let pendingTransports = [];
  for (const item of day.items) {
    if (item.type === 'transport') {
      pendingTransports.push(item);
      continue;
    }
    const idx = _currentDayActivities.length;
    _currentDayActivities.push({ item, transports: pendingTransports });
    pendingTransports = [];

    const tagHtml = item.tag && item.tag !== 'other' ? `<span class="tag tag-${item.tag}">${item.tag}</span>` : '';
    const confirmedHtml = item.confirmed ? '<span class="confirmed-badge">✅</span>' : '';
    const emoji = item.emoji ? `${item.emoji} ` : '';

    html += `<button type="button" class="explore-activity" data-idx="${idx}">
      <span class="activity-time">${escHtml(item.time)}</span>
      <div class="activity-body">
        <span class="activity-text">${emoji}${escHtml(item.text)}</span>
        <div class="activity-meta">${tagHtml}${confirmedHtml}</div>
      </div>
    </button>`;
  }

  container.innerHTML = html;
  container.querySelectorAll('.explore-activity').forEach(btn => {
    btn.addEventListener('click', () => selectActivity(Number(btn.dataset.idx)));
  });
}

function selectActivity(idx) {
  document.querySelectorAll('#explore-activities .explore-activity').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });

  const entry = _currentDayActivities[idx];
  if (!entry) return;
  renderDetailPanel(_currentDay, entry);

  const marker = _currentDay && _markerIndex.get(`${_currentDay.num}::${entry.item.text}`);
  const map = _maps[_activeCityId];
  if (marker && map) {
    map.setView([marker.lat, marker.lng], 15);
    const layer = map._markerLayers?.get(marker.name);
    if (layer) layer.openPopup();
  }
}

// Renders the detail side-panel: the selected activity's full info + route
// to get there, plus the day's tip. With no `entry`, shows the day's tip
// (if any) and a placeholder inviting the user to pick an activity.
// If a map marker is matched for the activity, also shows a "Top 5" list
// and a representative photo (fetched lazily from Wikipedia).
function renderDetailPanel(day, entry = null) {
  const panel = document.getElementById('explore-detail');
  let html = '';
  let marker = null;

  if (entry) {
    const { item, transports } = entry;
    const emoji = item.emoji ? `${item.emoji} ` : '';
    const tagHtml = item.tag && item.tag !== 'other' ? `<span class="tag tag-${item.tag}">${item.tag}</span>` : '';
    const confirmedHtml = item.confirmed ? '<span class="confirmed-badge">✅ Confirmé</span>' : '';

    html += `<div class="detail-title">${emoji}${escHtml(item.text)}</div>`;
    html += `<div class="detail-meta">${escHtml(item.time)} ${tagHtml}${confirmedHtml}</div>`;

    html += `<div class="detail-section"><h4>🧭 Pour s'y rendre</h4>`;
    if (transports.length) {
      html += transports.map(t => {
        const parts = [
          t.icon,
          t.duration,
          t.route ? `<span class="transport-route">${escHtml(t.route)}</span>` : null,
          t.cost ? `<span class="transport-cost">${escHtml(t.cost)}</span>` : null,
        ].filter(Boolean);
        return `<div class="route-step">${parts.join(' · ')}</div>`;
      }).join('');
    } else {
      html += `<div class="route-step route-step-empty">Aucun trajet indiqué avant cette activité.</div>`;
    }
    html += `</div>`;

    marker = _currentDay && _markerIndex.get(`${_currentDay.num}::${item.text}`);

    if (marker?.top5?.length) {
      html += `<div class="detail-section"><h4>🏆 Top 5 à faire sur place</h4><ol class="detail-top5">`;
      html += marker.top5.map(t => `<li>${escHtml(t)}</li>`).join('');
      html += `</ol></div>`;
    }

    if (marker?.wiki) {
      html += `<div class="detail-section detail-photo-section">
        <div class="detail-photo-loading">📷 Chargement de la photo…</div>
      </div>`;
    }
  } else {
    html += `<div class="detail-empty">👉 Choisis une activité pour voir le trajet et les détails.</div>`;
  }

  if (day?.tip) {
    html += `<div class="detail-section"><h4>💡 Conseil du jour</h4><p class="detail-tip">${escHtml(day.tip)}</p></div>`;
  }

  panel.innerHTML = html;

  if (marker?.wiki) {
    const section = panel.querySelector('.detail-photo-section');
    loadWikiPhoto(marker.wiki, section);
  }
}

// Fetches a representative thumbnail for `title` from the Wikipedia REST
// summary API (cached, CORS-enabled, no API key). `section` is the specific
// DOM node to fill — if the panel has since re-rendered (node detached),
// the result is discarded.
async function loadWikiPhoto(title, section) {
  let data = _wikiCache.get(title);
  if (data === undefined) {
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      data = res.ok ? await res.json() : null;
    } catch {
      data = null;
    }
    _wikiCache.set(title, data);
  }

  if (!section.isConnected) return;

  const img = data?.thumbnail?.source;
  if (img) {
    section.innerHTML = `<img class="detail-photo" src="${img}" alt="${escHtml(data.title || title)}" loading="lazy">`;
  } else {
    section.remove();
  }
}

function fitMapToDay(cityId, day) {
  const map = _maps[cityId];
  if (!map) return;
  const markers = (_DATA.mapLocations.get(cityId) ?? []).filter(m => m.day === day.num);

  if (markers.length === 1) {
    map.setView([markers[0].lat, markers[0].lng], 14);
  } else if (markers.length > 1) {
    map.fitBounds(L.latLngBounds(markers.map(m => [m.lat, m.lng])), { padding: [30, 30] });
  } else {
    const cfg = CITY_MAP_CONFIG[cityId];
    map.setView(cfg.center, cfg.zoom);
  }
}
