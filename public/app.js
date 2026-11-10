/* SVG map: no map library, only the real district geometry and live API data. */
(() => {
  const COLORS = { low: '#4d806a', moderate: '#c19b35', high: '#c96855', extreme: '#c7465d' };
  const LABELS = { low: 'Baixo', moderate: 'Moderado', high: 'Alto', extreme: 'Extremo' };
  const CITIES = {
    AVR: 'Aveiro, Ílhavo e Ovar',
    BJA: 'Beja, Moura e Serpa',
    BRG: 'Braga, Guimarães e Barcelos',
    BGC: 'Bragança, Mirandela e Macedo de Cavaleiros',
    CBO: 'Castelo Branco, Covilhã e Fundão',
    CBR: 'Coimbra, Figueira da Foz e Cantanhede',
    EVR: 'Évora, Estremoz e Montemor-o-Novo',
    FAR: 'Faro, Lagos e Portimão',
    GDA: 'Guarda, Seia e Gouveia',
    LRA: 'Leiria, Marinha Grande e Pombal',
    LSB: 'Lisboa, Sintra e Cascais',
    PTG: 'Portalegre, Elvas e Campo Maior',
    PTO: 'Porto, Matosinhos e Vila Nova de Gaia',
    STM: 'Santarém, Tomar e Abrantes',
    STB: 'Setúbal, Almada e Sesimbra',
    VCT: 'Viana do Castelo, Ponte de Lima e Valença',
    VRL: 'Vila Real, Chaves e Peso da Régua',
    VIS: 'Viseu, Lamego e Tondela',
  };
  const params = new URLSearchParams(location.search);
  const key = params.get('key');
  const qs = key ? `?key=${encodeURIComponent(key)}` : '';
  const svg = document.getElementById('map');
  const layers = new Map();
  const el = (tag, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const html = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  const normalize = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  let features = [];
  let latestRegions = [];
  let geoBounds = [0, 0, 0, 0];
  let fullView = { x: 0, y: 0, w: 1000, h: 900 };
  let currentView = { ...fullView };
  let animationId = 0;
  let panStart = null;
  let wasDragged = false;

  function allCoordinates(geometry) {
    return geometry.coordinates.flat(geometry.type === 'Polygon' ? 1 : 2);
  }

  function project([lon, lat]) {
    const [minLon, minLat, maxLon, maxLat] = geoBounds;
    return [
      40 + ((lon - minLon) / (maxLon - minLon)) * 920,
      40 + ((maxLat - lat) / (maxLat - minLat)) * 820,
    ];
  }

  function ringPath(ring) {
    return `${ring.map((coord, index) => {
      const [x, y] = project(coord);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ')} Z`;
  }

  function geometryPath(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.flatMap((polygon) => polygon.map(ringPath)).join(' ');
  }

  function featureBox(feature) {
    const points = allCoordinates(feature.geometry).map(project);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  function setView(view) {
    currentView = view;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  function animateView(target) {
    const start = { ...currentView };
    const started = performance.now();
    const id = ++animationId;
    const frame = (now) => {
      if (id !== animationId) return;
      const progress = Math.min(1, (now - started) / 420);
      const eased = 1 - (1 - progress) ** 3;
      setView(Object.fromEntries(Object.keys(start).map((key) => [key, start[key] + (target[key] - start[key]) * eased])));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function zoomBy(factor) {
    const w = Math.min(fullView.w, currentView.w * factor);
    const h = Math.min(fullView.h, currentView.h * factor);
    animateView({ x: currentView.x + (currentView.w - w) / 2, y: currentView.y + (currentView.h - h) / 2, w, h });
  }

  function updateDetail(region) {
    document.getElementById('detailName').textContent = region.name;
    document.getElementById('detailScore').textContent = `${region.score}/100 · ${LABELS[region.level]}`;
    const weather = document.getElementById('detailWeather');
    weather.replaceChildren();
    const values = region.hasWeather
      ? [`Rajada máxima: ${region.gustKmh} km/h`, `Chuva horária: ${region.precipMmH} mm`, `Chuva em 24 horas: ${region.precip24hMm} mm`]
      : ['Dados meteorológicos indisponíveis'];
    for (const value of values) weather.append(html('div', value));
    const cities = document.getElementById('detailCities');
    cities.replaceChildren(html('strong', 'Principais cidades'), html('span', CITIES[region.id] ?? region.name));
    document.getElementById('districtDetail').classList.add('is-visible');
  }

  function renderMap(regions) {
    latestRegions = regions;
    if (features.length === 0) return;
    const byName = new Map(regions.map((region) => [normalize(region.name), region]));
    for (const feature of features) {
      const region = byName.get(normalize(feature.properties?.Distrito ?? ''));
      const path = layers.get(feature);
      if (!path || !region) continue;
      path.setAttribute('fill', COLORS[region.level]);
      path.setAttribute('fill-opacity', String(0.5 + region.score / 400));
      path.replaceChildren(el('title', `${region.name} — ${region.score}/100`));
      path.onclick = () => {
        if (wasDragged) return;
        const box = featureBox(feature);
        const padding = 28;
        updateDetail(region);
        animateView({ x: box.x - padding, y: box.y - padding, w: box.w + padding * 2, h: box.h + padding * 2 });
      };
    }
  }

  function renderFeatures(geojson) {
    features = geojson.features;
    const coords = features.flatMap((feature) => allCoordinates(feature.geometry));
    const lons = coords.map(([lon]) => lon);
    const lats = coords.map(([, lat]) => lat);
    geoBounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    for (const feature of features) {
      const path = el('path');
      path.classList.add('district');
      path.setAttribute('d', geometryPath(feature.geometry));
      path.setAttribute('fill', '#242720');
      layers.set(feature, path);
      svg.append(path);
    }
    renderMap(latestRegions);
  }

  async function loadDistricts() {
    const response = await fetch('data/portugal-districts-simplified.geojson');
    if (!response.ok) throw new Error(`GeoJSON HTTP ${response.status}`);
    renderFeatures(await response.json());
  }

  function apply(snapshot) {
    renderMap(snapshot.regions);
  }

  async function refresh() {
    try {
      const response = await fetch(`api/risk${qs}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      apply(await response.json());
    } catch {
      // The map keeps the last valid snapshot while the next three-second poll retries.
    }
  }

  document.getElementById('panelToggle').addEventListener('click', () => {
    document.body.classList.add('panel-collapsed');
    document.getElementById('menuToggle').textContent = 'Abrir menu';
    document.getElementById('menuToggle').setAttribute('aria-expanded', 'false');
  });
  document.getElementById('menuToggle').addEventListener('click', (event) => {
    const open = document.body.classList.toggle('panel-collapsed') === false;
    event.currentTarget.textContent = open ? 'Fechar menu' : 'Abrir menu';
    event.currentTarget.setAttribute('aria-expanded', String(open));
  });
  document.getElementById('zoomIn').addEventListener('click', () => zoomBy(0.8));
  document.getElementById('zoomOut').addEventListener('click', () => zoomBy(1.25));
  document.getElementById('zoomReset').addEventListener('click', () => animateView(fullView));
  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    panStart = { x: event.clientX, y: event.clientY, view: { ...currentView } };
    wasDragged = false;
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!panStart) return;
    const distance = Math.hypot(event.clientX - panStart.x, event.clientY - panStart.y);
    if (distance > 4) wasDragged = true;
    if (!wasDragged) return;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / currentView.w, rect.height / currentView.h);
    setView({
      ...currentView,
      x: panStart.view.x - (event.clientX - panStart.x) / scale,
      y: panStart.view.y - (event.clientY - panStart.y) / scale,
    });
  });
  const endPan = (event) => {
    if (!panStart) return;
    panStart = null;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  };
  svg.addEventListener('pointerup', endPan);
  svg.addEventListener('pointercancel', endPan);
  document.getElementById('detailClose').addEventListener('click', () => {
    document.getElementById('districtDetail').classList.remove('is-visible');
    animateView(fullView);
  });

  void loadDistricts();
  void refresh();
  window.setInterval(refresh, 3_000);
})();
