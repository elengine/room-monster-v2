// おへやモンスター v2 — 種別定義: 10種+レア+シークレット(計12枠)
// 動きの種類: breathe=サイズ変化 / stretch=伸び縮み / hop=左右跳ね / fly=飛行

export type Motion = 'breathe' | 'stretch' | 'hop' | 'fly';
export type Rarity = 'normal' | 'rare' | 'secret';

export type Species = {
  id: string;
  name: string;
  model: string;      // public/models/ 内のファイル名
  rarity: Rarity;
  motion: Motion;
  scale: number;      // 出現スケール
  tier: number;       // 強さ 1〜3 (ゲット率と出現頻度に影響)
  color: number;      // 図鑑のドット色
};

// レア: 少しだけ希少 / シークレット: 図鑑では隠し枠・最も希少
export const SPECIES: Species[] = [
  { id: 'pinta', name: 'ピンタ', model: 'minion-a01.glb', rarity: 'normal', motion: 'breathe', scale: 0.55, tier: 1, color: 0x7cf0ff },
  { id: 'golon', name: 'ゴロン', model: 'Rhino.glb', rarity: 'normal', motion: 'stretch', scale: 0.6, tier: 2, color: 0xffb066 },
  { id: 'kabano', name: 'カバノ', model: 'Hippo.glb', rarity: 'normal', motion: 'breathe', scale: 0.6, tier: 1, color: 0xff88aa },
  { id: 'jaws', name: 'ジョーズ', model: 'Shark.glb', rarity: 'normal', motion: 'fly', scale: 0.55, tier: 2, color: 0x66aaff },
  { id: 'kogi', name: 'コーギ', model: 'Corgi.glb', rarity: 'normal', motion: 'hop', scale: 0.5, tier: 1, color: 0xffcc55 },
  { id: 'kamin', name: 'カミン', model: 'Carnotaurus.glb', rarity: 'normal', motion: 'stretch', scale: 0.65, tier: 2, color: 0xffaa55 },
  { id: 'chibi', name: 'チビラ', model: 'minion-b01.glb', rarity: 'normal', motion: 'hop', scale: 0.45, tier: 1, color: 0xaaffaa },
  { id: 'mochi', name: 'モチモン', model: 'minion-c01.glb', rarity: 'normal', motion: 'breathe', scale: 0.5, tier: 1, color: 0xffff88 },
  { id: 'pukupuku', name: 'プクプク', model: 'minion-d01.glb', rarity: 'normal', motion: 'stretch', scale: 0.5, tier: 2, color: 0x88ffdd },
  { id: 'pinto', name: 'ピント', model: 'minion-a02.glb', rarity: 'normal', motion: 'hop', scale: 0.5, tier: 1, color: 0xdd99ff },
  { id: 'tyrant', name: 'ティラント', model: 'Trex.glb', rarity: 'rare', motion: 'breathe', scale: 0.75, tier: 3, color: 0xff7755 },
  { id: 'shadow', name: 'シャドーン', model: 'Bat.glb', rarity: 'secret', motion: 'fly', scale: 0.6, tier: 3, color: 0x554466 },
];

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id);
}

/** 出現ロール: normal 100% / rare 約6% / secret 約2% */
export function rollSpecies(r: number): Species {
  const all = SPECIES as Species[];
  const secret = all[11] as Species;
  const rare = all[10] as Species;
  if (r < 0.02) return secret; // シークレット
  if (r < 0.08) return rare;   // レア
  const n = 10; // 通常10種
  const k = Math.min(n - 1, Math.floor(((r - 0.08) / 0.92) * n));
  return all[k] as Species;
}
