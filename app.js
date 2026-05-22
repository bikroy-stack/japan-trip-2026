// app.js
import { loadItinerary } from './parser.js';
import { initMaps, invalidateActiveMap } from './maps.js';

let DATA = null;

async function init() {
  const savedTab = localStorage.getItem('activeTab') ?? 'agenda';
  try {
    DATA = await loadItinerary();
    renderAgenda(DATA);
    renderTransport(DATA);
    renderChecklist(DATA);
    updateFooter(DATA.config);
    document.getElementById('skeleton').hidden = true;
    document.getElementById('main-content').hidden = false;
    showTab(savedTab, false);
  } catch (err) {
    document.getElementById('skeleton').hidden = true;
    const banner = document.getElementById('error-banner');
    banner.hidden = false;
    document.getElementById('error-msg').textContent = ' ' + err.message;
    console.error(err);
  }
}

// ── TAB ROUTING ───────────────────────────────────────────────────────────────

window.showTab = function showTab(tabId, save = true) {
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = true; });
  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.hidden = false;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  if (tabId === 'maps') {
    // Initialise maps lazily on first visit
    if (DATA && !document.querySelector('.map-pill')) {
      initMaps(DATA.mapLocations);
    }
    invalidateActiveMap();
  }
  if (save) localStorage.setItem('activeTab', tabId);
};

// ── AGENDA ────────────────────────────────────────────────────────────────────

function renderAgenda(data) {
  const panel = document.getElementById('tab-agenda');
  const cityMap = new Map(data.cities.map(c => [c.id, c]));
  let lastCityId = null;
  let html = '';

  for (const day of data.days) {
    if (day.cityId !== lastCityId) {
      if (lastCityId) html += '</div>'; // close previous city section
      const city = cityMap.get(day.cityId) ?? { name: day.cityId, emoji: '', dates: '', color: '#1a2744' };
      html += `<div class="city-section">
        <div class="city-heading" style="background:${city.color}">
          <span>${city.emoji} ${city.name}</span>
          <span class="city-dates">${city.dates}</span>
        </div>`;
      lastCityId = day.cityId;
    }
    html += renderDayCard(day, cityMap.get(day.cityId)?.color ?? '#1a2744');
  }
  if (lastCityId) html += '</div>';
  panel.innerHTML = html;

  // Wire up vote buttons and note textareas
  panel.querySelectorAll('.vote-btn').forEach(btn => {
    const { day, idx, dir } = btn.dataset;
    const key = `vote_${day}_${idx}`;
    applyVoteStyle(btn, localStorage.getItem(key), dir);
    btn.addEventListener('click', () => {
      const cur = localStorage.getItem(key);
      const next = cur === dir ? '' : dir;
      localStorage.setItem(key, next);
      // Refresh both buttons in the pair
      panel.querySelectorAll(`.vote-btn[data-day="${day}"][data-idx="${idx}"]`).forEach(b => {
        applyVoteStyle(b, next, b.dataset.dir);
      });
    });
  });

  panel.querySelectorAll('.day-note').forEach(ta => {
    const key = `note_${ta.dataset.day}`;
    ta.value = localStorage.getItem(key) ?? '';
    ta.addEventListener('input', () => {
      localStorage.setItem(key, ta.value);
      autoResizeTextarea(ta);
    });
    autoResizeTextarea(ta);
  });
}

function renderDayCard(day, cityColor) {
  const style = `--city-color:${cityColor}`;
  let html = `<div class="day-card" style="${style}">
    <div class="day-header">
      <span class="day-num">Jour ${day.num}</span>
      <span class="day-date">${escHtml(day.fullDate)}</span>
      <span class="day-title">${escHtml(day.title)}</span>
    </div>`;

  if (day.tip) {
    html += `<div class="day-tip">${escHtml(day.tip)}</div>`;
  }

  let activityIdx = 0;
  for (const item of day.items) {
    if (item.type === 'transport') {
      html += renderTransportRow(item);
    } else {
      html += renderActivityRow(item, day.num, activityIdx, cityColor);
      activityIdx++;
    }
  }

  html += `<textarea class="day-note" data-day="${day.num}" placeholder="📝 Notes du groupe…" rows="1"></textarea>`;
  html += '</div>';
  return html;
}

function renderActivityRow(item, dayNum, idx, cityColor) {
  const tagHtml = item.tag && item.tag !== 'other'
    ? `<span class="tag tag-${item.tag}">${item.tag}</span>` : '';
  const confirmedHtml = item.confirmed ? '<span class="confirmed-badge">✅</span>' : '';
  const emoji = item.emoji ? `${item.emoji} ` : '';

  return `<div class="activity-row">
    <span class="activity-time">${escHtml(item.time)}</span>
    <div class="activity-body">
      <span class="activity-text">${emoji}${escHtml(item.text)}</span>
      <div class="activity-meta">
        ${tagHtml}${confirmedHtml}
        <span class="vote-btns">
          <button class="vote-btn" data-day="${dayNum}" data-idx="${idx}" data-dir="up"   title="J'aime!">👍</button>
          <button class="vote-btn" data-day="${dayNum}" data-idx="${idx}" data-dir="down" title="Pas fan">👎</button>
        </span>
      </div>
    </div>
  </div>`;
}

function renderTransportRow(item) {
  const parts = [item.icon, item.duration, item.route ? `<span class="transport-route">${escHtml(item.route)}</span>` : null, item.cost ? `<span class="transport-cost">${escHtml(item.cost)}</span>` : null].filter(Boolean);
  return `<div class="transport-row">${parts.join(' · ')}</div>`;
}

function applyVoteStyle(btn, stored, dir) {
  btn.classList.toggle('active-up',   dir === 'up'   && stored === 'up');
  btn.classList.toggle('active-down', dir === 'down' && stored === 'down');
}

function autoResizeTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// ── TRANSPORT TAB ─────────────────────────────────────────────────────────────

function renderTransport(data) {
  const panel = document.getElementById('tab-transport');
  let html = '<div class="transport-section">';

  // Flights
  html += '<h2>✈️ Vols confirmés</h2>';
  for (const f of data.flights) {
    html += `<div class="flight-card">
      <div class="flight-route">
        <span class="flight-num">${escHtml(f.flight)}</span>
        <span>${escHtml(f.from)}</span>
        <span>→</span>
        <span>${escHtml(f.to)}</span>
        ${f.confirmed ? '<span class="confirmed-badge">✅</span>' : ''}
      </div>
      <div class="flight-meta">
        <span>${escHtml(f.airline)}</span>
        <span>${escHtml(f.date)}</span>
        <span>${escHtml(f.departure)} → ${escHtml(f.arrival)}</span>
      </div>
    </div>`;
  }

  // Inter-city transport recap
  html += '<h2 style="margin-top:16px">🚄 Transports inter-villes</h2>';
  if (data.transport.recap && data.transport.recap.length) {
    html += '<table class="data-table"><thead><tr><th>Trajet</th><th>Montant</th></tr></thead><tbody>';
    for (const r of data.transport.recap) {
      html += `<tr><td>${escHtml(r.trajet)}</td><td>${escHtml(r.montant)}</td></tr>`;
    }
    html += '</tbody></table>';
  }

  // Local transport
  html += '<h2 style="margin-top:16px">🚌 Transport local</h2>';
  const lt = data.localTransport;
  if (lt.cities) {
    for (const city of lt.cities) {
      html += `<h3>${escHtml(city.city)}</h3>`;
      if (city.rows && city.rows.length) {
        html += '<table class="data-table"><thead><tr><th>Jour</th><th>Destinations</th><th>Option</th><th>Coût</th></tr></thead><tbody>';
        for (const r of city.rows) {
          html += `<tr><td>${escHtml(r.jour)}</td><td>${escHtml(r.destinations)}</td><td>${escHtml(r.option)}</td><td>${escHtml(r.cout)}</td></tr>`;
        }
        html += '</tbody></table>';
        if (city.total) html += `<p style="font-size:12px;font-weight:600;text-align:right;padding:4px 0 8px">Total : ${escHtml(city.total)}</p>`;
      }
    }
  }
  if (lt.grandTotal && lt.grandTotal.length) {
    html += '<h3>Grand total</h3><table class="data-table"><thead><tr><th>Ville</th><th>Montant</th></tr></thead><tbody>';
    for (const r of lt.grandTotal) {
      html += `<tr><td>${escHtml(r.ville)}</td><td>${escHtml(r.montant)}</td></tr>`;
    }
    html += '</tbody></table>';
  }

  html += '</div>';
  panel.innerHTML = html;
}

// ── CHECKLIST TAB ─────────────────────────────────────────────────────────────

function renderChecklist(data) {
  const panel = document.getElementById('tab-checklist');
  // Sort: urgent first, then others, confirmed last
  const sorted = [...data.checklist].sort((a, b) => {
    if (a.status === b.status) return 0;
    if (a.status === '⚠️') return -1;
    if (b.status === '⚠️') return 1;
    if (a.status === '✅') return 1;
    if (b.status === '✅') return -1;
    return 0;
  });

  const total = sorted.length;

  let html = `<div class="checklist-progress"><div class="checklist-progress-fill" id="cl-fill" style="width:0%"></div></div>
    <p class="checklist-stats" id="cl-stats">Chargement…</p>`;

  for (const item of sorted) {
    const slug = slugify(item.name);
    const done = localStorage.getItem(`check_${slug}`) === '1';
    html += `<div class="checklist-item${done ? ' done' : ''}${item.urgent ? ' urgent' : ''}" id="cli-${slug}">
      <span class="checklist-status">${escHtml(item.status)}</span>
      <div class="checklist-body">
        <div class="checklist-name">${escHtml(item.name)}</div>
        ${item.date ? `<div class="checklist-date">📅 ${escHtml(item.date)}</div>` : ''}
        ${item.details ? `<div class="checklist-details">${escHtml(item.details)}</div>` : ''}
      </div>
      <input type="checkbox" class="checklist-checkbox" data-slug="${slug}" ${done ? 'checked' : ''} title="Marquer comme fait">
    </div>`;
  }

  panel.innerHTML = html;
  updateChecklistProgress(total);

  panel.querySelectorAll('.checklist-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const slug = cb.dataset.slug;
      localStorage.setItem(`check_${slug}`, cb.checked ? '1' : '0');
      const row = document.getElementById(`cli-${slug}`);
      if (row) row.classList.toggle('done', cb.checked);
      updateChecklistProgress(total);
    });
  });
}

function updateChecklistProgress(total) {
  const checked = document.querySelectorAll('.checklist-checkbox:checked').length;
  const pct = total ? Math.round(checked / total * 100) : 0;
  const fill = document.getElementById('cl-fill');
  const stats = document.getElementById('cl-stats');
  if (fill) fill.style.width = pct + '%';
  if (stats) stats.textContent = `${checked} / ${total} réservations confirmées (${pct}%)`;
}

// ── FOOTER ────────────────────────────────────────────────────────────────────

async function updateFooter(config) {
  const el = document.getElementById('last-updated');
  if (!el) return;
  try {
    const res = await fetch('./version.txt');
    if (res.ok) {
      el.textContent = (await res.text()).trim();
      return;
    }
  } catch {}
  const name = config?.trip_name ?? 'Japon 2026';
  el.textContent = name;
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
}

init();
