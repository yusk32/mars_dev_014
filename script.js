(() => {
  // 火星半径 (km) - Haversine距離計算に使用
  const MARS_RADIUS_KM = 3389.5;
  // 宇宙服（EVA）での平坦地基準歩行速度 (km/h)
  const BASE_WALK_SPEED_KMH = 2.6;
  // 制限時間：往復60分（1時間）
  const MAX_ROUND_TRIP_MIN = 60;

  // 火星の主要探査エリアプリセット
  const PRESETS = {
    jezero:  { lat: 18.4447, lng: 77.4508, zoom: 14 },
    gale:    { lat: -5.4000, lng: 137.8000, zoom: 14 },
    olympus: { lat: 18.6500, lng: -133.8000, zoom: 13 },
    valles:  { lat: -13.9000, lng: -59.2000, zoom: 13 }
  };

  let pointA = { lat: 18.4447, lng: 77.4508 };
  let pointB = { lat: 18.4525, lng: 77.4650 };
  let activeMode = 'safe'; // 'safe' | 'science'
  let waypointsLoaded = false;
  const waypointChannel = new BroadcastChannel('mars-waypoint-sync');

  // 1. Leafletマップ初期化
  const map = L.map('marsMap', {
    center: [pointA.lat, pointA.lng],
    zoom: 14,
    zoomControl: true
  });

  // NASA / USGS / OpenPlanetaryMap 火星ベースマップタイル
  const marsTileLayer = L.tileLayer(
    'https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-2/all/{z}/{x}/{y}.png',
    {
      attribution: 'NASA / USGS / OpenPlanetaryMap',
      maxZoom: 18,
      tms: false
    }
  );

  // タイル読み込み失敗時（オフラインやCORS制限時）用の高精細火星サーフェス描画フォールバック
  const FallbackMarsGrid = L.GridLayer.extend({
    createTile: function (coords) {
      const tile = document.createElement('canvas');
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const ctx = tile.getContext('2d');

      // 火星の赤褐色ベース
      ctx.fillStyle = '#5c3428';
      ctx.fillRect(0, 0, size.x, size.y);

      // 座標に応じた決定論的擬似乱数でクレーターと地形陰影を描画
      const seed = (coords.x * 73856093) ^ (coords.y * 19349663) ^ (coords.z * 83492791);
      let s = Math.abs(seed) || 1;
      const rand = () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };

      // 微細な地形テクスチャ
      for (let i = 0; i < 45; i++) {
        const x = rand() * size.x;
        const y = rand() * size.y;
        const r = 4 + rand() * 35;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = rand() > 0.5 ? 'rgba(130, 75, 55, 0.25)' : 'rgba(45, 22, 17, 0.28)';
        ctx.fill();
      }

      // クレーターリング
      for (let i = 0; i < 5; i++) {
        const cx = rand() * size.x;
        const cy = rand() * size.y;
        const cr = 12 + rand() * 42;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(215, 145, 110, 0.22)';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx + 2, cy + 2, cr * 0.9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(25, 12, 10, 0.35)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 経緯度グリッド線
      ctx.strokeStyle = 'rgba(255, 210, 180, 0.08)';
      ctx.strokeRect(0, 0, size.x, size.y);
      return tile;
    }
  });

  // タイルエラーが起きた場合は自動的にフォールバック表示へ切り替え
  let fallbackAdded = false;
  marsTileLayer.on('tileerror', () => {
    if (!fallbackAdded) {
      new FallbackMarsGrid().addTo(map);
      fallbackAdded = true;
    }
  });
  marsTileLayer.addTo(map);

  // レイヤーグループ管理
  const rangeLayer = L.layerGroup().addTo(map);
  const hazardLayer = L.layerGroup().addTo(map);
  const scienceLayer = L.layerGroup().addTo(map);
  const routeLayer = L.layerGroup().addTo(map);

  // ドラッグ可能なA・Bマーカー作成
  const iconA = L.divIcon({
    className: '',
    html: '<div class="custom-pin pin-start" title="ドラッグして開始地点を移動">A</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  const iconB = L.divIcon({
    className: '',
    html: '<div class="custom-pin pin-end" title="ドラッグして目的地を移動">B</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  const markerA = L.marker([pointA.lat, pointA.lng], { icon: iconA, draggable: true }).addTo(map);
  const markerB = L.marker([pointB.lat, pointB.lng], { icon: iconB, draggable: true }).addTo(map);
  markerA.dragging.disable();
  markerB.dragging.disable();
  document.getElementById('presetSelect').disabled = true;

  function setWaypointSyncStatus(message, isError) {
    const status = document.getElementById('waypointSyncStatus');
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  async function saveWaypoints() {
    try {
      const response = await fetch('/api/waypoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          a: { lat: pointA.lat, lng: pointA.lng },
          b: { lat: pointB.lat, lng: pointB.lng }
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '座標を保存できませんでした');
      }

      waypointChannel.postMessage({ type: 'waypoints-updated', waypoints: result.waypoints });
      setWaypointSyncStatus('A/B地点をdata.jsonに保存しました', false);
    } catch (error) {
      setWaypointSyncStatus(`座標の保存に失敗しました: ${error.message}`, true);
    }
  }

  async function loadWaypoints() {
    setWaypointSyncStatus('座標を読み込み中...', false);
    try {
      const response = await fetch('/api/waypoints');
      if (!response.ok) {
        throw new Error('data.jsonを読み込めませんでした');
      }
      const result = await response.json();
      const a = result.waypoints && result.waypoints.a;
      const b = result.waypoints && result.waypoints.b;
      if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) ||
          !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) {
        throw new Error('data.jsonのwaypoints形式が正しくありません');
      }

      pointA = { lat: a.lat, lng: a.lng };
      pointB = { lat: b.lat, lng: b.lng };
      markerA.setLatLng(pointA);
      markerB.setLatLng(pointB);
      map.setView([pointA.lat, pointA.lng]);
      waypointsLoaded = true;
      markerA.dragging.enable();
      markerB.dragging.enable();
      document.getElementById('presetSelect').disabled = false;
      updateAll();
      setWaypointSyncStatus('data.jsonからA/B地点を読み込みました', false);
    } catch (error) {
      setWaypointSyncStatus(`座標の読み込みに失敗しました: ${error.message}（node server.jsで起動してください）`, true);
    }
  }

  waypointChannel.onmessage = (event) => {
    if (!event.data || event.data.type !== 'waypoints-updated' || !event.data.waypoints) return;
    const { a, b } = event.data.waypoints;
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) ||
        !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return;
    pointA = { lat: a.lat, lng: a.lng };
    pointB = { lat: b.lat, lng: b.lng };
    markerA.setLatLng(pointA);
    markerB.setLatLng(pointB);
    updateAll();
  };

  // 火星上の2点間距離 (km) を計算
  function marsDistanceKm(lat1, lng1, lat2, lng2) {
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * MARS_RADIUS_KM * Math.asin(Math.sqrt(a));
  }

  // 2. 地形データの決定論的サンプリング関数（擬似DEM・科学価値モデル）
  // 緯度・経度から標高・傾斜リスク・砂地・科学観測価値を連続的に算出
  function sampleMarsTerrain(lat, lng) {
    const s1 = Math.sin(lat * 260) * Math.cos(lng * 260);
    const s2 = Math.sin((lat + lng) * 520);
    const s3 = Math.cos(lat * 910 - lng * 740);

    // 傾斜角度 (0° ~ 28°)
    const slopeDeg = Math.abs(s1 * 14 + s2 * 9 + s3 * 5);
    // 砂地（軟弱地盤）度合い (0 ~ 1)
    const sandRisk = Math.max(0, Math.sin(lat * 340 - 1.2) * Math.cos(lng * 310 + 0.8));
    // 科学的観測価値（地層露出・クレーター縁・鉱物反応） (0 ~ 1)
    const scienceVal = Math.max(0, Math.cos(lat * 410 + 0.5) * Math.sin(lng * 430 - 0.4));

    return { slopeDeg, sandRisk, scienceVal };
  }

  // 周辺エリアの危険地帯と科学ポイントを可視化
  function renderEnvironmentFeatures() {
    hazardLayer.clearLayers();
    scienceLayer.clearLayers();

    const centerLat = (pointA.lat + pointB.lat) / 2;
    const centerLng = (pointA.lng + pointB.lng) / 2;
    const span = Math.max(0.018, marsDistanceKm(pointA.lat, pointA.lng, pointB.lat, pointB.lng) / 45);

    const step = span / 9;
    for (let dLat = -span; dLat <= span; dLat += step) {
      for (let dLng = -span; dLng <= span; dLng += step) {
        // グリッド点を少し揺らして自然な地形配置にする
        const lat = Math.round((centerLat + dLat) * 1000) / 1000;
        const lng = Math.round((centerLng + dLng) * 1000) / 1000;
        const t = sampleMarsTerrain(lat, lng);

        // 急斜面 or 深い砂地を危険エリアとして表示
        if (t.slopeDeg > 17.5 || t.sandRisk > 0.78) {
          L.circle([lat, lng], {
            radius: 130,
            color: '#ef4444',
            weight: 1,
            fillColor: '#ef4444',
            fillOpacity: 0.22,
            interactive: false
          }).addTo(hazardLayer);
        }
        // 科学観測価値が高い地点をPOIとして表示
        else if (t.scienceVal > 0.82) {
          L.circleMarker([lat, lng], {
            radius: 5,
            color: '#ffffff',
            weight: 1.5,
            fillColor: '#fbbf24',
            fillOpacity: 0.95
          })
            .bindTooltip('科学観測候補（堆積岩/鉱物反応）', { direction: 'top' })
            .addTo(scienceLayer);
        }
      }
    }
  }

  // 3. A*（エースター）アルゴリズムによる経路探索エンジン
  // mode: 'safe' (①安全優先) | 'science' (②探査最適)
  function findOptimalRoute(start, end, mode) {
    const GRID_SIZE = 28; // 28x28の探索グリッド
    const distAB = marsDistanceKm(start.lat, start.lng, end.lat, end.lng);
    const margin = Math.max(0.008, (distAB / MARS_RADIUS_KM) * (180 / Math.PI) * 0.65);

    const minLat = Math.min(start.lat, end.lat) - margin;
    const maxLat = Math.max(start.lat, end.lat) + margin;
    const minLng = Math.min(start.lng, end.lng) - margin;
    const maxLng = Math.max(start.lng, end.lng) + margin;

    const latStep = (maxLat - minLat) / (GRID_SIZE - 1);
    const lngStep = (maxLng - minLng) / (GRID_SIZE - 1);

    const toNode = (pt) => ({
      r: Math.max(0, Math.min(GRID_SIZE - 1, Math.round((pt.lat - minLat) / latStep))),
      c: Math.max(0, Math.min(GRID_SIZE - 1, Math.round((pt.lng - minLng) / lngStep)))
    });

    const toLatLng = (r, c) => ({
      lat: minLat + r * latStep,
      lng: minLng + c * lngStep
    });

    const startNode = toNode(start);
    const endNode = toNode(end);

    const key = (r, c) => `${r},${c}`;
    const openSet = new Map();
    const cameFrom = new Map();
    const gScore = new Map();

    const startKey = key(startNode.r, startNode.c);
    gScore.set(startKey, 0);
    openSet.set(startKey, {
      r: startNode.r,
      c: startNode.c,
      f: Math.hypot(endNode.r - startNode.r, endNode.c - startNode.c)
    });

    const dirs = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    let bestNode = startNode;
    let minHeuristic = Infinity;

    while (openSet.size > 0) {
      // 最小f値のノードを取得
      let current = null;
      for (const node of openSet.values()) {
        if (!current || node.f < current.f) current = node;
      }

      const cKey = key(current.r, current.c);
      if (current.r === endNode.r && current.c === endNode.c) {
        bestNode = current;
        break;
      }

      const hCur = Math.hypot(endNode.r - current.r, endNode.c - current.c);
      if (hCur < minHeuristic) {
        minHeuristic = hCur;
        bestNode = current;
      }

      openSet.delete(cKey);

      for (const [dr, dc] of dirs) {
        const nr = current.r + dr;
        const nc = current.c + dc;
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;

        const nKey = key(nr, nc);
        const stepDist = Math.hypot(dr, dc);
        const geo = toLatLng(nr, nc);
        const terrain = sampleMarsTerrain(geo.lat, geo.lng);

        // モード別のコスト関数設計
        let moveCost = stepDist;
        if (mode === 'safe') {
          // ① 安全優先：傾斜と砂地に対して極めて高いペナルティを課す
          const slopePenalty = terrain.slopeDeg > 14 ? Math.pow(terrain.slopeDeg - 10, 2.3) : terrain.slopeDeg * 0.25;
          const sandPenalty = terrain.sandRisk > 0.65 ? terrain.sandRisk * 18 : terrain.sandRisk * 2;
          moveCost += slopePenalty + sandPenalty;
        } else {
          // ② 探査最適：危険すぎる崖は避けつつ、科学観測価値が高い地点のコストを割引して引き寄せる
          const dangerPenalty = terrain.slopeDeg > 19 ? Math.pow(terrain.slopeDeg - 15, 2.2) : terrain.slopeDeg * 0.15;
          const scienceBonus = terrain.scienceVal > 0.7 ? -0.58 * stepDist : 0;
          moveCost = Math.max(0.25 * stepDist, stepDist + dangerPenalty + scienceBonus);
        }

        const tentativeG = gScore.get(cKey) + moveCost;
        if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
          cameFrom.set(nKey, current);
          gScore.set(nKey, tentativeG);
          const h = Math.hypot(endNode.r - nr, endNode.c - nc);
          openSet.set(nKey, { r: nr, c: nc, f: tentativeG + h });
        }
      }
    }

    // 経路の復元（スタートとゴールは厳密なピン座標にスナップ）
    const path = [];
    let curr = bestNode;
    while (curr) {
      const pt = toLatLng(curr.r, curr.c);
      path.unshift([pt.lat, pt.lng]);
      curr = cameFrom.get(key(curr.r, curr.c));
    }
    path[0] = [start.lat, start.lng];
    path[path.length - 1] = [end.lat, end.lng];

    // ルートの統計値（距離・所要時間・最大傾斜・安全度・科学ポイント）を集計
    let totalKm = 0;
    let totalMinutesOneWay = 0;
    let maxSlope = 0;
    let hazardHits = 0;
    let sciencePoiCount = 0;
    let scienceScoreSum = 0;

    for (let i = 0; i < path.length; i++) {
      const [lat, lng] = path[i];
      const t = sampleMarsTerrain(lat, lng);
      if (t.slopeDeg > maxSlope) maxSlope = t.slopeDeg;
      if (t.slopeDeg > 16 || t.sandRisk > 0.75) hazardHits++;
      if (t.scienceVal > 0.78) {
        sciencePoiCount++;
        scienceScoreSum += t.scienceVal * 35;
      }

      if (i > 0) {
        const segKm = marsDistanceKm(path[i - 1][0], path[i - 1][1], lat, lng);
        totalKm += segKm;
        // 傾斜・砂地による歩行速度低下を考慮して所要時間を計算
        const speedFactor = Math.max(0.45, 1 - (t.slopeDeg / 45) - (t.sandRisk * 0.25));
        const effSpeed = BASE_WALK_SPEED_KMH * speedFactor;
        totalMinutesOneWay += (segKm / effSpeed) * 60;
      }
    }

    const roundTripMin = Math.round(totalMinutesOneWay * 2);
    const safetyScore = Math.max(25, Math.min(99, Math.round(100 - maxSlope * 1.4 - hazardHits * 6)));
    const sciencePoints = Math.min(100, Math.round(45 + scienceScoreSum));

    return {
      path,
      distanceKm: totalKm,
      roundTripMin,
      maxSlope,
      safetyScore,
      sciencePoiCount,
      sciencePoints
    };
  }

  // 4. 計算結果の描画とUI更新
  function updateAll() {
    // 座標テキスト更新
    document.getElementById('coordA').textContent = formatMarsCoord(pointA.lat, pointA.lng);
    document.getElementById('coordB').textContent = formatMarsCoord(pointB.lat, pointB.lng);

    // 往復1時間（片道30分 = 約1.3km圏）の到達可能エリアを描画
    rangeLayer.clearLayers();
    const maxSafeRadiusMeters = ((BASE_WALK_SPEED_KMH * 0.5) * 0.88) * 1000; // 地形減速を見込んだ実質到達圏
    L.circle([pointA.lat, pointA.lng], {
      radius: maxSafeRadiusMeters,
      color: '#38e8c6',
      weight: 1.5,
      dashArray: '6, 6',
      fillColor: '#38e8c6',
      fillOpacity: 0.07,
      interactive: false
    }).addTo(rangeLayer);

    // 周辺地形の描画
    renderEnvironmentFeatures();

    // ①安全ルート と ②探査最適ルート を計算
    const safeRoute = findOptimalRoute(pointA, pointB, 'safe');
    const sciRoute = findOptimalRoute(pointA, pointB, 'science');

    // ルートポリライン描画
    routeLayer.clearLayers();

    // 非アクティブなルートを破線で下に描画
    const secondary = activeMode === 'safe' ? sciRoute : safeRoute;
    const primary = activeMode === 'safe' ? safeRoute : sciRoute;

    L.polyline(secondary.path, {
      color: activeMode === 'safe' ? '#a78bfa' : '#38e8c6',
      weight: 4,
      opacity: 0.55,
      dashArray: '7, 8'
    }).addTo(routeLayer);

    // アクティブ（選択中）のルートを太く発光させて描画
    const activeColor = activeMode === 'safe' ? '#38e8c6' : '#a78bfa';
    L.polyline(primary.path, {
      color: activeColor,
      weight: 12,
      opacity: 0.2
    }).addTo(routeLayer);

    L.polyline(primary.path, {
      color: activeColor,
      weight: 5,
      opacity: 0.95
    }).addTo(routeLayer);

    // UIメトリクス更新（① 安全ルート）
    document.getElementById('safeDist').textContent = `${safeRoute.distanceKm.toFixed(2)} km`;
    document.getElementById('safeTime').textContent = `${safeRoute.roundTripMin} 分`;
    document.getElementById('safeSlope').textContent = `${safeRoute.maxSlope.toFixed(1)}°`;
    document.getElementById('safeScore').textContent = `安全度 ${safeRoute.safetyScore}%`;

    // UIメトリクス更新（② 探査最適ルート）
    document.getElementById('sciDist').textContent = `${sciRoute.distanceKm.toFixed(2)} km`;
    document.getElementById('sciTime').textContent = `${sciRoute.roundTripMin} 分`;
    document.getElementById('sciValue').textContent = `${sciRoute.sciencePoints} pt`;
    document.getElementById('sciScore').textContent = `観測 ${sciRoute.sciencePoiCount}地点`;

    // 往復1時間（60分）以内判定バナーの更新
    const banner = document.getElementById('timeLimitBanner');
    const title = document.getElementById('timeLimitTitle');
    const icon = document.getElementById('timeLimitIcon');
    const detail = document.getElementById('timeLimitDetail');

    detail.innerHTML = `①安全ルート往復: <strong>${safeRoute.roundTripMin}分</strong> / ②探査ルート往復: <strong>${sciRoute.roundTripMin}分</strong>`;

    banner.classList.remove('ok', 'warn', 'danger');
    if (safeRoute.roundTripMin <= MAX_ROUND_TRIP_MIN && sciRoute.roundTripMin <= MAX_ROUND_TRIP_MIN) {
      banner.classList.add('ok');
      icon.textContent = '✔';
      title.textContent = '両ルートとも往復1時間以内（帰還可能）';
    } else if (safeRoute.roundTripMin <= MAX_ROUND_TRIP_MIN) {
      banner.classList.add('warn');
      icon.textContent = '⚠';
      title.textContent = '①安全ルートのみ1時間以内（②探査は時間超過）';
    } else {
      banner.classList.add('danger');
      icon.textContent = '✖';
      title.textContent = `往復1時間超過（安全ルートでも ${safeRoute.roundTripMin}分 要します）`;
    }
  }

  function formatMarsCoord(lat, lng) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lng).toFixed(4)}°${ew}`;
  }

  // イベントリスナー：ピンのドラッグ移動
  markerA.on('drag', (e) => {
    pointA = e.target.getLatLng();
    updateAll();
  });
  markerA.on('dragend', saveWaypoints);

  markerB.on('drag', (e) => {
    pointB = e.target.getLatLng();
    updateAll();
  });
  markerB.on('dragend', saveWaypoints);

  // 地図クリックで目的地Bを素早く移動
  map.on('click', (e) => {
    if (!waypointsLoaded) return;
    pointB = e.latlng;
    markerB.setLatLng(pointB);
    updateAll();
    saveWaypoints();
  });

  // ルートカードクリックで表示強調切替
  document.querySelectorAll('.route-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      activeMode = card.dataset.mode;
      updateAll();
    });
  });

  // 探査エリアプリセット変更
  document.getElementById('presetSelect').addEventListener('change', (e) => {
    if (!waypointsLoaded) return;
    const p = PRESETS[e.target.value];
    if (!p) return;
    pointA = { lat: p.lat, lng: p.lng };
    pointB = { lat: p.lat + 0.0075, lng: p.lng + 0.011 };
    markerA.setLatLng(pointA);
    markerB.setLatLng(pointB);
    map.setView([p.lat, p.lng], p.zoom);
    updateAll();
    saveWaypoints();
  });

  // 再計算ボタン
  document.getElementById('recalcBtn').addEventListener('click', updateAll);

  // レイヤー表示ON/OFF
  document.getElementById('chkRange').addEventListener('change', (e) => {
    e.target.checked ? map.addLayer(rangeLayer) : map.removeLayer(rangeLayer);
  });
  document.getElementById('chkHazards').addEventListener('change', (e) => {
    e.target.checked ? map.addLayer(hazardLayer) : map.removeLayer(hazardLayer);
  });
  document.getElementById('chkScience').addEventListener('change', (e) => {
    e.target.checked ? map.addLayer(scienceLayer) : map.removeLayer(scienceLayer);
  });

  // 初回描画
  updateAll();
  loadWaypoints();
})();