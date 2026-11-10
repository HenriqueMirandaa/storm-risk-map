/* Frontend sem build: Leaflet + polling. Todo o texto dinamico entra via textContent. */
(() => {
  const COLORS = { low: '#2e9e6a', moderate: '#e6c229', high: '#f08a24', extreme: '#e5484d' };
  const LABELS = { low: 'Baixo', moderate: 'Moderado', high: 'Alto', extreme: 'Extremo' };

  const params = new URLSearchParams(location.search);
  const key = params.get('key');
  const qs = key ? `?key=${encodeURIComponent(key)}` : '';

  const map = L.map('map', { zoomControl: true }).setView([39.6, -8.0], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const layers = new Map(); // id -> L.circle
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const fmtTime = (iso) =>
    new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function popupFor(r) {
    const box = el('div');
    box.append(el('b', '', r.name), el('div', '', `Risco ${r.score}/100 · ${LABELS[r.level]}`));
    const f = r.factors;
    box.append(el('div', '', `Avisos ${f.warning} · Vento ${f.wind} · Chuva ${f.rain}`));
    if (r.hasWeather) {
      box.append(el('div', '', `Rajada máx. ${r.gustKmh} km/h · ${r.precipMmH} mm/h · ${r.precip24hMm} mm/24h`));
    } else {
      box.append(el('div', '', 'Sem dados do modelo meteorológico'));
    }
    for (const w of r.warnings) {
      box.append(el('div', '', `• ${w.type} (${w.level}) ${fmtTime(w.start)} → ${fmtTime(w.end)}`));
    }
    return box;
  }

  function renderMap(regions) {
    for (const r of regions) {
      const style = {
        color: COLORS[r.level],
        fillColor: COLORS[r.level],
        fillOpacity: 0.16 + 0.34 * (r.score / 100),
        weight: r.level === 'extreme' ? 2 : 1,
      };
      const radius = 9000 + r.score * 650; // metros
      let c = layers.get(r.id);
      if (!c) {
        c = L.circle([r.lat, r.lon], { ...style, radius }).addTo(map);
        layers.set(r.id, c);
      } else {
        c.setStyle(style);
        c.setRadius(radius);
      }
      c.unbindTooltip().bindTooltip(`${r.name}: ${r.score}`, { direction: 'top' });
      c.unbindPopup().bindPopup(popupFor(r));
    }
  }

  function renderRanking(regions) {
    const ol = document.getElementById('ranking');
    ol.replaceChildren();
    for (const r of regions.slice(0, 8)) {
      const li = el('li', 'row');
      li.tabIndex = 0;
      const meta = r.warnings[0]
        ? `${r.warnings[0].type} · ${r.warnings[0].level}`
        : r.hasWeather ? `Rajada ${r.gustKmh} km/h · ${r.precipMmH} mm/h` : 'Sem dados';
      const badge = el('span', `badge lvl-${r.level}`, `${LABELS[r.level]} ${r.score}`);
      const bar = el('div', 'bar');
      const fill = el('i', `lvl-${r.level}`);
      fill.style.width = `${r.score}%`;
      bar.append(fill);
      li.append(el('span', 'name', r.name), badge, el('span', 'meta', meta), bar);
      const open = () => {
        map.flyTo([r.lat, r.lon], 8, { duration: 0.8 });
        layers.get(r.id)?.openPopup();
      };
      li.addEventListener('click', open);
      li.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));
      ol.append(li);
    }
  }

  function pill(text, cls) {
    return el('span', `pill ${cls}`, text);
  }

  function renderStatus(s, connected) {
    const box = document.getElementById('status');
    box.replaceChildren();
    box.append(pill(connected ? 'Dados atualizados' : 'Sem ligação', connected ? 'ok' : 'bad'));
    if (s) {
      const cls = (st) => (st === 'ok' ? 'ok' : st === 'pending' ? 'warn' : st === 'stale' ? 'warn' : 'bad');
      box.append(
        pill(`IPMA: ${s.sources.ipma.state}`, cls(s.sources.ipma.state)),
        pill(`Modelo: ${s.sources.weather.state}`, cls(s.sources.weather.state)),
        pill(`Atualizado ${new Date(s.generatedAt).toLocaleTimeString('pt-PT')}`, ''),
      );
      if (s.mode === 'mock') box.append(pill('SIMULAÇÃO', 'warn'));
    }
  }

  let last = null;
  function apply(s) {
    last = s;
    renderMap(s.regions);
    renderRanking(s.regions);
    renderStatus(s, true);
    const storm = document.getElementById('storm');
    storm.classList.toggle('on', Boolean(s.stormName));
    document.getElementById('stormName').textContent = s.stormName ?? '';
  }

  async function refresh() {
    try {
      const res = await fetch(`api/risk${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      apply(await res.json());
    } catch {
      renderStatus(last, false);
    }
  }

  void refresh();
  window.setInterval(refresh, 60_000);
  renderStatus(null, false);
})();
