/* Leaflet + GeoJSON + canvas wind field. Dynamic text uses textContent. */
(() => {
  const COLORS = {
    low: '#4d806a',
    moderate: '#c19b35',
    high: '#c96855',
    extreme: '#b63e55',
  };
  const LABELS = { low: 'Baixo', moderate: 'Moderado', high: 'Alto', extreme: 'Extremo' };
  const params = new URLSearchParams(location.search);
  const key = params.get('key');
  const qs = key ? `?key=${encodeURIComponent(key)}` : '';
  const map = L.map('map', { zoomControl: true, zoomSnap: 0.25 }).setView([39.6, -8.0], 6);
  const layers = new Map();
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const normalize = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  const fmtTime = (iso) =>
    new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function popupFor(r) {
    const box = el('div');
    box.append(el('b', '', r.name), el('div', '', `Risco ${r.score}/100 · ${LABELS[r.level]}`));
    const f = r.factors;
    box.append(el('div', '', `Avisos ${f.warning} · Vento ${f.wind} · Chuva ${f.rain}`));
    box.append(
      el(
        'div',
        '',
        r.hasWeather
          ? `Rajada máx. ${r.gustKmh} km/h · ${r.precipMmH} mm/h · ${r.precip24hMm} mm/24h`
          : 'Sem dados do modelo meteorológico',
      ),
    );
    for (const w of r.warnings) {
      box.append(el('div', '', `• ${w.type} (${w.level}) ${fmtTime(w.start)} → ${fmtTime(w.end)}`));
    }
    return box;
  }

  function styleFor(region) {
    return {
      color: region ? COLORS[region.level] : '#646b64',
      fillColor: region ? COLORS[region.level] : '#1a1c19',
      fillOpacity: region ? 0.42 + 0.25 * (region.score / 100) : 0.2,
      weight: 1,
    };
  }

  const districts = L.geoJSON(null, {
    style: () => styleFor(null),
    onEachFeature: (feature, layer) => {
      const name = normalize(feature.properties?.Distrito ?? '');
      layer.on('click', () => {
        const region = [...layers.entries()].find(([, candidate]) => candidate === layer)?.[0];
        const selected = currentRegions.find((item) => item.id === region);
        if (selected) layer.bindPopup(popupFor(selected)).openPopup();
      });
      layer.bindTooltip(feature.properties?.Distrito ?? '', { sticky: true });
      layer._districtName = name;
    },
  }).addTo(map);

  async function loadDistricts() {
    const response = await fetch('data/portugal-districts-simplified.geojson');
    if (!response.ok) throw new Error(`GeoJSON HTTP ${response.status}`);
    const geojson = await response.json();
    districts.addData(geojson);
    const bounds = districts.getBounds();
    map.fitBounds(bounds, { padding: [28, 28] });
    map.setMaxBounds(bounds.pad(0.12));
  }

  let currentRegions = [];
  function renderMap(regions) {
    currentRegions = regions;
    const byName = new Map(regions.map((region) => [normalize(region.name), region]));
    layers.clear();
    districts.eachLayer((layer) => {
      const region = byName.get(layer._districtName);
      if (region) {
        layers.set(region.id, layer);
        layer.setStyle(styleFor(region));
        layer.bindPopup(popupFor(region));
      }
    });
    windField.setRegions(regions);
  }

  function renderRanking(regions) {
    const ol = document.getElementById('ranking');
    ol.replaceChildren();
    for (const r of regions.slice(0, 8)) {
      const li = el('li', 'row');
      li.tabIndex = 0;
      const meta = r.warnings[0]
        ? `${r.warnings[0].type} · ${r.warnings[0].level}`
        : r.hasWeather
          ? `Rajada ${r.gustKmh} km/h · ${r.precipMmH} mm/h`
          : 'Sem dados';
      const badge = el('span', `badge lvl-${r.level}`, `${LABELS[r.level]} ${r.score}`);
      const bar = el('div', 'bar');
      const fill = el('i', `lvl-${r.level}`);
      fill.style.width = `${r.score}%`;
      bar.append(fill);
      li.append(el('span', 'name', r.name), badge, el('span', 'meta', meta), bar);
      const open = () => {
        const layer = layers.get(r.id);
        if (!layer) return;
        map.fitBounds(layer.getBounds(), { maxZoom: 8, duration: 0.5 });
        layer.openPopup();
      };
      li.addEventListener('click', open);
      li.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
      ol.append(li);
    }
  }

  function pill(text, cls) {
    return el('span', `pill ${cls}`, text);
  }

  function renderStatus(snapshot, connected) {
    const box = document.getElementById('status');
    box.replaceChildren(pill(connected ? 'Dados atualizados' : 'Sem ligação', connected ? 'ok' : 'bad'));
    if (!snapshot) return;
    const cls = (state) => (state === 'ok' ? 'ok' : state === 'pending' ? 'warn' : state === 'stale' ? 'warn' : 'bad');
    box.append(
      pill(`IPMA: ${snapshot.sources.ipma.state}`, cls(snapshot.sources.ipma.state)),
      pill(`Modelo: ${snapshot.sources.weather.state}`, cls(snapshot.sources.weather.state)),
      pill(`Atualizado ${new Date(snapshot.generatedAt).toLocaleTimeString('pt-PT')}`, ''),
    );
    if (snapshot.mode === 'mock') box.append(pill('Simulação', 'warn'));
  }

  function createWindField() {
    const canvas = document.createElement('canvas');
    canvas.className = 'wind-layer';
    map.getPanes().overlayPane.appendChild(canvas);
    const context = canvas.getContext('2d');
    const particles = [];
    let regions = [];
    let active = true;
    let width = 0;
    let height = 0;

    function resize() {
      const rect = map.getContainer().getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles.length = 0;
      for (let i = 0; i < 420; i += 1) {
        particles.push({ x: Math.random() * width, y: Math.random() * height, life: Math.random() });
      }
    }

    function setRegions(next) {
      regions = next;
      resize();
    }

    function frame() {
      if (!active) {
        context.clearRect(0, 0, width, height);
        requestAnimationFrame(frame);
        return;
      }
      const avgGust = regions.reduce((sum, region) => sum + (region.gustKmh ?? 35), 0) / Math.max(regions.length, 1);
      context.fillStyle = 'rgba(14, 15, 13, 0.11)';
      context.fillRect(0, 0, width, height);
      context.lineWidth = 0.8;
      for (const particle of particles) {
        const oldX = particle.x;
        const oldY = particle.y;
        const speed = 0.55 + avgGust / 170;
        particle.x += speed;
        particle.y += Math.sin((particle.x + particle.y) / 110) * 0.18 - speed * 0.16;
        particle.life -= 0.004;
        if (particle.x > width + 10 || particle.y < -10 || particle.life <= 0) {
          particle.x = -8;
          particle.y = Math.random() * height;
          particle.life = 0.6 + Math.random() * 0.4;
        }
        const alpha = Math.min(0.75, particle.life);
        context.strokeStyle = `rgba(184, 79, 109, ${alpha})`;
        context.beginPath();
        context.moveTo(oldX, oldY);
        context.lineTo(particle.x, particle.y);
        context.stroke();
      }
      requestAnimationFrame(frame);
    }

    map.on('resize move zoom', resize);
    resize();
    requestAnimationFrame(frame);
    return {
      setRegions,
      toggle() {
        active = !active;
        return active;
      },
    };
  }

  const windField = createWindField();
  document.getElementById('windToggle').addEventListener('click', (event) => {
    const active = windField.toggle();
    event.currentTarget.textContent = active ? 'Vento ativo' : 'Mostrar vento';
    event.currentTarget.classList.toggle('is-off', !active);
  });

  let last = null;
  function apply(snapshot) {
    last = snapshot;
    renderMap(snapshot.regions);
    renderRanking(snapshot.regions);
    renderStatus(snapshot, true);
    const storm = document.getElementById('storm');
    storm.classList.toggle('on', Boolean(snapshot.stormName));
    document.getElementById('stormName').textContent = snapshot.stormName ?? '';
  }

  async function refresh() {
    try {
      const response = await fetch(`api/risk${qs}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      apply(await response.json());
    } catch {
      renderStatus(last, false);
    }
  }

  void loadDistricts().catch(() => renderStatus(last, false));
  void refresh();
  window.setInterval(refresh, 60_000);
  renderStatus(null, false);
})();
