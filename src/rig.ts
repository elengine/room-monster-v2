// おへやモンスター v2 — CC0 glTFモデルの読込とインスタンス化

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPECIES } from './species';

const loader = new GLTFLoader();

/** 全モデルを先読み → species.id → scene の辞書（1体失敗でも他は読む） */
export async function loadAllModels(onProgress?: (done: number, total: number) => void): Promise<Map<string, THREE.Group>> {
  const map = new Map<string, THREE.Group>();
  const uniq = [...new Set(SPECIES.map((s) => s.model))];
  let done = 0;
  await Promise.all(uniq.map(async (file) => {
    try {
      const gltf = await new Promise<any>((ok, ng) => loader.load(`./models/${file}`, ok, undefined, ng));
      map.set(file, gltf.scene as THREE.Group);
    } catch (e) {
      console.warn('[oheya2] モデル読込失敗:', file, e);
    }
    done++;
    onProgress?.(done, uniq.length);
  }));
  return map;
}

/** 辞書からクローン生成（SkeletonUtilsで骨組みごと複製してアニメーション可能に） */
export function instantiate(lib: Map<string, THREE.Group>, model: string, scale: number): THREE.Group {
  const src = lib.get(model);
  if (!src) return new THREE.Group();
  const clone = SkeletonUtils.clone(src) as THREE.Group;
  const box = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  box.getSize(size);
  const h = Math.max(size.x, size.y, size.z) || 1;
  clone.scale.setScalar(scale / h);
  // 足元を地面に合わせる
  const b2 = new THREE.Box3().setFromObject(clone);
  clone.position.y -= b2.min.y;
  return clone;
}
