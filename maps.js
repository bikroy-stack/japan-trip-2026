// maps.js — Leaflet map, driven entirely by parsed MD locations

export const CITY_MAP_CONFIG = {
  tokyo1:    { center: [35.69, 139.70], zoom: 12, label: 'Tokyo I' },
  kyoto:     { center: [35.00, 135.76], zoom: 12, label: 'Kyoto + Excursions' },
  hiroshima: { center: [34.36, 132.42], zoom: 11, label: 'Hiroshima + Miyajima' },
  okinawa:   { center: [26.44, 127.80], zoom: 10, label: 'Okinawa' },
  tokyo2:    { center: [35.71, 139.78], zoom: 13, label: 'Tokyo II + Fuji' },
};

const TAG_EMOJI = {
  UNESCO: '🏛️', anime: '🎮', food: '🍜', nature: '🌿',
  culture: '🏯', sport: '⚾', fun: '🎡', transport: '🚇', other: '📍',
};

const TAG_COLORS = {
  UNESCO: '#1565C0', anime: '#5E35B1', food: '#558B2F',
  nature: '#2E7D32', culture: '#1565C0', sport: '#B71C1C',
  fun: '#E65100', transport: '#546E7A', other: '#666',
};

export const CITY_COLORS = {
  tokyo1: '#C0392B', kyoto: '#1D6E4F', hiroshima: '#B45309',
  okinawa: '#1565C0', tokyo2: '#C0392B',
};

const _maps = {};
let _activeMapId = null;

export function initMaps(mapLocations) {
  buildPills(mapLocations);
  // Initialise first city with data
  const firstCity = Object.keys(CITY_MAP_CONFIG).find(id => (mapLocations.get(id) ?? []).length > 0)
    ?? 'tokyo1';
  showCityMap(firstCity, mapLocations);
}

function buildPills(mapLocations) {
  const container = document.getElementById('map-pills');
  if (!container) return;
  container.innerHTML = '';
  for (const [cityId, cfg] of Object.entries(CITY_MAP_CONFIG)) {
    const count = (mapLocations.get(cityId) ?? []).length;
    const pill = document.createElement('button');
    pill.className = 'map-pill';
    pill.dataset.city = cityId;
    pill.style.background = CITY_COLORS[cityId] ?? '#1a2744';
    pill.textContent = `${cfg.label} (${count})`;
    pill.onclick = () => showCityMap(cityId, mapLocations);
    container.appendChild(pill);
  }
}

function showCityMap(cityId, mapLocations) {
  // Update pills
  document.querySelectorAll('.map-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.city === cityId);
  });

  // Hide all map divs
  document.querySelectorAll('.city-map').forEach(d => {
    d.classList.remove('visible');
    d.hidden = true;
  });

  const mapDiv = document.getElementById(`map-${cityId}`);
  if (!mapDiv) return;
  mapDiv.classList.add('visible');
  mapDiv.hidden = false;

  if (_maps[cityId]) {
    _maps[cityId].invalidateSize();
    _activeMapId = cityId;
    return;
  }

  const cfg = CITY_MAP_CONFIG[cityId];
  const markers = mapLocations.get(cityId) ?? [];
  _maps[cityId] = createCityMap(`map-${cityId}`, cityId, cfg, markers);
  _activeMapId = cityId;
}

export function invalidateActiveMap() {
  if (_activeMapId && _maps[_activeMapId]) {
    setTimeout(() => _maps[_activeMapId].invalidateSize(), 100);
  }
}

// Creates a Leaflet map bound to `containerId`. `cityId` is only used for
// route/marker styling (city color). Returns the map instance with a
// `_markerLayers` Map (marker name → L.Marker) attached for external use
// (e.g. the Explorer tab panning to a marker and opening its popup).
export function createCityMap(containerId, cityId, cfg, markers) {
  const map = L.map(containerId, { center: cfg.center, zoom: cfg.zoom });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  const sorted = [...markers].sort((a, b) => (a.day ?? 99) - (b.day ?? 99));
  const routePoints = sorted.filter(m => !m.isLogement).map(m => [m.lat, m.lng]);

  if (routePoints.length > 1) {
    L.polyline(routePoints, {
      color: CITY_COLORS[cityId] ?? '#1a2744',
      weight: 2,
      opacity: 0.45,
      dashArray: '6, 6',
    }).addTo(map);
  }

  const markerLayers = new Map();
  for (const marker of markers) {
    const layer = L.marker([marker.lat, marker.lng], { icon: createMarkerIcon(marker) })
      .addTo(map)
      .bindPopup(createPopupHTML(marker), { maxWidth: 240 });
    markerLayers.set(marker.name, layer);
  }
  map._markerLayers = markerLayers;

  return map;
}

function createMarkerIcon(marker) {
  const emoji = marker.isLogement ? '🏠' : (TAG_EMOJI[marker.tag] ?? '📍');
  const color = marker.isLogement ? '#1a2744' : (TAG_COLORS[marker.tag] ?? '#666');
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid white;">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
}

function createPopupHTML(marker) {
  const dayLabel = marker.day ? `Jour ${marker.day}` : 'Logement';
  const confirmed = marker.confirmed
    ? '<span style="color:#1D9E75;font-weight:600">✅</span>' : '';
  const transport = marker.transportText
    ? `<p style="color:#888;font-size:11px;margin:4px 0 0;line-height:1.4">${escHtml(marker.transportText)}</p>` : '';
  const activity = marker.activityText
    ? `<p style="font-size:11px;color:#444;margin:3px 0 0;line-height:1.4">${escHtml(marker.activityText)}</p>` : '';
  const tagStyle = `background:${TAG_COLORS[marker.tag] ?? '#888'};color:white;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;text-transform:uppercase`;

  return `<div style="min-width:180px;font-family:sans-serif">
    <div style="font-weight:700;font-size:13px;margin-bottom:5px">${escHtml(marker.name)}</div>
    <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;font-size:11px;color:#555">
      <span style="${tagStyle}">${marker.tag ?? 'autre'}</span>
      <span>${dayLabel}</span>
      ${confirmed}
    </div>
    ${transport}${activity}
  </div>`;
}

export function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
