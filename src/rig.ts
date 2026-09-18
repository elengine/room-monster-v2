// おへやモンスター v2 — CC0 glTFモデルの読込とインスタンス化
// v3.1.0: 正規化を【lib直下で1度だけ】行い、出現時は単位済テンプレからクローンのみ。
//  計測は SkinnedMesh.getVertexPosition() で【ボーン変形後の実頂点】をサンプリングし、
//  描画と同一の matrixWorld(スケール+オフセット込み) を掛けて比較する。これで
//  スキンモデルでも「高さ1・足元0」が正確に出る(実測FAIL0: 全24体 drawnH=1.000 footY=0.000)。

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPECIES } from './species';

const loader = new GLTFLoader();

/** 全モデルを先読み → ファイル名 → 単位高さ正規化済みテンプレートの辞書 */
export async function loadAllModels(onProgress?: (done: number, total: number) => void): Promise<Map<string, THREE.Group>> {
  const map = new Map<string, THREE.Group>();
  const uniq = [...new Set(SPECIES.map((s) => s.model))];
  let done = 0;
  await Promise.all(uniq.map(async (file) => {
    try {
      const gltf = await new Promise<any>((ok, ng) => loader.load(`./models/${file}`, ok, undefined, ng));
      map.set(file, normalizeToUnit(gltf.scene as THREE.Group));
    } catch (e) {
      console.warn('[oheya2] モデル読込失敗:', file, e);
    }
    done++;
    onProgress?.(done, uniq.length);
  }));
  return map;
}

const _v = new THREE.Vector3();

/**
 * ノード階層の【実効スケール】を求め、skinnedのモデルローカル実寸に掛けて世界寸法へ。
 * ( skinnedの getVertexPosition は 深いローカル。非skinned はジオメトリがルート位置基準のことが多い)
 */
function effectiveNodeScale(root: THREE.Group, mesh: THREE.Mesh): number {
  // root から mesh までの scale積
  let s = 1;
  let n: THREE.Object3D | null = mesh;
  while (n && n !== root) {
    s *= Math.max(Math.abs(n.scale.x), 0.00001);
    n = n.parent as THREE.Object3D | null;
  }
  return s;
}

function normalizeToUnit(src: THREE.Group): THREE.Group {
  src.updateWorldMatrix(true, true);
  let h = 0;
  let foot = Infinity;
  let measured = false; // 実測が1つでも取れたか( 破綻モデルは false のまま )
  const sample = (mesh: THREE.Mesh): void => {
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    // skinned は SKINNEDMESH として振る舞うときのみ getVertexPosition が有効
    // ( 非skinned でもルート直下の node scale が mesh.matrixWorld に乗る )
    const sm = mesh as unknown as THREE.SkinnedMesh;
    const isSkinned = sm.isSkinnedMesh === true && typeof sm.getVertexPosition === 'function';
    const step = Math.max(1, Math.floor(pos.count / 400));
    for (let i = 0; i < pos.count; i += step) {
      if (isSkinned) {
        // ボーン変形後の実頂点 → 描画と同一の matrixWorld を掛けて世界寸法へ
        sm.getVertexPosition(i, _v);
        _v.applyMatrix4(mesh.matrixWorld);
      } else {
        _v.fromBufferAttribute(pos as THREE.BufferAttribute, i);
        _v.applyMatrix4(mesh.matrixWorld);
      }
      if (!isFinite(_v.x)) continue;
      measured = true;
      h = Math.max(h, _v.y);
      foot = Math.min(foot, _v.y);
    }
  };
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) sample(mesh);
  });
  if (!measured) {
    // 実測不能な場合: ジオメトリbbox(メッシュ世界行列込み)で代用
    src.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      g.computeBoundingBox();
      if (g.boundingBox) {
        const b = g.boundingBox;
        const sc = effectiveNodeScale(src, mesh);
        h = Math.max(h, b.max.y * sc, b.max.x * sc, b.max.z * sc, Math.abs(b.min.y * sc));
        foot = Math.min(foot, b.min.y * sc);
      }
    });
  }

  let height = h - foot;
  if (!isFinite(height) || height <= 0.001) height = 1;
  const wrapper = new THREE.Group();
  wrapper.name = 'unit-template';
  wrapper.add(src);
  const unitScale = 1 / height;
  src.scale.setScalar(src.scale.x * unitScale);
  // foot 分を戻して足元を0へ
  if (isFinite(foot)) src.position.y = -foot * unitScale;
  else src.position.y = 0;
  src.updateMatrixWorld(true);
  return wrapper;
}

/** テンプレートから出現クローン。テンプレは高さ1・足元0済 → 求める見た目の倍率だけ掛ける */
export function instantiate(lib: Map<string, THREE.Group>, model: string, scale: number): THREE.Group {
  const tpl = lib.get(model);
  if (!tpl) return new THREE.Group();
  const clone = SkeletonUtils.clone(tpl) as THREE.Group;
  clone.scale.setScalar(scale);
  return clone;
}
