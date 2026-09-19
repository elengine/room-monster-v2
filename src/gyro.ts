// おへやモンスター v2 — ジャイロ(FPS視点) + 相対キャリブレーション + 画面向き対応
// FPS: 端末の向き=視点。左右で見る方向が変わり世界は回らない。
//
// v3.3.0: 「絶対方位ベース＋固定マッピング＋ワールド軸補正」をやめ、
//   ① 現姿勢(画面向き込み)を基準=正面0として**相対追従**
//   ② 画面回転(portrait⇔landscape)を Rz(画面角) で合成し、端末を回してもロールが崩れない
//   ③ calibrate() を スタートタップ時 / 向き切替検知時 / ダブルタップ で呼ぶ
//   これで機種基準・縦横・構え方の差を自動吸収し、手動パンは微調整用のみ。

// v3.3.1: 自動キャリブ(縦横切替)とダブルタップ正面リセットを同一処理 resetFront() に統一。
//   リセットは「最新の画面向き込み姿勢」を基準=0として再基準化。チルト/パンは
//   リセット**後**の補正値として( リセット基準に対して )作用する。
//   向き切替時は deviceorientation の次の新鮮なデータで基準化し直す( 古い姿勢で基準化しない )。

import * as THREE from 'three';

export type GyroHandle = {
  active: boolean;
  q: THREE.Quaternion;
  /** 生の姿勢値(α=方位/β=前後/γ=左右)と画面角(deg)を返す。実機での軸割り当て検証用 */
  snapshot: () => { alpha: number; beta: number; gamma: number; orient: number };
  /** 現在(最新)の画面向き込み姿勢を「正面=0」として再基準化（＝正面リセット） */
  resetFront: () => void;
  stop: () => void;
};

const Z = new THREE.Vector3(0, 0, 1);
const deg = (v: number | null) => THREE.MathUtils.degToRad(v ?? 0);

// 設定オフセット(度) — 相対化後の微調整用
let horizonOffset = 0; // チルト(±45)
let panOffset = 0;      // 左右パンニング(±45)
export function setHorizon(d: number): void { horizonOffset = d; }
export function getHorizon(): number { return horizonOffset; }
export function setPan(d: number): void { panOffset = d; }
export function getPan(): number { return panOffset; }

// 固定の基準回転(端末姿勢→カメラ基準へ)
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

/**
 * 純粋計算: α(方位)/β(前後)/γ(左右) と 画面角(orient, deg) から「端末姿勢→カメラ向き」Quaternion を返す。
 * window/device に非依存で実機なしにテスト可能。
 * (3.5.1: 3.5.0のiPad特化分岐を撤去し 3.4.1 相当へ復元。iOS/Androidそれぞれの正規化は調査→再設計)
 */
export function computeQScreen(alphaDeg: number, betaDeg: number, gammaDeg: number, orientDeg: number): THREE.Quaternion {
  const e = new THREE.Euler();
  e.set(deg(betaDeg), deg(gammaDeg), -deg(alphaDeg), 'YXZ');
  const q = new THREE.Quaternion().setFromEuler(e);
  q.multiply(_q1);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, -deg(orientDeg)));
  return q;
}



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
  const handle: GyroHandle = { active: false, q: new THREE.Quaternion(), resetFront: () => {}, snapshot: () => ({ alpha: snap.alpha, beta: snap.beta, gamma: snap.gamma, orient: snap.orient }), stop: () => {} };
  if (!('DeviceOrientationEvent' in window)) return handle;

  const qScreen = new THREE.Quaternion(); // 画面向き込みの現姿勢
  const snap = { alpha: 0, beta: 0, gamma: 0, orient: screenAngleDeg() };
  const qPan = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const base = new THREE.Quaternion();    // 基準=最新姿勢の逆(正面リセットで更新)
  let havePose = false;
  let pendingReset = true;              // 初回データ到着時に正面=その姿勢で基準化

  const frame = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(1, 0, 0);

  const onRot = (e: DeviceOrientationEvent): void => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    qScreen.copy(computeQScreen(e.alpha, e.beta, e.gamma, screenAngleDeg()));
    havePose = true;
    snap.alpha = e.alpha; snap.beta = e.beta; snap.gamma = e.gamma; snap.orient = screenAngleDeg();
    // 自動キャリブ/ダブルタップで要求された場合は【この新鮮な姿勢】で基準化(旧姿勢でやらない)
    if (pendingReset) {
      pendingReset = false;
      base.copy(qScreen).invert();
    }
    qPan.setFromAxisAngle(frame, deg(panOffset));
    qTilt.setFromAxisAngle(side, -deg(horizonOffset)); // チルト方向: +で下を向く
    // 相対追従 + リセット後のチルト/パン補正
    handle.q.copy(base).multiply(qScreen).multiply(qPan).multiply(qTilt);
    handle.active = true;
  };
  // 正面リセット: 【前段処理=自動キャリブレーション】を必ず実施 = 次の deviceorientation の
  // 新鮮な姿勢(screen角込み)で再基準化してから正面を決める。(古い姿勢/直前値で基準化しない)
  // ※自動キャリブ(向き切替)と全く同じ経路を通るため、ダブルタップと自動が同一挙動になる。
  handle.resetFront = () => { pendingReset = true; };
  window.addEventListener('deviceorientation', onRot);
  handle.stop = () => window.removeEventListener('deviceorientation', onRot);
  return handle;
}
