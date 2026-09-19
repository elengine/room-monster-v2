// おへやモンスター v2 — ジャイロ(FPS視点) + 相対キャリブレーション + 画面向き対応
// FPS: 端末の向き=視点。左右で見る方向が変わり世界は回らない。
//
// v3.3.0: 「絶対方位ベース＋固定マッピング＋ワールド軸補正」をやめ、
//   ① 現姿勢(画面向き込み)を基準=正面0として**相対追従**
//   ② 画面回転(portrait⇔landscape)を Rz(画面角) で合成し、端末を回してもロールが崩れない
//   ③ calibrate() を スタートタップ時 / 向き切替検知時 / ダブルタップ で呼ぶ
//   これで機種基準・縦横・構え方の差を自動吸収し、手動パンは微調整用のみ。

import * as THREE from 'three';

export type GyroHandle = {
  active: boolean;
  q: THREE.Quaternion;
  /** 現在の画面向き込み姿勢を「正面=0」として基準化 */
  calibrate: () => void;
  stop: () => void;
};

const Z = new THREE.Vector3(0, 0, 1);
const deg = (v: number | null) => THREE.MathUtils.degToRad(v ?? 0);

// 設定オフセット(度) — 相対化後の微調整用
let horizonOffset = 25; // 地平線(初期25)
let panOffset = 0;      // 左右パンニング
export function setHorizon(d: number): void { horizonOffset = d; }
export function getHorizon(): number { return horizonOffset; }
export function setPan(d: number): void { panOffset = d; }
export function getPan(): number { return panOffset; }

/** 画面の回転角(度)。portrait=0 / landscape=90 … */
function screenAngleDeg(): number {
  const so = (screen as unknown as { orientation?: { angle?: number } }).orientation;
  if (so && typeof so.angle === 'number') return so.angle;
  const w = (window as unknown as { orientation?: number }).orientation;
  return typeof w === 'number' ? w : 0;
}

// iOS/iPadOS: requestPermission はタップ直後に呼ぶ( 他awaitより先 )
export async function requestGyroPermission(): Promise<boolean> {
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof DOE?.requestPermission === 'function') {
    const p = await DOE.requestPermission().catch(() => 'denied');
    return p === 'granted';
  }
  return true;
}

export function startGyro(): GyroHandle {
  const handle: GyroHandle = { active: false, q: new THREE.Quaternion(), calibrate: () => {}, stop: () => {} };
  if (!('DeviceOrientationEvent' in window)) return handle;

  const euler = new THREE.Euler();
  const qAbs = new THREE.Quaternion();   // センサ→ワールド(固定変換の前提: portrait)
  const z90 = new THREE.Quaternion().setFromAxisAngle(Z, -Math.PI / 2);
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  const qScreen = new THREE.Quaternion(); // 画面向き込みの現姿勢
  const qPan = new THREE.Quaternion();
  const qHor = new THREE.Quaternion();
  let base = new THREE.Quaternion();      // 基準=現在姿勢の逆
  let havePose = false;
  let needCalib = true;                // 初回データ到着時に基準化

  const frame = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(1, 0, 0);

  const onRot = (e: DeviceOrientationEvent): void => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    euler.set(deg(e.beta), deg(e.gamma), -deg(e.alpha), 'YXZ');
    qAbs.setFromEuler(euler);
    qAbs.multiply(z90).multiply(q1);
    // 画面回転(縦⇔横)を端末の画面法線まわりに足す → 端末を回しても「上」が崩れない
    qScreen.copy(qAbs).multiply(new THREE.Quaternion().setFromAxisAngle(Z, -deg(screenAngleDeg())));
    havePose = true;
    qPan.setFromAxisAngle(frame, deg(panOffset));
    qHor.setFromAxisAngle(side, deg(horizonOffset));
    // 相対追従: 基準の逆 × 現姿勢 × 微調整
    handle.q.copy(base).multiply(qScreen).multiply(qPan).multiply(qHor);
    handle.active = true;
    if (needCalib) { needCalib = false; handle.q.copy(qPan).multiply(qHor); }
  };
  handle.calibrate = () => {
    if (!havePose) { needCalib = true; return; } // まだ姿勢が無ければ初回で基準化
    base.copy(qScreen).invert();
  };
  window.addEventListener('deviceorientation', onRot);
  handle.stop = () => window.removeEventListener('deviceorientation', onRot);
  return handle;
}
