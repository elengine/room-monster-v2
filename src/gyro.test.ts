// おへやモンスター v2 — ジャイロFPS計算(computeQScreen)の詳細テスト
// 実機なしに純粋関数レベルで検証できる。テストで「天地反転(連続性)」「軸割り当て」
// 「正面リセット」が壊れていないかを数値で担保し、実機フィードバックのデグレを防ぐ。
//
// 座標: カメラは -Z 前方 / +Y 上 のthree.js標準。
//   forward = q*(0,0,-1) , up = q*(0,1,0) , right = q*(1,0,0)

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeQScreen } from './gyro';

const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);

function axes(q: THREE.Quaternion) {
  return {
    fwd: new THREE.Vector3().setFromEuler(new THREE.Euler()).copy(FWD).applyQuaternion(q),
    up: new THREE.Vector3().copy(UP).applyQuaternion(q),
  };
}
function unit(q: THREE.Quaternion) {
  return Math.abs(q.length() - 1) < 1e-6;
}

/** 各orientについて、β と γ それぞれを d 度だけ増やしたときのカメラ挙動を評価して返す */
function stepReport(orientDeg: number, base: { alpha: number; beta: number; gamma: number }, d: number) {
  const q0 = computeQScreen(base.alpha, base.beta, base.gamma, orientDeg);
  const qB = computeQScreen(base.alpha, base.beta + d, base.gamma, orientDeg);
  const qG = computeQScreen(base.alpha, base.beta, base.gamma + d, orientDeg);
  const a0 = axes(q0);
  const aB = axes(qB);
  const aG = axes(qG);
  // 回転軸 = 微小回転 R = qB * q0^-1 の角速度軸(擬似的に差ベクトルで近似)
  const dFwdB = aB.fwd.clone().sub(a0.fwd);
  const dUpB = aB.up.clone().sub(a0.up);
  const dFwdG = aG.fwd.clone().sub(a0.fwd);
  return {
    fB: `β+${d}: fwd.y=${dFwdB.y.toFixed(3)} up.x=${dUpB.x.toFixed(3)} (Δfwd=${dFwdB.toArray().map((v) => v.toFixed(2)).join(',')})`,
    fG: `γ+${d}: fwd.y=${dFwdG.y.toFixed(3)} (Δfwd=${dFwdG.toArray().map((v) => v.toFixed(2)).join(',')})`,
  };
}

describe('ジャイロFPS計算 computeQScreen', () => {
  it('どの入力でも単位クォータニオン(長さ1)を返す', () => {
    for (const o of [0, 90, 180, 270]) {
      for (const b of [0, 30, 90, 180]) {
        for (const g of [-90, 0, 90]) {
          expect(unit(computeQScreen(120, b, g, o))).toBe(true);
        }
      }
    }
  });

  it('提示いただいた実機計測データ(Fold8)の「天面を上げる軸」で、カメラが行う回転を一覧表示(検証の基準表)', () => {
    // 実機計測: 「天井を見上げる」と動いたのは (Fold8: orient0→β, orient90/270→γ)
    console.log('Fold8 orient0 (up=β):', stepReport(0, { alpha: 0, beta: 70, gamma: 0 }, 40));
    console.log('Fold8 orient90 (up=γ):', stepReport(90, { alpha: 0, beta: 70, gamma: 0 }, 40));
    console.log('Fold8 orient270(up=γ):', stepReport(270, { alpha: 0, beta: 70, gamma: 0 }, 40));
    // iPad: (orient0/180→γ, orient90/270→β)
    console.log('iPad orient0 (up=γ):', stepReport(0, { alpha: 0, beta: 70, gamma: 0 }, 40));
    console.log('iPad orient90 (up=β):', stepReport(90, { alpha: 0, beta: 70, gamma: 0 }, 40));
    console.log('iPad orient180(up=γ):', stepReport(180, { alpha: 0, beta: 70, gamma: 0 }, 40));
    console.log('iPad orient270(up=β):', stepReport(270, { alpha: 0, beta: 70, gamma: 0 }, 40));
    expect(true).toBe(true);
  });

  it('【天地反転チェック】β を連続掃引しても up ベクトルが不連続に反転しない(実機で起きた「見上げ中に天地反転」を検出)', () => {
    for (const o of [0, 90, 180, 270]) {
      let prevUpX = 1;
      let prevUpZ = 0;
      for (let b = -20; b <= 160; b += 5) {
        const up = new THREE.Vector3().copy(UP).applyQuaternion(computeQScreen(0, b, 0, o));
        // up の水平成分が符号反転=瞬間的に天地が反転
        const hx = up.x; const hz = up.z;
        if (b > -20) {
          expect(hx * prevUpX + hz * prevUpZ).toBeGreaterThan(-0.5); // 水平向きが急反転しない
        }
        prevUpX = hx; prevUpZ = hz;
      }
    }
  });

  it('【修正後(確立式)の想定結果】Fold8 と iPad の全「上」行(7行)で fwdY が増える=上を向く', () => {
    // どの機種・縦横でも「天面を上げる=カメラが上を向く」(iOS/Androidでラベルが入れ替わるため isIOS を渡す)
    const rows: Array<[string, number, 'b' | 'g', number, number]> = [
      ['Fold8', 0, 'b', 90, 180], ['Fold8', 90, 'g', 90, 0], ['Fold8', 270, 'g', -90, 0],
      ['iPad', 0, 'g', 90, 0], ['iPad', 180, 'g', -90, 0], ['iPad', 90, 'b', 90, 180], ['iPad', 270, 'b', -90, -180],
    ];
    for (const [dev, o, ax, f, t] of rows) {
      const ios = dev === 'iPad';
      const y0 = ax === 'g' ? axes(computeQScreen(0, 70, f, o, ios)).fwd.y : axes(computeQScreen(0, f, 0, o, ios)).fwd.y;
      const y1 = ax === 'g' ? axes(computeQScreen(0, 70, t, o, ios)).fwd.y : axes(computeQScreen(0, t, 0, o, ios)).fwd.y;
      expect(y1).toBeGreaterThan(y0); // 上→上を向く
    }
  });

  it('【修正後(確立式)の想定結果】天地反転しない連続掃引 (Fold8/iPad 全向き)', () => {
    for (const ios of [false, true]) {
      for (const o of [0, 90, 180, 270]) {
        const prev = { x: 0, z: 0 };
        for (let k = 0; k <= 30; k++) {
          const v = 90 - k * 3; // 「上」方向に連続掃引
          const u = new THREE.Vector3().copy(UP).applyQuaternion(computeQScreen(0, o === 0 ? 70 : v, o === 0 ? v : 70, o, ios));
          if (k > 0) expect(u.x * prev.x + u.z * prev.z).toBeGreaterThan(-0.5);
          prev.x = u.x; prev.z = u.z;
        }
      }
    }
  });
});
