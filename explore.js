// explore.js — "Itinéraire & Carte" tab
// Combines the city map with a day-by-day activity list. Selecting an
// activity centers the map on its marker (if any), opens its popup, and
// shows the transport route(s) leading to that activity.
// No hardcoded trip data — everything comes from parser.js output.

import { CITY_MAP_CONFIG, CITY_COLORS, createCityMap, escHtml } from './maps.js';

const _maps = {};
let _activeCityId = null;

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
  hideRoutePanel();
  fitMapToDay(cityId, day);
}

function renderActivityList(day) {
  const container = document.getElementById('explore-activities');
  _currentDayActivities = [];
  let html = '';

  if (day.tip) {
    html += `<div class="day-tip">${escHtml(day.tip)}</div>`;
  }

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
  showRoutePanel(entry);

  const marker = _currentDay && _markerIndex.get(`${_currentDay.num}::${entry.item.text}`);
  const map = _maps[_activeCityId];
  if (marker && map) {
    map.setView([marker.lat, marker.lng], 15);
    const layer = map._markerLayers?.get(marker.name);
    if (layer) layer.openPopup();
  }
}

function showRoutePanel(entry) {
  const panel = document.getElementById('explore-route');
  const body = panel.querySelector('.route-panel-body');
  const { item, transports } = entry;
  const emoji = item.emoji ? `${item.emoji} ` : '';

  let html = `<div class="route-target">${emoji}${escHtml(item.text)}</div>`;
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

  body.innerHTML = html;
  panel.hidden = false;
}

function hideRoutePanel() {
  const panel = document.getElementById('explore-route');
  if (panel) panel.hidden = true;
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
