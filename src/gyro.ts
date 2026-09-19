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
  /** 現在(最新)の画面向き込み姿勢を「正面=0」として再基準化（＝正面リセット） */
  resetFront: () => void;
  stop: () => void;
};

const Z = new THREE.Vector3(0, 0, 1);
const deg = (v: number | null) => THREE.MathUtils.degToRad(v ?? 0);

// iOS(iPhone/iPad)判定: iPad は UA 上 Mac になるため maxTouchPoints でも補足
const isIOS = (() => {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh|MacIntel/.test(ua) && (((navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints) ?? 0) > 1);
})();

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
export function computeQScreen(alphaDeg: number, betaDeg: number, gammaDeg: number, orientDeg: number, isIOS = false): THREE.Quaternion {
  // 【確立式をそのまま移植】euler(β, α, −γ, 'YXZ') → ×q1(−√0.5,0,0,√0.5) → ×Rz(−画面角)
  // +iPad/iPhone は「左⇔上」が入れ替わる90°オフセット(実機: Android完璧/iPadは左→上化)を追加
  const e = new THREE.Euler();
  e.set(deg(betaDeg), deg(alphaDeg), -deg(gammaDeg), 'YXZ');
  const q = new THREE.Quaternion().setFromEuler(e);
  q.multiply(_q1);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, -deg(orientDeg)));
  if (isIOS) q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, (orientDeg % 180 === 0 ? -1 : 1) * Math.PI / 2)); // iPad: 奇数90/270=+90° / 偶数0/180=−90°(実機)
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
  const handle: GyroHandle = { active: false, q: new THREE.Quaternion(), resetFront: () => {}, stop: () => {} };
  if (!('DeviceOrientationEvent' in window)) return handle;

  const qScreen = new THREE.Quaternion(); // 画面向き込みの現姿勢
  const qPan = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const base = new THREE.Quaternion();    // 基準=最新姿勢の逆(正面リセットで更新)
  let havePose = false;
  let pendingReset = true;              // 初回データ到着時に正面=その姿勢で基準化

  const frame = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(1, 0, 0);

  const onRot = (e: DeviceOrientationEvent): void => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    qScreen.copy(computeQScreen(e.alpha, e.beta, e.gamma, screenAngleDeg(), isIOS));
    havePose = true;
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
