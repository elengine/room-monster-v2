// おへやモンスター v2 — ジャイロ(FPS視点) + 設定オフセット(地平線/左右パン)
// FPS: 端末の向き=視点。左右で見る方向が変わり世界は回らない。ロール=0。

import * as THREE from 'three';

export type GyroHandle = {
  active: boolean;
  q: THREE.Quaternion;
  stop: () => void;
};

const Z = new THREE.Vector3(0, 0, 1);
const deg = (v: number | null) => THREE.MathUtils.degToRad(v ?? 0);

// 設定オフセット(度)
let horizonOffset = 25; // 地平線(初期25)
let panOffset = 0;      // 左右パンニング
export function setHorizon(d: number): void { horizonOffset = d; }
export function getHorizon(): number { return horizonOffset; }
export function setPan(d: number): void { panOffset = d; }
export function getPan(): number { return panOffset; }

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
  const handle: GyroHandle = { active: false, q: new THREE.Quaternion(), stop: () => {} };
  if (!('DeviceOrientationEvent' in window)) return handle;

  const euler = new THREE.Euler();
  const qAbs = new THREE.Quaternion();
  const z90 = new THREE.Quaternion().setFromAxisAngle(Z, -Math.PI / 2);
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

  const onRot = (e: DeviceOrientationEvent): void => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    euler.set(deg(e.beta), deg(e.gamma), -deg(e.alpha), 'YXZ');
    qAbs.setFromEuler(euler);
    qAbs.multiply(z90).multiply(q1);
    // FPS視点: 端末の絶対向きをカメラへ。ロール=0。
    // 地平線(縦)=世界X軸の正回転、パン(左右ヨー)=世界Y軸の正回転として
    // 端末局部のオイラーに足さず世界軸で後から合成する( 互いに干渉しない )
    const qH = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deg(horizonOffset));
    const qP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg(panOffset));
    handle.q.copy(qAbs).premultiply(qH).premultiply(qP);
    handle.active = true;
  };
  window.addEventListener('deviceorientation', onRot);
  handle.stop = () => window.removeEventListener('deviceorientation', onRot);
  return handle;
}
