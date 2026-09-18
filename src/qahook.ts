// 実機用診断: ゲーム画面を20秒置いて監視し、
// spawn時の位置/スケール/投影(画面内外)/カメラ距離/カメラ向き を console へ出力する
// 使い方: ゲームを開始 → このスクリプトは常時consoleへデバッグを吐く(本番にも同梱軽量)
import * as THREE from 'three';

// main.ts 側に hook を追加済み。実機の console 出力を kokuten に共有して頂くフローを想定
declare global {
  interface Window { __qaDump?: () => string }
}
export function installFieldObserver(scene: THREE.Scene, camera: THREE.PerspectiveCamera, getMonsters: () => unknown[]): void {
  const w = window as unknown as { __qaDump?: () => string };
  w.__qaDump = (): string => {
    const M = getMonsters() as Array<{ ref: { id: string }; root: THREE.Group; state: string }>;
    const list = M.map((m) => {
      const p = m.root.getWorldPosition(new THREE.Vector3());
      const s = m.root.getWorldScale(new THREE.Vector3());
      const ndc = p.clone().project(camera);
      const inView = ndc.x > -1 && ndc.x < 1 && ndc.y > -1 && ndc.y < 1;
      return `${m.ref.id}@${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} s=${s.x.toFixed(2)} ${inView ? 'IN' : 'OUT'} ndc=${ndc.x.toFixed(1)},${ndc.y.toFixed(1)}`;
    });
    return `n=${M.length} cam=${camera.position.toArray().map((v) => v.toFixed(1)).join(',')} rotated=${camera.quaternion.toArray().map((v) => v.toFixed(2)).join(',')} :: ${list.join(' | ') || '(none)'}`;
  };
}
