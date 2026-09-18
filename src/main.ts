// おへやモンスター v2 — エントリ: HUD常時表示(毎フレーム強制)/起動/figen情報
import { GameField } from './game';
import RAPIER from '@dimforge/rapier3d-compat';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function boot(): Promise<void> {
  // Rapier物理のWASMを先に初期化（これを怠ると new World が例外で boot が止まる）
  await RAPIER.init();
  $('ver').textContent = `ver ${__APP_VERSION__}`;

  const field = new GameField($('app'));
  field.onResize();
  addEventListener('resize', () => field.onResize());
  addEventListener('orientationchange', () => setTimeout(() => field.onResize(), 250));

  // HUDをJSから毎フレーム強制表示(Android/iPad問わず常に見える・押せる)
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div id="catch" style="pointer-events:auto;background:linear-gradient(135deg,#241a54,#4a2f8f);border-radius:16px;padding:10px 18px;font-size:22px;font-weight:800;color:#ffe9a8">つかまえた: 0</div>
      <button id="sound" style="pointer-events:auto;width:52px;height:52px;border-radius:50%;font-size:24px;background:#35c8d6;border:2px solid #fff;color:#fff">♪</button>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <button id="dex" style="pointer-events:auto;width:52px;height:52px;border-radius:50%;font-size:20px;background:#5a6b8c;border:2px solid #fff;color:#fff">図</button>
      <button id="exit" style="pointer-events:auto;width:52px;height:52px;border-radius:50%;font-size:26px;background:#ff8a7a;border:2px solid #fff;color:#fff">✕</button>
    </div>`;
  document.body.appendChild(hud);
  hud.classList.add('hidden');
  let n = 0;
  const forceHud = () => {
    if (!hud.classList.contains('hidden')) {
      hud.style.display = 'flex';
      $('catch').style.display = 'block';
    }
    $('catch').textContent = `つかまえた: ${n}`;
  };
  forceHud();

  let stream: MediaStream | null = null;
  const start = async (): Promise<void> => {
    unlock();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
      const video = document.createElement('video');
      video.autoplay = true; video.muted = true; video.playsInline = true;
      video.srcObject = stream;
      await video.play().catch(() => { /* 次フレームで再生 */ });
      document.body.appendChild(video); // VideoTextureに使うだけ(DOMは非表示)
      video.style.position = 'fixed'; video.style.inset = '0'; video.style.opacity = '0'; video.style.pointerEvents = 'none';
      field.setVideoBackground(video);
    } catch (e) {
      console.warn('[oheya2] カメラ失敗（映像なしで実行）', e);
    }
    $('title').classList.add('hidden');
    hud.classList.remove('hidden');
    forceHud();

    let prev = -1;
    field.renderer.setAnimationLoop((now) => {
      const dt = prev < 0 ? 0 : (now - prev) / 1000;
      prev = now;
      field.render(dt);
      forceHud(); // 毎フレームHUD表示を強制
    });
  };
  $('start').addEventListener('click', () => { void start(); });
  $('exit').addEventListener('click', () => {
    $('title').classList.remove('hidden');
    hud.classList.add('hidden');
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    field.renderer.setAnimationLoop(null);
  });
  $('sound').addEventListener('click', () => { /* v2 volgendeフェーズで実装 */ });
  $('dex').addEventListener('click', () => { /* v2図鑑フェーズで実装 */ });
}

function unlock(): void {
  const AC = window.AudioContext;
  if (AC) void new AC().resume(); // BGM/効果音は後続フェーズ
}

void boot();
