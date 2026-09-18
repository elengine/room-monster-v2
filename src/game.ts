// おへやモンスター v2 — GameField: 3Dシーン(1枚のキャンバス) + Rapier物理
// カメラ映像は VideoTexture で背景に統合し、HUDはDOMでJSから毎フレーム強制表示。

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

export class GameField {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 40);
  renderer: THREE.WebGLRenderer;
  world: RAPIER.World | null = null;
  grid: THREE.GridHelper;
  private ghosts: THREE.Group;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 1.35, 2.1);
    this.camera.lookAt(0, 0.55, 0);

    // ライティング(HDRI 替りに Hemisphere+平行光の高品質ライティング)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.85);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff2dd, 1.5);
    dir.position.set(2, 4, 1);
    dir.castShadow = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(dir);

    // 物理世界
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // 地面の物理床 + 仮想マス目(表示ON/OFF設定可)
    this.grid = new THREE.GridHelper(8, 16, 0x7cf0ff, 0x4f8bff);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.5;
    this.grid.position.y = 0.02;
    this.scene.add(this.grid);

    this.ghosts = new THREE.Group();
    this.scene.add(this.ghosts);
  }

  onResize(): void {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** カメラ映像を3Dシーン背景へ統合(Androidのメディアオーバーレイ対策) */
  setVideoBackground(video: HTMLVideoElement): void {
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    video.style.display = 'none'; // DOM重ね置きをやめる
  }

  /** 床マス目の表示切替 */
  setGridVisible(v: boolean): void {
    this.grid.visible = v;
  }

  render(dt: number): void {
    if (this.world) this.world.step();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
