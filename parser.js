// parser.js — single source of truth reader

export async function loadItinerary() {
  const res = await fetch('./japon_itineraire_2026.md');
  if (!res.ok) throw new Error(`Cannot load MD file: ${res.status}`);
  const md = await res.text();
  return {
    config:         parseConfig(md),
    cities:         parseCities(md),
    days:           parseDays(md),
    flights:        parseFlights(md),
    transport:      parseInterCityTransport(md),
    localTransport: parseLocalTransport(md),
    checklist:      parseChecklist(md),
    mapLocations:   parseMapLocations(md),
  };
}

// ── CONFIG ────────────────────────────────────────────────────────────────────

function parseConfig(md) {
  const match = md.match(/<!--\s*CONFIG\s*([\s\S]*?)-->/);
  if (!match) return {};
  const cfg = {};
  for (const line of match[1].trim().split('\n')) {
    const [k, ...rest] = line.split(':');
    if (k && rest.length) cfg[k.trim()] = rest.join(':').trim();
  }
  return cfg;
}

// ── CITIES ────────────────────────────────────────────────────────────────────

const CITY_COLORS = {
  tokyo1: '#C0392B', kyoto: '#1D6E4F', hiroshima: '#B45309',
  okinawa: '#1565C0', tokyo2: '#C0392B',
};

function parseCities(md) {
  // Match "## emoji CITY NAME — dates" lines
  const re = /^## ([\u{1F000}-\u{1FFFF}☀-➿][️]?) ([A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ ]+?) — (.+)$/gmu;
  const cities = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    const name = m[2].trim();
    const id = slugifyCity(name);
    cities.push({
      id,
      name,
      emoji: m[1],
      dates: m[3].trim(),
      color: CITY_COLORS[id] ?? '#1a2744',
      logement: extractLogement(md, id),
    });
  }
  return cities;
}

function slugifyCity(name) {
  const n = name.toUpperCase();
  if (n.startsWith('TOKYO I') && n.includes('II')) return 'tokyo2';
  if (n.startsWith('TOKYO')) return 'tokyo1';
  if (n.includes('KYOTO')) return 'kyoto';
  if (n.includes('HIROSHIMA')) return 'hiroshima';
  if (n.includes('OKINAWA')) return 'okinawa';
  return name.toLowerCase().replace(/\s+/g, '_');
}

function extractLogement(md, cityId) {
  // Pull from Vue d'ensemble table
  const tableMatch = md.match(/## 📋 Vue d'ensemble[\s\S]*?\|([^\n]+)\|/gm);
  if (!tableMatch) return '';
  const labels = { tokyo1: 'Tokyo I', kyoto: 'Kyoto', hiroshima: 'Hiroshima', okinawa: 'Okinawa', tokyo2: 'Tokyo II' };
  const label = labels[cityId] ?? '';
  const re = new RegExp(`\\|\\s*[^|]*${label}[^|]*\\|[^|]+\\|([^|]+)\\|`);
  const rows = md.match(/\| [🗼⛩️🕊️🌊] .+? \| .+ \| .+ \|/g) ?? [];
  for (const row of rows) {
    if (row.includes(label)) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      return cells[2] ?? '';
    }
  }
  return '';
}

// ── DAYS ──────────────────────────────────────────────────────────────────────

const TAG_RULES = [
  { tag: 'UNESCO',    test: t => t.includes('UNESCO') },
  { tag: 'anime',     test: t => /🎮|🎬|🎨|Ghibli|anime|manga|Nintendo|USJ|Gundam/.test(t) },
  { tag: 'food',      test: t => /🍜|🍣|🍱|🥘|🍤|🍚|🍢|🥞|🍛|déjeuner|dîner|repas|ramen|sushi|donburi|gyudon|curry|izakaya|kaiseki|tonkatsu|champuru|okonomiyaki|unaju|ekiben|yakiniku|teppanyaki|monjayaki|tempura|tofu|soba/.test(t) },
  { tag: 'nature',    test: t => /🌿|🏔️|🌊|🌸|🌳|parc|montagne|plage|forêt|lac|jardin|koï|Kawaguchiko|Fuji|Cape Maeda|Grotte Bleue|snorkel/.test(t) },
  { tag: 'culture',   test: t => /🏯|🏛️|⛩️|musée|château|temple|shrine|patrimoine|cérémonie|Nijo|Kinkaku|Fushimi|Kiyomizu|Senso|Kasuga|Itsukushima|Genbaku|Paix/.test(t) },
  { tag: 'sport',     test: t => /🏋️|⚾|sumo|baseball|sport/.test(t) },
  { tag: 'fun',       test: t => /🎡|🎢|🎠|zoo|aquarium|capybara|TeamLab|café|Ueno|Churaumi|American Village/.test(t) },
];

function detectTag(text) {
  for (const rule of TAG_RULES) {
    if (rule.test(text)) return rule.tag;
  }
  return 'other';
}

export function parseDays(md) {
  // Split MD into city sections by H2 city headers
  const cityRe = /^## ([\u{1F000}-\u{1FFFF}☀-➿][️]?) ([A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ ]+?) — (.+)$/mu;
  const lines = md.split('\n');

  const days = [];
  let currentCityId = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect city header
    const cityMatch = line.match(/^## ([\u{1F300}-\u{1FFFF}☀-➿\u{1F000}-\u{1F02F}][️⃐-⃿]?) ([A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ ]+?) — (.+)/u);
    if (cityMatch) {
      currentCityId = slugifyCity(cityMatch[2].trim());
      i++;
      continue;
    }

    // Detect day header: ### Jour N — Weekday DD month : Title
    const dayMatch = line.match(/^### Jour (\d+)\w* — (\w+) (\d+ \w+) : (.+)/);
    if (dayMatch && currentCityId) {
      const num = parseInt(dayMatch[1], 10);
      const weekday = dayMatch[2];
      const date = dayMatch[3];
      const title = dayMatch[4].trim();

      // Collect lines until next H3 or H2
      let tipText = null;
      const items = [];
      i++;
      while (i < lines.length && !lines[i].match(/^#{2,3} /)) {
        const l = lines[i];

        // Blockquote tip
        if (l.startsWith('> ') && !tipText) {
          tipText = l.replace(/^>\s*/, '').trim();
          i++;
          continue;
        }

        // Table row (skip header/separator)
        if (l.startsWith('|') && !l.match(/^\|[-| ]+\|$/)) {
          const cells = l.split('|').map(c => c.trim()).filter(Boolean);
          if (cells.length >= 2) {
            const timeCell = cells[0];
            const textCell = cells.slice(1).join(' | ');
            if (timeCell === '—' || timeCell === '-') {
              items.push(parseTransportItem(textCell));
            } else if (!timeCell.match(/^heure$/i)) {
              items.push(parseActivityItem(timeCell, textCell));
            }
          }
        }
        i++;
      }

      days.push({ num, cityId: currentCityId, weekday, date, fullDate: `${weekday} ${date}`, title, tip: tipText, items });
      continue;
    }
    i++;
  }
  return days;
}

function parseActivityItem(time, raw) {
  // Extract leading emoji
  const emojiMatch = raw.match(/^([\u{1F000}-\u{1FFFF}☀-➿\u{1F300}-\u{1FFFF}][️]?)\s*/u);
  const emoji = emojiMatch ? emojiMatch[1] : null;
  const textWithoutEmoji = emoji ? raw.slice(emoji.length).trim() : raw;
  const text = textWithoutEmoji.replace(/\*\*/g, '').trim();
  const confirmed = raw.includes('✅');
  const tag = detectTag(raw);
  return { type: 'activity', time, text, emoji, tag, confirmed };
}

function parseTransportItem(raw) {
  // Format: emoji duration · route · cost
  const emojiMatch = raw.match(/^([\u{1F000}-\u{1FFFF}☀-➿\u{1F300}-\u{1FFFF}🚇🚌🚃🚶🚗⛴️🚡✈️🚄🚀][️]?)\s*/u);
  const icon = emojiMatch ? emojiMatch[1] : '🚌';
  const rest = emojiMatch ? raw.slice(icon.length).trim() : raw;

  // Extract bold duration like **45 min**
  const durationMatch = rest.match(/\*\*([^*]+)\*\*/);
  const duration = durationMatch ? durationMatch[1] : null;

  // Everything after duration
  const afterDuration = durationMatch ? rest.slice(rest.indexOf(durationMatch[0]) + durationMatch[0].length).replace(/^[\s·]+/, '') : rest;

  // Split at last · for cost
  const parts = afterDuration.split('·');
  const cost = parts.length > 1 ? parts[parts.length - 1].trim() : null;
  const route = parts.slice(0, cost ? parts.length - 1 : parts.length).join('·').trim();

  return { type: 'transport', icon, duration, route: route || rest, cost, raw };
}

// ── FLIGHTS ───────────────────────────────────────────────────────────────────

export function parseFlights(md) {
  const section = extractSection(md, '## ✅ Vols confirmés');
  if (!section) return [];
  const rows = parseTableRows(section);
  return rows.map(r => ({
    flight:    (r[0] || '').replace('✅', '').trim(),
    airline:   r[1] || '',
    from:      (r[2] || '').split('→')[0]?.trim() || '',
    to:        (r[2] || '').split('→')[1]?.trim() || '',
    date:      r[3] || '',
    departure: r[4] || '',
    arrival:   r[5] || '',
    confirmed: r[0]?.includes('✅'),
  }));
}

// ── INTER-CITY TRANSPORT ──────────────────────────────────────────────────────

export function parseInterCityTransport(md) {
  const section = extractSection(md, '## 🚄 TRANSPORTS INTER-VILLES');
  if (!section) return { routes: [], recap: [] };

  const routes = [];
  const tableBlocks = section.match(/\| Passagers[\s\S]+?(?=\n---|\n## |\n### |$)/g) ?? [];
  const headers = section.match(/### (.+)\n/g) ?? [];

  tableBlocks.forEach((block, idx) => {
    const rows = parseTableRows(block);
    const label = (headers[idx] || '').replace(/^###\s*/, '').trim();
    rows.forEach(r => {
      routes.push({ trajet: label, passagers: r[0], prix: r[1], sousTotal: r[2] });
    });
  });

  const recapSection = extractSection(md, '### Récapitulatif inter-villes');
  const recap = recapSection ? parseTableRows(recapSection).map(r => ({ trajet: r[0], montant: r[1] })) : [];
  return { routes, recap };
}

// ── LOCAL TRANSPORT ───────────────────────────────────────────────────────────

export function parseLocalTransport(md) {
  const section = extractSection(md, '## 🚌 TRANSPORT LOCAL PAR VILLE');
  if (!section) return [];

  const cityRe = /### (.+?) — .+?\n([\s\S]+?)(?=\n### |\n## |$)/g;
  const result = [];
  let m;
  while ((m = cityRe.exec(section)) !== null) {
    const city = m[1].trim();
    const block = m[2];
    const rows = parseTableRows(block).map(r => ({ jour: r[0], destinations: r[1], option: r[2], cout: r[3] }));
    const totalMatch = block.match(/\|\s*\*\*Total[^|]*\*\*[^|]*\|[^|]*\|[^|]*\|\s*\*\*([^*]+)\*\*/);
    result.push({ city, rows, total: totalMatch ? totalMatch[1].trim() : '' });
  }

  const grandSection = extractSection(md, '### Grand Total Transport Local');
  const grandTotal = grandSection ? parseTableRows(grandSection).map(r => ({ ville: r[0], montant: r[1] })) : [];
  return { cities: result, grandTotal };
}

// ── CHECKLIST ─────────────────────────────────────────────────────────────────

export function parseChecklist(md) {
  const section = extractSection(md, '## ⚠️ Réservations à faire');
  if (!section) return [];
  return parseTableRows(section).map(r => ({
    status:  r[0]?.trim() || '⚠️',
    name:    (r[1] || '').replace(/\*\*/g, '').trim(),
    date:    r[2] || '',
    details: (r[3] || '').replace(/\*\*/g, ''),
    urgent:  r[0]?.includes('⚠️'),
  })).filter(r => r.name);
}

// ── MAP LOCATIONS ─────────────────────────────────────────────────────────────

export function parseMapLocations(md) {
  const section = extractSection(md, '## 📍 Coordonnées');
  if (!section) return new Map();

  const rows = parseTableRows(section);
  const days = parseDays(md);
  const byNum = new Map(days.map(d => [d.num, d]));

  const byCity = new Map();

  for (const r of rows) {
    const name   = (r[0] || '').trim();
    const lat    = parseFloat(r[1]);
    const lng    = parseFloat(r[2]);
    const cityId = (r[3] || '').trim();
    const dayNum = r[4] === '—' ? null : parseInt(r[4], 10);
    const tag    = (r[5] || 'other').trim();

    if (!name || isNaN(lat) || isNaN(lng)) continue;

    const isLogement = tag === 'logement';
    let activityText = null;
    let transportText = null;
    let confirmed = false;
    let tip = null;

    if (!isLogement && dayNum && byNum.has(dayNum)) {
      const day = byNum.get(dayNum);
      tip = day.tip ?? null;
      // Fuzzy match activity — pick the item with the highest word-overlap score
      const nameWords = name.toLowerCase().split(/\s+/);
      let bestScore = 0;
      let bestIdx = -1;
      for (let i = 0; i < day.items.length; i++) {
        const item = day.items[i];
        if (item.type !== 'activity') continue;
        const combined = item.text.toLowerCase();
        const score = nameWords.filter(w => w.length > 3 && combined.includes(w)).length;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        const item = day.items[bestIdx];
        activityText = item.text;
        confirmed = item.confirmed;
        // Look for transport row immediately before
        if (bestIdx > 0 && day.items[bestIdx - 1].type === 'transport') {
          const t = day.items[bestIdx - 1];
          transportText = [t.icon, t.duration, t.route, t.cost].filter(Boolean).join(' · ');
        }
      }
    }

    const marker = { name, lat, lng, cityId, day: dayNum, tag, isLogement, activityText, transportText, confirmed, tip };

    if (!byCity.has(cityId)) byCity.set(cityId, []);
    byCity.get(cityId).push(marker);
  }

  return byCity;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function extractSection(md, header) {
  const idx = md.indexOf(header);
  if (idx === -1) return null;
  const after = md.slice(idx + header.length);
  // End at next H2 (but not H3)
  const end = after.search(/\n## /);
  return end === -1 ? after : after.slice(0, end);
}

function parseTableRows(text) {
  const lines = text.split('\n').filter(l => l.trim().startsWith('|'));
  const rows = [];
  let headerSkipped = false;
  for (const line of lines) {
    if (line.match(/^\|[\s\-|]+\|$/)) continue; // separator row
    const cells = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cells.length === 0) continue;
    if (!headerSkipped) {
      // Skip first row if all cells look like column headers (no numbers, ¥, ✅, ⚠️)
      const looksLikeHeader = cells.every(c => c && !c.includes('¥') && !c.includes('✅') && !c.includes('⚠️') && !c.includes('ℹ️') && !/\d/.test(c));
      if (looksLikeHeader) { headerSkipped = true; continue; }
      headerSkipped = true;
    }
    rows.push(cells);
  }
  return rows;
}
