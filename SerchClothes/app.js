// =========================================================
// 状態管理 & タブ間リアルタイム同期（HUD ⇔ Controller）
// =========================================================
const STORAGE_KEY = 'mars_eva_nav_state_v1';
const CHANNEL_NAME = 'mars_eva_sync_channel';
const syncChannel = new BroadcastChannel(CHANNEL_NAME);

const SECTORS = [
  {
    name: 'GALE CRATER - AEOLIS PALUS',
    coords: 'LAT: -5.4453° S / LON: 137.8414° E | ELEV: -4,501m',
    seed: 1.2
  },
  {
    name: 'MOUNT SHARP FOOTHILLS',
    coords: 'LAT: -5.0812° S / LON: 137.8520° E | ELEV: -3,820m',
    seed: 2.7
  },
  {
    name: 'VERA RUBIN RIDGE',
    coords: 'LAT: -5.4710° S / LON: 137.8190° E | ELEV: -4,150m',
    seed: 4.1
  },
  {
    name: 'GEDIZ VALLIS CHANNEL',
    coords: 'LAT: -5.4920° S / LON: 137.8305° E | ELEV: -3,940m',
    seed: 5.9
  }
];

let state = {
  oxygen: 85,
  isOnline: true,
  signalStrength: 92,
  lastSync: new Date().toLocaleTimeString(),
  sectorIndex: 0,
  astroPos: { x: 0.22, y: 0.72 },
  showSafeRoute: true,
  showOptimalRoute: true,
  showDangerZones: true,
  highContrastMono: false,
  forceDangerAlert: false
};

// ローカルキャッシュから復元
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = { ...state, ...JSON.parse(saved) };
    } catch (e) {}
  }
}

// 状態を保存して別画面（HUD / Controller）に即時通知
function saveAndBroadcast() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncChannel.postMessage(state);
  renderAll();
}

syncChannel.onmessage = (event) => {
  state = event.data;
  renderAll();
};

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) {
    state = JSON.parse(e.newValue);
    renderAll();
  }
});

// =========================================================
// モード切替（URLパラメータ対応）
// =========================================================
function switchMode(mode) {
  const hudView = document.getElementById('hud-view');
  const ctrlView = document.getElementById('control-view');
  const btnHud = document.getElementById('btn-mode-hud');
  const btnCtrl = document.getElementById('btn-mode-ctrl');

  if (mode === 'control') {
    hudView.classList.remove('active');
    ctrlView.classList.add('active');
    btnHud.classList.remove('active');
    btnCtrl.classList.add('active');
  } else {
    ctrlView.classList.remove('active');
    hudView.classList.add('active');
    btnCtrl.classList.remove('active');
    btnHud.classList.add('active');
    resizeCanvas();
  }
}

function openSeparateWindow() {
  const url = new URL(window.location.href);
  url.searchParams.set('mode', 'control');
  window.open(url.toString(), 'MarsController', 'width=800,height=700');
}

// =========================================================
// 全画面等高線・ルート・危険エリア描画エンジン (Canvas)
// =========================================================
const canvas = document.getElementById('mars-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  drawMap();
}
window.addEventListener('resize', resizeCanvas);

// 擬似標高関数（全画面地形データ）
function getElevation(nx, ny, seed) {
  const v1 = Math.sin(nx * 5.0 + seed) * Math.cos(ny * 4.5 - seed);
  const v2 = Math.sin((nx + ny) * 9.0 + seed * 1.5) * 0.4;
  const craterDist = Math.hypot(nx - 0.55, ny - 0.45);
  const crater = craterDist < 0.22 ? -Math.cos((craterDist / 0.22) * Math.PI * 0.5) * 1.2 : 0;
  return v1 + v2 + crater;
}

function drawMap() {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return;

  const mono = state.highContrastMono;
  const sector = SECTORS[state.sectorIndex];

  // 背景クリア（宇宙服バイザー越しにくっきり見える純黒ベース）
  ctx.fillStyle = '#030508';
  ctx.fillRect(0, 0, w, h);

  // 1. 全画面等高線データの描画（マーチングスクエア簡易グリッド）
  const step = 14;
  const cols = Math.ceil(w / step);
  const rows = Math.ceil(h / step);
  const grid = [];

  for (let r = 0; r <= rows; r++) {
    grid[r] = [];
    for (let c = 0; c <= cols; c++) {
      grid[r][c] = getElevation(c / cols, r / rows, sector.seed);
    }
  }

  const levels = [-1.6, -1.3, -1.0, -0.7, -0.4, -0.1, 0.2, 0.5, 0.8, 1.1];
  levels.forEach((level, idx) => {
    const isMajor = idx % 3 === 0;
    ctx.beginPath();
    ctx.strokeStyle = mono
      ? (isMajor ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)')
      : (isMajor ? 'rgba(0, 240, 255, 0.55)' : 'rgba(255, 255, 255, 0.22)');
    ctx.lineWidth = isMajor ? 1.6 : 0.8;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v0 = grid[r][c];
        const v1 = grid[r][c + 1];
        const v2 = grid[r + 1][c + 1];
        const v3 = grid[r + 1][c];

        const pts = [];
        if ((v0 < level) !== (v1 < level)) {
          const t = (level - v0) / (v1 - v0);
          pts.push({ x: (c + t) * step, y: r * step });
        }
        if ((v1 < level) !== (v2 < level)) {
          const t = (level - v1) / (v2 - v1);
          pts.push({ x: (c + 1) * step, y: (r + t) * step });
        }
        if ((v2 < level) !== (v3 < level)) {
          const t = (level - v2) / (v3 - v2);
          pts.push({ x: (c + t) * step, y: (r + 1) * step });
        }
        if ((v3 < level) !== (v0 < level)) {
          const t = (level - v3) / (v0 - v3);
          pts.push({ x: c * step, y: (r + t) * step });
        }

        if (pts.length === 2) {
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
        }
      }
    }
    ctx.stroke();
  });

  // 2. 危険エリアの表示（急斜面・クレーター陥没帯）
  const dangerZones = [
    { x: w * 0.55, y: h * 0.45, r: Math.min(w, h) * 0.14, label: 'STEEP CRATER RIM' },
    { x: w * 0.36, y: h * 0.32, r: Math.min(w, h) * 0.08, label: 'UNSTABLE REGOLITH' }
  ];

  if (state.showDangerZones) {
    dangerZones.forEach((dz) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(dz.x, dz.y, dz.r, 0, Math.PI * 2);
      ctx.strokeStyle = mono ? '#ffffff' : '#ff2a55';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.stroke();

      ctx.fillStyle = mono ? 'rgba(255,255,255,0.18)' : 'rgba(255, 42, 85, 0.22)';
      ctx.fill();

      ctx.fillStyle = mono ? '#ffffff' : '#ff2a55';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ ' + dz.label, dz.x, dz.y);
      ctx.restore();
    });
  }

  // スタート（現在地）とゴール（基地/探査目標）
  const startX = w * state.astroPos.x;
  const startY = h * state.astroPos.y;
  const goalX = w * 0.78;
  const goalY = h * 0.24;

  // 3. 安全優先ルートの表示（危険エリアを大きく迂回・実線）
  if (state.showSafeRoute) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      w * 0.25, h * 0.85,
      w * 0.78, h * 0.78,
      goalX, goalY
    );
    ctx.strokeStyle = mono ? '#ffffff' : '#00ff88';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  // 4. 探索最適ルートの点線表示（最短距離・高効率）
  if (state.showOptimalRoute) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(w * 0.45, h * 0.46, goalX, goalY);
    ctx.strokeStyle = mono ? '#ffffff' : '#ffaa00';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.stroke();
    ctx.restore();
  }

  // 目的地マーカー（BASE / TARGET）
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(goalX - 10, goalY - 10, 20, 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('TARGET [WAYPOINT-B]', goalX - 60, goalY - 16);
  ctx.restore();

  // 宇宙服（現在位置）マーカー
  ctx.save();
  ctx.beginPath();
  ctx.arc(startX, startY, 9, 0, Math.PI * 2);
  ctx.fillStyle = mono ? '#ffffff' : '#00f0ff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('EVA-01 (YOU)', startX + 14, startY + 4);
  ctx.restore();

  // 危険エリア接近判定
  const inDanger = dangerZones.some(
    (dz) => Math.hypot(startX - dz.x, startY - dz.y) < dz.r + 25
  );
  const banner = document.getElementById('danger-banner');
  banner.style.display = (inDanger || state.forceDangerAlert) ? 'block' : 'none';
}

// =========================================================
// UI更新処理
// =========================================================
function renderAll() {
  // 酸素残量
  const o2Text = document.getElementById('hud-o2-text');
  const o2Fill = document.getElementById('o2-bar-fill');
  const mins = Math.floor((state.oxygen / 100) * 300);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  o2Text.textContent = `${state.oxygen}% (${hh}:${mm})`;
  o2Fill.style.width = `${state.oxygen}%`;
  o2Fill.style.backgroundColor = state.oxygen <= 20 ? '#ff2a55' : '#ffffff';

  // 通信状況
  const commEl = document.getElementById('hud-comm-status');
  const cacheEl = document.getElementById('hud-cache-info');
  if (state.isOnline) {
    commEl.textContent = `ONLINE [${state.signalStrength}%]`;
    commEl.className = 'hud-value-large comm-online';
    cacheEl.textContent = `TERRAIN CACHE: SYNCED (${state.lastSync})`;
  } else {
    commEl.textContent = 'OFFLINE [NO SIGNAL]';
    commEl.className = 'hud-value-large comm-offline';
    cacheEl.textContent = 'MODE: OFFLINE-FIRST LOCAL CACHE';
  }

  // 地名・座標
  const sector = SECTORS[state.sectorIndex];
  document.getElementById('hud-place-name').textContent = sector.name;
  document.getElementById('hud-coords').textContent = sector.coords;

  // コントローラーボタン状態反映
  updateToggleBtn('toggle-safe', state.showSafeRoute, '安全優先ルート（実線）を表示');
  updateToggleBtn('toggle-opt', state.showOptimalRoute, '探索最適ルート（点線）を表示');
  updateToggleBtn('toggle-danger', state.showDangerZones, '危険エリア（クレーター崖・急斜面）を表示');
  updateToggleBtn('toggle-mono', state.highContrastMono, '完全白黒ハイコントラストモード（直射日光用）');

  drawMap();
}

function updateToggleBtn(id, flag, label) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = `[${flag ? 'ON' : 'OFF'}] ${label}`;
  if (flag) el.classList.add('active-toggle');
  else el.classList.remove('active-toggle');
}

// =========================================================
// コントローラー側アクション
// =========================================================
function addLog(msg) {
  const box = document.getElementById('comm-log');
  if (!box) return;
  const time = new Date().toLocaleTimeString();
  box.innerHTML = `[${time}] ${msg}<br>` + box.innerHTML;
}

function syncBaseStation() {
  addLog('基地局へDEMタイル差分リクエスト送信中...');
  setTimeout(() => {
    state.isOnline = true;
    state.signalStrength = Math.floor(85 + Math.random() * 14);
    state.lastSync = new Date().toLocaleTimeString();
    addLog(`受信完了: 等高線タイルキャッシュ更新 (RSSI: ${state.signalStrength}%)`);
    saveAndBroadcast();
  }, 400);
}

function toggleCommState() {
  state.isOnline = !state.isOnline;
  addLog(state.isOnline
    ? '基地局リンク再確立: オンライン復帰'
    : '警告: 通信途絶。ローカルキャッシュによる自律ナビゲーションへ移行');
  saveAndBroadcast();
}

function toggleLayer(key) {
  state[key] = !state[key];
  saveAndBroadcast();
}

function changeSector(idx) {
  state.sectorIndex = Number(idx);
  addLog(`セクター切替: ${SECTORS[state.sectorIndex].name} のキャッシュデータをロード`);
  saveAndBroadcast();
}

function moveAstronaut(val) {
  const ratio = Number(val) / 100;
  state.astroPos.x = ratio;
  state.astroPos.y = 0.85 - ratio * 0.65;
  saveAndBroadcast();
}

function setOxygen(val) {
  state.oxygen = Number(val);
  saveAndBroadcast();
}

function triggerDangerTest() {
  state.forceDangerAlert = !state.forceDangerAlert;
  saveAndBroadcast();
}

// =========================================================
// 初期化実行
// =========================================================
loadState();
const params = new URLSearchParams(window.location.search);
if (params.get('mode') === 'control') {
  switchMode('control');
} else {
  switchMode('hud');
}
addLog('システム起動完了: ローカル地形キャッシュ準備OK');
renderAll();