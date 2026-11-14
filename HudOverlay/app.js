(() => {
  const MARS_RADIUS_KM = 3389.5;
  const BASE_WALK_SPEED_KMH = 2.6;
  const MAX_ROUND_TRIP_MIN = 60;
  const NAV_STORAGE_KEY = 'mars_eva_nav_state_v1';
  const NAV_CHANNEL_NAME = 'mars_eva_sync_channel';
  const WAYPOINT_CHANNEL_NAME = 'mars-waypoint-sync';
  const PREFERENCES_KEY = 'mars_visor_hud_preferences_v1';
  const DEFAULT_DISPLAY_SETTINGS = {
    map: true,
    route: true,
    sector: true,
    oxygen: true,
    communication: true
  };
  const BACKGROUNDS = {
    'camera-1': '../test/resouce/PIA05108~small.jpg',
    'camera-2': '../test/resouce/PIA11132~orig.jpg'
  };
  const SECTORS = [
    {
      name: 'GALE CRATER - AEOLIS PALUS',
      coords: 'LAT: -5.4453° S / LON: 137.8414° E | ELEV: -4,501m'
    },
    {
      name: 'MOUNT SHARP FOOTHILLS',
      coords: 'LAT: -5.0812° S / LON: 137.8520° E | ELEV: -3,820m'
    },
    {
      name: 'VERA RUBIN RIDGE',
      coords: 'LAT: -5.4710° S / LON: 137.8190° E | ELEV: -4,150m'
    },
    {
      name: 'GEDIZ VALLIS CHANNEL',
      coords: 'LAT: -5.4920° S / LON: 137.8305° E | ELEV: -3,940m'
    }
  ];

  const state = {
    oxygen: 85,
    isOnline: true,
    signalStrength: 92,
    sectorIndex: 0,
    waypoints: {
      a: { lat: 18.4447, lng: 77.4508 },
      b: { lat: 18.4525, lng: 77.465 }
    }
  };

  const hudStage = document.getElementById('hud-stage');
  const mapSideToggle = document.getElementById('map-side-toggle');
  const backgroundSelect = document.getElementById('background-select');
  const backgroundImage = document.getElementById('camera-background');
  const statusElement = document.getElementById('hud-status');
  const controlToggle = document.getElementById('hud-control-toggle');
  const controlPanel = document.getElementById('hud-control-panel');
  const transparencyRange = document.getElementById('transparency-range');
  const transparencyValue = document.getElementById('transparency-value');
  const displayElements = {
    map: document.getElementById('map-frame'),
    route: document.getElementById('route-card'),
    sector: document.getElementById('sector-card'),
    oxygen: document.getElementById('oxygen-card'),
    communication: document.getElementById('comm-card')
  };
  const displayControls = {
    map: document.getElementById('toggle-map'),
    route: document.getElementById('toggle-route'),
    sector: document.getElementById('toggle-sector'),
    oxygen: document.getElementById('toggle-oxygen'),
    communication: document.getElementById('toggle-communication')
  };
  let preferences = {
    mapRight: false,
    background: 'camera-1',
    transparency: 45,
    display: { ...DEFAULT_DISPLAY_SETTINGS }
  };
  const map = L.map('mars-map', {
    attributionControl: true,
    boxZoom: false,
    doubleClickZoom: false,
    dragging: false,
    keyboard: false,
    scrollWheelZoom: false,
    touchZoom: false,
    zoomControl: false
  });

  const marsTiles = L.tileLayer(
    'https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-2/all/{z}/{x}/{y}.png',
    {
      attribution: 'NASA / USGS / OpenPlanetaryMap',
      maxZoom: 18,
      tms: false
    }
  );
  const FallbackMarsGrid = L.GridLayer.extend({
    createTile: function (coords) {
      const tile = document.createElement('canvas');
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const context = tile.getContext('2d');
      context.fillStyle = '#5c3428';
      context.fillRect(0, 0, size.x, size.y);

      const seed = (coords.x * 73856093) ^ (coords.y * 19349663) ^ (coords.z * 83492791);
      let value = Math.abs(seed) || 1;
      const random = () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
      };

      for (let i = 0; i < 45; i++) {
        context.beginPath();
        context.arc(random() * size.x, random() * size.y, 4 + random() * 35, 0, Math.PI * 2);
        context.fillStyle = random() > 0.5
          ? 'rgba(130, 75, 55, 0.25)'
          : 'rgba(45, 22, 17, 0.28)';
        context.fill();
      }

      for (let i = 0; i < 5; i++) {
        const x = random() * size.x;
        const y = random() * size.y;
        const radius = 12 + random() * 42;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.strokeStyle = 'rgba(215, 145, 110, 0.25)';
        context.lineWidth = 2;
        context.stroke();
      }

      context.strokeStyle = 'rgba(255, 210, 180, 0.12)';
      context.strokeRect(0, 0, size.x, size.y);
      return tile;
    }
  });
  let fallbackAdded = false;
  marsTiles.on('tileerror', () => {
    if (fallbackAdded) return;
    new FallbackMarsGrid().addTo(map);
    fallbackAdded = true;
  });
  marsTiles.addTo(map);

  const MarsReliefLayer = L.GridLayer.extend({
    createTile: function (coords) {
      const tile = document.createElement('canvas');
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const context = tile.getContext('2d');
      const seed = (coords.x * 73856093) ^ (coords.y * 19349663) ^ (coords.z * 83492791);
      let value = Math.abs(seed) || 1;
      const random = () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
      };

      for (let i = 0; i < 34; i++) {
        context.beginPath();
        context.arc(random() * size.x, random() * size.y, 3 + random() * 18, 0, Math.PI * 2);
        context.fillStyle = 'rgba(24, 12, 9, 0.13)';
        context.fill();
      }

      for (let i = 0; i < 4; i++) {
        const x = random() * size.x;
        const y = random() * size.y;
        const radius = 16 + random() * 45;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.strokeStyle = 'rgba(242, 190, 152, 0.32)';
        context.lineWidth = 2;
        context.stroke();
        context.beginPath();
        context.arc(x + 2, y + 2, radius * 0.88, 0, Math.PI * 2);
        context.strokeStyle = 'rgba(35, 18, 13, 0.3)';
        context.lineWidth = 2;
        context.stroke();
      }

      return tile;
    }
  });
  new MarsReliefLayer({ opacity: 0.75, zIndex: 300 }).addTo(map);

  const iconA = L.divIcon({
    className: 'waypoint-div-icon',
    html: '<span class="map-pin map-pin-a">A</span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
  const iconB = L.divIcon({
    className: 'waypoint-div-icon',
    html: '<span class="map-pin map-pin-b">B</span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
  const markerA = L.marker([state.waypoints.a.lat, state.waypoints.a.lng], { icon: iconA }).addTo(map);
  const markerB = L.marker([state.waypoints.b.lat, state.waypoints.b.lng], { icon: iconB }).addTo(map);
  let routeLine = null;
  let routeBounds = null;

  function setStatus(message, isError) {
    statusElement.textContent = message;
    statusElement.classList.toggle('error', isError);
  }

  function savePreferences() {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch (error) {
      setStatus(`表示設定を保存できませんでした: ${error.message}`, true);
    }
  }

  function applyDisplayPreferences() {
    Object.keys(displayElements).forEach(key => {
      const visible = preferences.display[key] !== false;
      displayControls[key].checked = visible;
      displayElements[key].hidden = !visible;
    });

    const transparency = Math.max(25, Math.min(70, Number(preferences.transparency) || 45));
    preferences.transparency = transparency;
    transparencyRange.value = transparency;
    transparencyValue.textContent = `${transparency}%`;
    document.documentElement.style.setProperty('--panel-opacity', (1 - transparency / 100).toFixed(2));
  }

  function isWaypoint(value) {
    return value &&
      Number.isFinite(value.lat) &&
      value.lat >= -90 &&
      value.lat <= 90 &&
      Number.isFinite(value.lng) &&
      value.lng >= -180 &&
      value.lng <= 180;
  }

  function formatCoordinate(lat, lng) {
    const northSouth = lat >= 0 ? 'N' : 'S';
    const eastWest = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${northSouth}, ${Math.abs(lng).toFixed(4)}°${eastWest}`;
  }

  function marsDistanceKm(lat1, lng1, lat2, lng2) {
    const toRad = degrees => (degrees * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * MARS_RADIUS_KM * Math.asin(Math.sqrt(a));
  }

  function sampleTerrain(lat, lng) {
    const s1 = Math.sin(lat * 260) * Math.cos(lng * 260);
    const s2 = Math.sin((lat + lng) * 520);
    const s3 = Math.cos(lat * 910 - lng * 740);
    const slopeDeg = Math.abs(s1 * 14 + s2 * 9 + s3 * 5);
    const sandRisk = Math.max(0, Math.sin(lat * 340 - 1.2) * Math.cos(lng * 310 + 0.8));
    return { slopeDeg, sandRisk };
  }

  function findSafeRoute(start, end) {
    const gridSize = 28;
    const distance = marsDistanceKm(start.lat, start.lng, end.lat, end.lng);
    const margin = Math.max(0.008, (distance / MARS_RADIUS_KM) * (180 / Math.PI) * 0.65);
    const minLat = Math.min(start.lat, end.lat) - margin;
    const maxLat = Math.max(start.lat, end.lat) + margin;
    const minLng = Math.min(start.lng, end.lng) - margin;
    const maxLng = Math.max(start.lng, end.lng) + margin;
    const latStep = (maxLat - minLat) / (gridSize - 1);
    const lngStep = (maxLng - minLng) / (gridSize - 1);
    const toNode = point => ({
      r: Math.max(0, Math.min(gridSize - 1, Math.round((point.lat - minLat) / latStep))),
      c: Math.max(0, Math.min(gridSize - 1, Math.round((point.lng - minLng) / lngStep)))
    });
    const toLatLng = (r, c) => ({
      lat: minLat + r * latStep,
      lng: minLng + c * lngStep
    });
    const startNode = toNode(start);
    const endNode = toNode(end);
    const key = (r, c) => `${r},${c}`;
    const startKey = key(startNode.r, startNode.c);
    const openSet = new Map([
      [startKey, {
        r: startNode.r,
        c: startNode.c,
        f: Math.hypot(endNode.r - startNode.r, endNode.c - startNode.c)
      }]
    ]);
    const cameFrom = new Map();
    const gScore = new Map([[startKey, 0]]);
    const directions = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];
    let bestNode = startNode;
    let minHeuristic = Infinity;

    while (openSet.size > 0) {
      let current = null;
      for (const node of openSet.values()) {
        if (!current || node.f < current.f) current = node;
      }

      const currentKey = key(current.r, current.c);
      if (current.r === endNode.r && current.c === endNode.c) {
        bestNode = current;
        break;
      }

      const currentHeuristic = Math.hypot(endNode.r - current.r, endNode.c - current.c);
      if (currentHeuristic < minHeuristic) {
        minHeuristic = currentHeuristic;
        bestNode = current;
      }
      openSet.delete(currentKey);

      for (const [dr, dc] of directions) {
        const nr = current.r + dr;
        const nc = current.c + dc;
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;

        const nextKey = key(nr, nc);
        const stepDistance = Math.hypot(dr, dc);
        const location = toLatLng(nr, nc);
        const terrain = sampleTerrain(location.lat, location.lng);
        const slopePenalty = terrain.slopeDeg > 14
          ? Math.pow(terrain.slopeDeg - 10, 2.3)
          : terrain.slopeDeg * 0.25;
        const sandPenalty = terrain.sandRisk > 0.65
          ? terrain.sandRisk * 18
          : terrain.sandRisk * 2;
        const nextScore = gScore.get(currentKey) + stepDistance + slopePenalty + sandPenalty;

        if (!gScore.has(nextKey) || nextScore < gScore.get(nextKey)) {
          cameFrom.set(nextKey, current);
          gScore.set(nextKey, nextScore);
          const heuristic = Math.hypot(endNode.r - nr, endNode.c - nc);
          openSet.set(nextKey, { r: nr, c: nc, f: nextScore + heuristic });
        }
      }
    }

    const path = [];
    if (startNode.r === endNode.r && startNode.c === endNode.c) {
      path.push([start.lat, start.lng], [end.lat, end.lng]);
    } else {
      let current = bestNode;
      while (current) {
        const point = toLatLng(current.r, current.c);
        path.unshift([point.lat, point.lng]);
        current = cameFrom.get(key(current.r, current.c));
      }
      path[0] = [start.lat, start.lng];
      path[path.length - 1] = [end.lat, end.lng];
    }

    let totalKm = 0;
    let totalMinutesOneWay = 0;
    for (let i = 1; i < path.length; i++) {
      const [lat, lng] = path[i];
      const segmentKm = marsDistanceKm(path[i - 1][0], path[i - 1][1], lat, lng);
      const terrain = sampleTerrain(lat, lng);
      const speedFactor = Math.max(0.45, 1 - terrain.slopeDeg / 45 - terrain.sandRisk * 0.25);
      totalKm += segmentKm;
      totalMinutesOneWay += (segmentKm / (BASE_WALK_SPEED_KMH * speedFactor)) * 60;
    }

    return {
      path,
      distanceKm: totalKm,
      roundTripMin: Math.round(totalMinutesOneWay * 2)
    };
  }

  function renderRoute() {
    const { a, b } = state.waypoints;
    const route = findSafeRoute(a, b);
    markerA.setLatLng([a.lat, a.lng]);
    markerB.setLatLng([b.lat, b.lng]);

    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(route.path, {
      color: '#8df6c1',
      opacity: 0.95,
      weight: 4,
      dashArray: '9, 6'
    }).addTo(map);

    routeBounds = L.latLngBounds(route.path);
    map.fitBounds(routeBounds, { maxZoom: 14, padding: [28, 28] });

    const withinLimit = route.roundTripMin <= MAX_ROUND_TRIP_MIN;
    document.getElementById('route-summary').textContent = withinLimit
      ? '往復60分以内のシミュレーション経路'
      : '往復60分を超過するシミュレーション経路';
    document.getElementById('route-metrics').textContent =
      `${route.distanceKm.toFixed(2)} km　/　往復 ${route.roundTripMin} 分`;
    document.getElementById('route-summary').classList.toggle('route-warning', !withinLimit);
    document.getElementById('waypoint-a').textContent = formatCoordinate(a.lat, a.lng);
    document.getElementById('waypoint-b').textContent = formatCoordinate(b.lat, b.lng);
  }

  function renderVitals() {
    const oxygen = Math.max(0, Math.min(100, Number(state.oxygen)));
    const oxygenPercent = Number.isFinite(oxygen) ? oxygen : 0;
    const remainingMinutes = Math.floor((oxygenPercent / 100) * 300);
    const hours = String(Math.floor(remainingMinutes / 60)).padStart(2, '0');
    const minutes = String(remainingMinutes % 60).padStart(2, '0');
    const oxygenCard = document.querySelector('.oxygen-card');
    const commCard = document.querySelector('.comm-card');

    document.getElementById('oxygen-value').textContent = `${oxygenPercent}%`;
    document.getElementById('oxygen-bar').style.width = `${oxygenPercent}%`;
    document.getElementById('oxygen-time').textContent = `${hours}:${minutes} 残`;
    oxygenCard.classList.toggle('is-low', oxygenPercent <= 20);

    document.getElementById('comm-value').textContent = state.isOnline ? 'ONLINE' : 'OFFLINE';
    document.getElementById('comm-detail').textContent = state.isOnline
      ? `RELAY-01 // ${state.signalStrength}%`
      : 'NO SIGNAL // LOCAL MODE';
    commCard.classList.toggle('is-offline', !state.isOnline);

    const sector = SECTORS[state.sectorIndex] || SECTORS[0];
    document.getElementById('sector-name').textContent = sector.name;
    document.getElementById('sector-coords').textContent = sector.coords;
  }

  function updateNavState(nextState) {
    if (!nextState || typeof nextState !== 'object') return;
    if (Number.isFinite(nextState.oxygen)) state.oxygen = nextState.oxygen;
    if (typeof nextState.isOnline === 'boolean') state.isOnline = nextState.isOnline;
    if (Number.isFinite(nextState.signalStrength)) state.signalStrength = nextState.signalStrength;
    if (Number.isInteger(nextState.sectorIndex)) state.sectorIndex = nextState.sectorIndex;
    renderVitals();
  }

  function setMapSide(isRight) {
    hudStage.classList.toggle('map-right', isRight);
    mapSideToggle.textContent = isRight ? '地図を左側へ' : '地図を右側へ';
    preferences.mapRight = isRight;
    savePreferences();
    window.setTimeout(() => map.invalidateSize(), 100);
  }

  async function loadWaypoints() {
    setStatus('data.jsonから地点を読み込み中...', false);
    try {
      const response = await fetch('/api/waypoints');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'A/B地点を取得できませんでした');
      if (!result.waypoints || !isWaypoint(result.waypoints.a) || !isWaypoint(result.waypoints.b)) {
        throw new Error('data.jsonのwaypoints形式が正しくありません');
      }
      state.waypoints = result.waypoints;
      renderRoute();
      setStatus('A/B地点を同期中です', false);
    } catch (error) {
      setStatus(`座標の取得に失敗しました: ${error.message}（node server.jsで起動してください）`, true);
    }
  }

  document.getElementById('map-side-toggle').addEventListener('click', () => {
    setMapSide(!hudStage.classList.contains('map-right'));
  });

  controlToggle.addEventListener('click', () => {
    controlPanel.hidden = !controlPanel.hidden;
    controlToggle.setAttribute('aria-expanded', String(!controlPanel.hidden));
  });

  document.getElementById('hud-control-close').addEventListener('click', () => {
    controlPanel.hidden = true;
    controlToggle.setAttribute('aria-expanded', 'false');
    controlToggle.focus();
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || controlPanel.hidden) return;
    controlPanel.hidden = true;
    controlToggle.setAttribute('aria-expanded', 'false');
    controlToggle.focus();
  });

  Object.keys(displayElements).forEach(key => {
    displayControls[key].addEventListener('change', () => {
      preferences.display[key] = displayControls[key].checked;
      displayElements[key].hidden = !displayControls[key].checked;
      savePreferences();
      if (key === 'map' && displayControls[key].checked) {
        window.setTimeout(() => map.invalidateSize(), 100);
      }
    });
  });

  transparencyRange.addEventListener('input', () => {
    preferences.transparency = Number(transparencyRange.value);
    applyDisplayPreferences();
  });
  transparencyRange.addEventListener('change', savePreferences);

  backgroundSelect.addEventListener('change', () => {
    backgroundImage.src = BACKGROUNDS[backgroundSelect.value];
    preferences.background = backgroundSelect.value;
    savePreferences();
  });

  try {
    const savedPreferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    preferences = {
      ...preferences,
      ...savedPreferences,
      display: { ...DEFAULT_DISPLAY_SETTINGS, ...(savedPreferences.display || {}) }
    };
  } catch (error) {
    setStatus(`表示設定を読み込めませんでした: ${error.message}`, true);
  }
  if (!BACKGROUNDS[preferences.background]) preferences.background = 'camera-1';
  backgroundSelect.value = preferences.background;
  backgroundImage.src = BACKGROUNDS[preferences.background];
  setMapSide(preferences.mapRight === true);
  applyDisplayPreferences();

  try {
    const savedState = localStorage.getItem(NAV_STORAGE_KEY);
    if (savedState) updateNavState(JSON.parse(savedState));
  } catch (error) {
    setStatus(`HUD状態を読み込めませんでした: ${error.message}`, true);
  }

  const navChannel = new BroadcastChannel(NAV_CHANNEL_NAME);
  navChannel.onmessage = event => updateNavState(event.data);

  const waypointChannel = new BroadcastChannel(WAYPOINT_CHANNEL_NAME);
  waypointChannel.onmessage = event => {
    const message = event.data;
    if (!message || message.type !== 'waypoints-updated' || !message.waypoints) return;
    if (!isWaypoint(message.waypoints.a) || !isWaypoint(message.waypoints.b)) return;
    state.waypoints = message.waypoints;
    renderRoute();
    setStatus('地図から最新のA/B地点を受信しました', false);
  };

  window.addEventListener('storage', event => {
    if (event.key !== NAV_STORAGE_KEY || !event.newValue) return;
    try {
      updateNavState(JSON.parse(event.newValue));
    } catch (error) {
      setStatus(`HUD状態を読み込めませんでした: ${error.message}`, true);
    }
  });

  window.addEventListener('resize', () => map.invalidateSize());

  renderVitals();
  renderRoute();
  loadWaypoints();
})();
