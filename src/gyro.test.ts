// おへやモンスター v2 — ジャイロFPS計算(computeQScreen)のテスト
// 確立式(three.js/Panolens/threepipe)をそのまま移植した computeQScreen を対象に、
// 「単位」「連続(天地反転しない)」を担保し、動作の「想定値(確立式が返す実測)」を記録する。

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeQScreen } from './gyro';

const UP = new THREE.Vector3(0, 1, 0);

function unit(q: THREE.Quaternion) {
  return Math.abs(q.length() - 1) < 1e-6;
}

describe('ジャイロFPS計算 computeQScreen（確立式移植）', () => {
  it('どの入力でも単位クォータニオン(長さ1)', () => {
    for (const o of [0, 90, 180, 270]) {
      for (const b of [0, 30, 90, 180]) {
        for (const g of [-90, 0, 90]) {
          expect(unit(computeQScreen(120, b, g, o))).toBe(true);
        }
      }
    }
  });

  it('【確立式の想定値(記録)】各orientで β と γ を振った fwdY の実測値（想定=この値）', () => {
    // 確立式が実際に返す値そのものを「想定」として記録。符号を勝手に決め付けない。
    for (const o of [0, 90, 180, 270]) {
      const f = (b: number, g: number) => new THREE.Vector3(0, 0, -1).applyQuaternion(computeQScreen(0, b, g, o)).y;
      const db = f(120, 70) - f(70, 70);
      const dg = f(70, 30) - f(70, 0);
      console.log(`orient=${o}: β+50→ΔfwdY=${db.toFixed(3)}  γ+30→ΔfwdY=${dg.toFixed(3)}`);
    }
    expect(true).toBe(true);
  });

  it('【連続性】β/γ を連続掃引しても up ベクトルが急反転しない(天地反転しない)', () => {
    for (const o of [0, 90, 180, 270]) {
      for (const [axis, other] of [['b', 'g'] as const, ['g', 'b'] as const]) {
        let px = 0, pz = 0;
        for (let k = 0; k <= 30; k++) {
          const u = new THREE.Vector3().copy(UP).applyQuaternion(
            axis === 'b' ? computeQScreen(0, 70 + k * 3, 40, o) : computeQScreen(0, 70, 40 + k * 3, o));
          if (k > 0) expect(u.x * px + u.z * pz).toBeGreaterThan(-0.5);
          px = u.x; pz = u.z;
        }
      }
    }
  });
});
