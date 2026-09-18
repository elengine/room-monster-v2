// おへやモンスター v2 — エントリ: 起動/モンスター出現/設定/図鑑/HUD強制
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GameField } from './game';
import { SPECIES, rollSpecies, type Species } from './species';
import { loadAllModels, instantiate } from './rig';
import { recordCatch, recordFlee, loadDex, totalCaught, clearDex } from './dex';
import { startGyro, requestGyroPermission, setHorizon, setPan, getHorizon, getPan } from './gyro';
import { sfx, startBGM, stopBGM, unlockAudio, setSfxMuted, setBgmMuted, setSfxVol, setBgmVol } from './audio';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
declare global { interface Window { __soundMuted?: boolean } }
const DEG = THREE.MathUtils.degToRad;

type Monster = {
  root: THREE.Group;
  ring: THREE.Mesh;
  ref: Species;
  floorX: number;
  floorZ: number;
  bornAt: number;
  state: 'idle' | 'fleeing';
  fleeDir: number;
  m0: THREE.Vector3;
};

let field: GameField; // boot() 内で await RAPIER.init() 後に生成
let gestureWired = false;
const hud = $('hud');
let statusTimer: number | null = null;

function showStatus(msg: string, bad = false): void {
  const el = $('status');
  if (!msg) { el.classList.remove('show', 'bad'); el.textContent = ''; return; }
  if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
  el.textContent = msg;
  el.classList.toggle('bad', bad);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  statusTimer = window.setTimeout(() => el.classList.remove('show'), 2800);
}

function refreshCatch(): void {
  $('catch').textContent = `つかまえた: ${totalCaught()}`;
}

/** メッセージを即消す( 画面遷移時はタイマー 待たずに消す ) */
function hideStatus(): void {
  if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
  const el = $('status');
  el.classList.remove('show', 'bad');
  el.textContent = '';
}

/** HUDを毎フレーム強制表示( どの端末でも常に見える・押せる ) */
function readyBallViewport(): void {
  // 構えボールは「HUDが見えている AND タイトル/設定/図鑑が1つも見えていない」時だけ見せる。
  // forceHud 内から毎フレーム呼ばれるため、ゲーム終了後は確実に非表示になる。
  const b = (window as unknown as { __readyBall?: HTMLElement | undefined }).__readyBall;
  const show = !hud.classList.contains('hidden') && !anyVeilVisible();
  if (b) b.style.display = show ? '' : 'none';
}

/** ゲーム外の画面(タイトル/設定/図鑑)がどれか1つでも見えていれば true */
function anyVeilVisible(): boolean {
  if (!$('title').classList.contains('hidden')) return true;
  if (!$('settings').classList.contains('hidden')) return true;
  if (!$('dex').classList.contains('hidden')) return true;
  return false;
}

function forceHud(): void {
  if (!hud.classList.contains('hidden')) {
    hud.style.display = 'flex';
    hud.style.zIndex = '50';
    for (const id of ['catch', 'sound', 'dexbtn', 'exit']) {
      const el = $(id as 'catch');
      if (el) { el.style.visibility = 'visible'; el.style.transform = 'translateZ(0)'; }
    }
  }
  readyBallViewport(); // HUD非表示中(タイトル等)でも毎フレーム呼んで確実に隠す
  refreshCatch();
}

// ===================== モンスター管理 =====================
const lib = new Map<string, THREE.Group>();
const monsters: Monster[] = [];
let cooldown = 2.5;

function spawn(species: Species): void {
  const maxN = parseInt(localStorage.getItem('oheya2:max') || '5', 10) || 5;
  // モデル未読・上限到達時は【何もせず静かに抜ける】: メッセージは成功時のみ出す
  if (monsters.length >= maxN) return;
  if (!lib.has(species.model)) return;
  const depthFar = parseFloat(localStorage.getItem('oheya2:depth') || '3');
  const x = (Math.random() - 0.5) * 2.4;
  const z = Math.random() * (depthFar + 0.6) - depthFar;
  const root = instantiate(lib, species.model, species.scale);
  root.position.set(x, 0, z);
  // 床影
  const sh = new THREE.Mesh(
    new THREE.CircleGeometry(species.scale * 0.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.004;
  root.add(sh);
  // 正面の当たり判定リング(線を細く)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1.0, 48),
    new THREE.MeshBasicMaterial({ color: 0x3eff6a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.position.set(0, species.scale * 0.75, species.scale * 0.42);
  ring.scale.setScalar(species.scale * 0.6);
  root.add(ring);

  field.scene.add(root);
  const m: Monster = {
    root, ring, ref: species, floorX: x, floorZ: z,
    bornAt: performance.now() / 1000, state: 'idle',
    fleeDir: Math.random() < 0.5 ? -1 : 1,
    m0: root.scale.clone(),
  };
  root.userData.monster = m;
  monsters.push(m);
  sfx('spawn');
  showStatus(`${species.name} が あらわれた！`);
}

function removeMonster(m: Monster): void {
  field.scene.remove(m.root);
  monsters.splice(monsters.indexOf(m), 1);
}

function updateMonster(m: Monster, t: number, dt: number): void {
  if (m.state === 'fleeing') {
    // 逃走= 左右に跳ねながら約1秒でフレームアウト(縮小なし)
    m.root.rotation.y += dt * 8;
    m.root.position.x += m.fleeDir * dt * 3.4;
    m.root.position.y = Math.abs(Math.sin(t * 13)) * m.m0.y * 0.55;
    if (t - m.bornAt > 6 || Math.abs(m.root.position.x - m.floorX) > 4) removeMonster(m);
    return;
  }
  const ph = m.bornAt * 2;
  switch (m.ref.motion) {
    case 'breathe': m.root.scale.copy(m.m0).multiplyScalar(1 + Math.sin(t * 4 + ph) * 0.13); break;
    case 'stretch': {
      const p = Math.sin(t * 5 + ph);
      m.root.scale.set(m.m0.x * (1 + 0.13 * p), m.m0.y * (1 - 0.24 * p), m.m0.z * (1 + 0.13 * p));
      break; }
    case 'hop': {
      m.root.position.x = m.floorX + Math.sin(t * 2.2 + ph) * 0.28;
      m.root.position.y = Math.abs(Math.sin(t * 6 + ph)) * m.m0.y * 0.95;
      break; }
    case 'fly': {
      const fh = parseFloat(localStorage.getItem('oheya2:flyh') || '3');
      // 空中位置: モデル高さ(m0スケール)と設定値から絶対Yを決める。
      // 内部の足元合わせ(rig: position.y -= b2.min.y)が負オフセットで床めり込みに見えるのを防ぐ
      m.root.position.y = Math.max(0.8, m.m0.y * fh * 0.9) + Math.sin(t * 3 + ph) * m.m0.y * 0.25;
      break; }
    case 'sway': {
      // 左右にゆっくり飛行しながら前後にもゆれる( ジョーズ・プレシオン系 )
      const fh = parseFloat(localStorage.getItem('oheya2:flyh') || '3');
      const baseY = Math.max(0.8, m.m0.y * fh * 0.8);
      m.root.position.y = baseY + Math.sin(t * 2.4 + ph) * m.m0.y * 0.35;
      m.root.position.x = m.floorX + Math.sin(t * 0.9 + ph) * 0.9;
      m.root.rotation.y = Math.sin(t * 0.9 + ph) * 0.5; // 進行方向へ顔を向ける
      break; }
    case 'drift': {
      // ふわふわ浮遊 + ゆっくり上下 + 迫力のあるうようよ感( クラゲ・コウモリ )
      const fh = parseFloat(localStorage.getItem('oheya2:flyh') || '3');
      const baseY = Math.max(0.8, m.m0.y * fh * 0.7);
      m.root.position.y = baseY + Math.abs(Math.sin(t * 1.7 + ph)) * m.m0.y * 0.9;
      m.root.position.x = m.floorX + Math.sin(t * 1.1 + ph * 1.3) * 0.35;
      m.root.rotation.z = Math.sin(t * 1.4 + ph) * 0.12;
      break; }
  }
  // リングのズームイン・アウト
  const s = 0.5 - 0.5 * Math.cos(t * 2.6 + ph);
  m.ring.scale.setScalar(m.ref.scale * (0.62 + s * 1.1));
  (m.ring.material as THREE.MeshBasicMaterial).color.setHSL((1 - s) * 0.33, 0.9, 0.55);
}

// ===================== 設定 =====================
function wireSettings(): void {
  const settings = $('settings');
  const bind = <K extends 'horizon' | 'pan' | 'depth' | 'flyh' | 'maxmons' | 'freq' | 'sfxv' | 'bgmv'>(
    id: K, key: string, def: string, label: string, on: (v: string) => void,
  ): void => {
    const el = $(id) as HTMLInputElement;
    const val = $(id.replace(/maxmons/, 'max') + '-val' as 'horizon-val');
    const saved = (() => { // 音量は古い0..1表記を0..100へ正規化してから復帰する
      const raw = localStorage.getItem(key);
      if (raw == null) return def;
      const v = parseFloat(raw);
      if (!isFinite(v)) return def;
      return String(key.includes('Vol') && v > 0 && v < 1 ? Math.round(v * 100) : v);
    })();
    el.value = saved; val.textContent = saved + label;
    on(saved);
    el.addEventListener('input', () => {
      val.textContent = el.value + label;
      localStorage.setItem(key, el.value);
      on(el.value);
    });
  };
  bind('horizon', 'oheya2:horizon', '25', '°', (v) => setHorizon(parseFloat(v) || 25));
  bind('pan', 'oheya2:pan', '0', '°', (v) => setPan(parseFloat(v) || 0));
  bind('depth', 'oheya2:depth', '3', '', () => {});
  bind('flyh', 'oheya2:flyh', '3', '', () => {});
  bind('maxmons', 'oheya2:max', '5', '', () => {});
  bind('freq', 'oheya2:freq', '4', '秒', () => {});
  bind('sfxv', 'oheya2:sfxVol', '90', '%', (v) => setSfxVol(parseFloat(v)));
  bind('bgmv', 'oheya2:bgmVol', '60', '%', (v) => setBgmVol(parseFloat(v)));
  const grid = $('grid') as HTMLInputElement;
  grid.checked = localStorage.getItem('oheya2:grid') !== '0';
  grid.addEventListener('change', () => { field.setGridVisible(grid.checked); localStorage.setItem('oheya2:grid', grid.checked ? '1' : '0'); });
  field.setGridVisible(localStorage.getItem('oheya2:grid') !== '0');
  const sfxt = $('sfxt') as HTMLInputElement;
  sfxt.checked = localStorage.getItem('oheya2:sfxMuted') !== '1';
  sfxt.addEventListener('change', () => { setSfxMuted(!sfxt.checked); localStorage.setItem('oheya2:sfxMuted', sfxt.checked ? '0' : '1'); });
  const bgmt = $('bgmt') as HTMLInputElement;
  bgmt.checked = localStorage.getItem('oheya2:bgmMuted') !== '1';
  bgmt.addEventListener('change', () => { setBgmMuted(!bgmt.checked); if (!bgmt.checked) startBGM(); }, );

  $('settings-btn').addEventListener('click', () => { unlockAudio(); sfx('tap'); hideStatus(); settings.classList.remove('hidden'); });
  $('settings-done').addEventListener('click', () => { sfx('tap'); hideStatus(); settings.classList.add('hidden'); });
}

// ===================== 図鑑 =====================
function renderDex(): void {
  const d = loadDex();
  const secretKnown = Object.keys(d).some((k) => k === 'shadow');
  $('dex-list').innerHTML = SPECIES
    .filter((s) => s.rarity !== 'secret' || secretKnown)
    .map((s) => {
      const e = d[s.id] ?? { got: 0, fled: 0 };
      const known = e.got > 0;
      const tag = s.rarity === 'rare' ? ' ★レア' : s.rarity === 'secret' ? ' ★シークレット' : '';
      return `<div class="rowline ${known ? '' : 'hide'}">
        <span><span class="dot" style="background:#${s.color.toString(16).padStart(6,'0')};color:#${s.color.toString(16).padStart(6,'0')}"></span>
        <b>${known ? s.name : '？？？'}</b>${tag}</span>
        <span class="num">${known ? `ゲット ${e.got}・にげ ${e.fled}` : 'みつからない'}</span></div>`;
    }).join('');
}

// ===================== ゲット/逃げ =====================
function onThrowResult(m: Monster, caught: boolean): void {
  if (caught) {
    recordCatch(m.ref.id);
    sfx('catch');
    showStatus(`${m.ref.name} を つかまえた！`);
    removeMonster(m);
  } else {
    recordFlee(m.ref.id);
    sfx('flee');
    m.state = 'fleeing';
    showStatus(`${m.ref.name} は にげてしまった…`, true);
  }
}

// ===================== 起動 =====================
async function boot(): Promise<void> {
  await RAPIER.init();
  field = new GameField($('app'));
  $('ver').textContent = `ver ${__APP_VERSION__}`;
  field.onResize();
  addEventListener('resize', () => field.onResize());
  addEventListener('orientationchange', () => setTimeout(() => field.onResize(), 250));
  wireSettings();
  refreshCatch();

  // モデル読込: 戻り値نامجroーバルlibへ( 戻り値を捨てるとリングだけになる )
  void loadAllModels((d, n) => {
    if (d === n) showStatus('じゅんび かんりょう！');
  }).then((m) => {
    for (const [k, v] of m) lib.set(k, v);
    (window as unknown as { __modelLib?: unknown }).__modelLib = lib; // QA用
  });

  $('start').addEventListener('click', () => { void startGame(); });
  $('exit').addEventListener('click', exitGame);
  $('sound').addEventListener('click', () => {
    // 全消音トグル: OFF時はBGM+効果音両方消す。復帰時は設定画面の値に戻す
    unlockAudio();
    if (!window.__soundMuted) {
      window.__soundMuted = true;
      setSfxMuted(true); setBgmMuted(true);
      $('sound').textContent = '✕';
      showStatus('おと をけしました');
    } else {
      window.__soundMuted = false;
      setSfxMuted(localStorage.getItem('oheya2:sfxMuted') === '1');
      setBgmMuted(localStorage.getItem('oheya2:bgmMuted') === '1');
      startBGM();
      $('sound').textContent = '♪';
      showStatus('おと を戻しました');
    }
  });
  $('dexbtn').addEventListener('click', () => { sfx('dex'); hideStatus(); renderDex(); $('dex').classList.remove('hidden'); });
  $('dex-close').addEventListener('click', () => { sfx('tap'); hideStatus(); $('dex').classList.add('hidden'); });
  $('dex-clear').addEventListener('click', () => {
    // 誤クリック防止: 確認ダイアログを挟んでから消す
    if (window.confirm('ずかんの きろくを ぜんぶ消します。よろしいですか？')) {
      clearDex();
      refreshCatch();
      renderDex();
      sfx('dex');
    }
  });

  let prev = -1;
  field.renderer.setAnimationLoop((now) => {
    const t = now / 1000;
    const dt = prev < 0 ? 0 : (now - prev) / 1000;
    prev = now;
    // 構えボールの死活は【毎フレーム】判定( タイトル等では確実に隠す )
    readyBallViewport();
    if (!hud.classList.contains('hidden')) {
      cooldown -= dt;
      if (cooldown <= 0) {
        spawn(rollSpecies(Math.random()));
        const freq = parseFloat(localStorage.getItem('oheya2:freq') || '4'); // 出現間隔の基準秒( 調整可 )
        cooldown = Math.max(1, freq) + Math.random() * 4;
      }
      const keep: Monster[] = [];
      for (const m of monsters) { updateMonster(m, t, dt); if (monsters.includes(m)) keep.push(m); }
      field.render(dt);
      if (gestureWired && gyroHandle?.active) field.camera.quaternion.copy(gyroHandle.q);
      forceHud();
    }
  });
}

let gyroHandle: ReturnType<typeof startGyro> | null = null;
let stream: MediaStream | null = null;

async function startGame(): Promise<void> {
  unlockAudio();
  const ok = await requestGyroPermission(); // タップ直後にジャイロ許可
  gyroHandle = startGyro();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
    const video = document.createElement('video');
    video.autoplay = true; video.muted = true; video.playsInline = true;
    video.srcObject = stream;
    await video.play().catch(() => { /* 自動再生は次フレーム以降でOK */ });
    video.style.cssText = 'position:fixed;inset:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    field.setVideoBackground(video);
  } catch (e) {
    console.warn('[oheya2] カメラ失敗（映像なしで実行）', e);
  }
  if (ok && gyroHandle) { /* 連動OK */ }
  $('title').classList.add('hidden');
  $('dex').classList.add('hidden');
  $('settings').classList.add('hidden');
  hideStatus(); // 遷移直前のメッセージを消す
  hud.classList.remove('hidden');
  forceHud();
  startBGM();
  showStatus('まわりを映して モンスターをさがそう');
  cooldown = 1.5;
  if (!gestureWired) {
    gestureWired = true;
    wireThrow();
  }
}

function exitGame(): void {
  sfx('tap');
  hideStatus(); // タイトルへ戻るのでメッセージも消す
  $('title').classList.remove('hidden');
  hud.classList.add('hidden');
  stopBGM();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  for (const m of [...monsters]) removeMonster(m);
}

/** フリック投げ: 常駐ボール(DOM)をフリックで投げ、近いモンスターへ飛ばす */
function wireThrow(): void {
  const el = field.renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  // 常駐ボール( つまめる構えボール ): 画面下中央。表示は毎フレームの forceHud に連動させる
  const readyBall = document.createElement('div');
  readyBall.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 84px);transform:translateX(-50%);width:68px;height:68px;border-radius:50%;z-index:45;pointer-events:none;' +
    'background:radial-gradient(circle at 35% 28%, #ffd2f0 0%, #ff6ba8 40%, #ff2d6f 70%, #8f1230 100%);border:3px solid #fff;box-shadow:0 4px 16px rgba(0,0,0,.5), 0 0 22px rgba(255,60,140,.65), inset 0 -6px 10px rgba(0,0,0,.35);overflow:visible;';
  // 鮮やかさ+輪っかアニメーション: 子要素のリングがクルクル回る
  const halo = document.createElement('div');
  halo.style.cssText = 'position:absolute;inset:-10px;border-radius:50%;border:3px dashed rgba(255,230,255,.9);animation:oheya-spin 3.2s linear infinite;filter:drop-shadow(0 0 8px rgba(255,120,200,.8));';
  readyBall.appendChild(halo);
  const style = document.createElement('style');
  style.textContent = '@keyframes oheya-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }';
  document.head.appendChild(style);
  document.body.appendChild(readyBall);
  (window as unknown as { __readyBall?: HTMLElement }).__readyBall = readyBall;
  // HUD非表示の場合は即隠す( スタート画面にボールが残る問題の対策 )
  readyBall.style.display = hud.classList.contains('hidden') ? 'none' : '';

  // ボールを指でドラッグ: 指に追従し、離すとその位置からフリック発射
  let drag: { x: number; y: number } | null = null;
  const setBallAt = (x: number, y: number): void => {
    readyBall.style.left = `${x - 34}px`;
    readyBall.style.bottom = `${window.innerHeight - y - 34}px`;
    readyBall.style.transform = 'none';
  };
  const resetBall = (): void => {
    readyBall.style.left = '50%';
    readyBall.style.bottom = 'calc(env(safe-area-inset-bottom) + 84px)';
    readyBall.style.transform = 'translateX(-50%)';
  };
  const onDown = (e: PointerEvent): void => {
    if (!hud.classList.contains('hidden')) { drag = { x: e.clientX, y: e.clientY }; }
  };
  const onMove = (e: PointerEvent): void => {
    if (drag) setBallAt(e.clientX, e.clientY);
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', (e) => {
    const start = drag;
    drag = null;
    if (!start) return;
    const dx = e.clientX - start.x; const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < 24 || dy > 0) { resetBall(); return; } // 小さすぎ/下方向は捩らず戻す
    // 指を離した先へ一番近いターゲットへ【DOMボールそのもの】をベジエで飛ばす
    let best: Monster | null = null; let bd = 300;
    const rect = el.getBoundingClientRect();
    for (const m of monsters) {
      if (m.state !== 'idle') continue;
      const v = new THREE.Vector3();
      m.root.getWorldPosition(v);
      v.project(field.camera);
      const px = ((v.x + 1) / 2) * rect.width;
      const py = ((1 - v.y) / 2) * rect.height;
      const d = Math.hypot(px - e.clientX, py - e.clientY);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) {
      sfx('throw');
      const x0 = start.x; const y0 = window.innerHeight - start.y; // bottom 座標系
      const x1 = e.clientX; const y1 = window.innerHeight - e.clientY;
      // 弧を描く: 中間点を上方へ
      const xM = (x0 + x1) / 2; const yM = Math.max(y0, y1) + 180;
      const t0 = performance.now();
      const fly = (): void => {
        const k = Math.min(1, (performance.now() - t0) / 500);
        const ax = x0 + (xM - x0) * k, ay = y0 + (yM - y0) * k;
        const bx = xM + (x1 - xM) * k, by = yM + (y1 - yM) * k;
        readyBall.style.left = `${ax + (bx - ax) * k - 34}px`;
        readyBall.style.bottom = `${ay + (by - ay) * k - 34}px`;
        readyBall.style.transform = 'none';
        if (k < 1) { requestAnimationFrame(fly); }
        else {
          const ringR = best.ring.scale.x / best.ref.scale;
          const quality = ringR <= 0.7 ? (ringR <= 0.45 ? 'EXCELLENT' : 'GREAT') : ringR <= 1.0 ? 'NICE' : 'OK';
          const mult = quality === 'EXCELLENT' ? 1.8 : quality === 'GREAT' ? 1.5 : quality === 'NICE' ? 1.25 : 1;
          const base = (best.ref.rarity === 'secret' ? 0.25 : best.ref.rarity === 'rare' ? 0.4 : [0, 0.68, 0.55, 0.45][best.ref.tier] ?? 0.5);
          onThrowResult(best, Math.random() < Math.min(0.95, base * mult));
          resetBall();
        }
      };
      void fly();
    } else {
      resetBall();
    }
  });
}

void boot();
