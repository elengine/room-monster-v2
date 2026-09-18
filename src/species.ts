// おへやモンスター v2 — 種別定義: 通常22種+レア+シークレット(計24枠)
// 動きの種類: breathe=サイズ変化 / stretch=伸び縮み / hop=左右跳ね / fly=飛行(揺らぎ無し=浮遊, sway=左右飛行, drift=ふわふわ)

export type Motion = 'breathe' | 'stretch' | 'hop' | 'fly' | 'sway' | 'drift';
export type Rarity = 'normal' | 'rare' | 'secret';

export type Species = {
  id: string;
  name: string;
  model: string;
  rarity: Rarity;
  motion: Motion;
  scale: number;
  tier: number;
  color: number;
};

// レア: 少しだけ希少 / シークレット: 図鑑では隠し枠・最も希少
export const SPECIES: Species[] = [
  // ── 通常22種 ──
  { id: 'pinta', name: 'ピンタ', model: 'minion-a01.glb', rarity: 'normal', motion: 'breathe', scale: 0.55, tier: 1, color: 0x7cf0ff },
  { id: 'golon', name: 'ゴロン', model: 'Rhino.glb', rarity: 'normal', motion: 'stretch', scale: 0.6, tier: 2, color: 0xffb066 },
  { id: 'kabano', name: 'カバノ', model: 'Hippo.glb', rarity: 'normal', motion: 'breathe', scale: 0.6, tier: 1, color: 0xff88aa },
  { id: 'chibi', name: 'チビラ', model: 'minion-b01.glb', rarity: 'normal', motion: 'hop', scale: 0.45, tier: 1, color: 0xaaffaa },
  { id: 'mochi', name: 'モチモン', model: 'minion-c01.glb', rarity: 'normal', motion: 'breathe', scale: 0.5, tier: 1, color: 0xffff88 },
  { id: 'pukupuku', name: 'プクプク', model: 'minion-d01.glb', rarity: 'normal', motion: 'stretch', scale: 0.5, tier: 2, color: 0x88ffdd },
  { id: 'pinto', name: 'ピント', model: 'minion-a02.glb', rarity: 'normal', motion: 'hop', scale: 0.5, tier: 1, color: 0xdd99ff },
  { id: 'kogi', name: 'コーギ', model: 'Corgi.glb', rarity: 'normal', motion: 'hop', scale: 0.5, tier: 1, color: 0xffcc55 },
  { id: 'kamin', name: 'カミン', model: 'Carnotaurus.glb', rarity: 'normal', motion: 'stretch', scale: 0.65, tier: 2, color: 0xffaa55 },
  { id: 'mossan', name: 'モッサン', model: 'Stegosaurus.glb', rarity: 'normal', motion: 'breathe', scale: 0.65, tier: 2, color: 0x99ee88 },
  { id: 'tsunoo', name: 'ツノオー', model: 'Triceratops.glb', rarity: 'normal', motion: 'stretch', scale: 0.65, tier: 2, color: 0xffcc77 },
  { id: 'koban', name: 'コバン', model: 'Ankylosaurus.glb', rarity: 'normal', motion: 'breathe', scale: 0.6, tier: 2, color: 0xccee55 },
  { id: 'chirin', name: 'チリン', model: 'Oviraptor.glb', rarity: 'normal', motion: 'hop', scale: 0.5, tier: 1, color: 0xffdd66 },
  { id: 'dekopon', name: 'デコポン', model: 'Pachycephalosaurus.glb', rarity: 'normal', motion: 'breathe', scale: 0.6, tier: 2, color: 0xffaa99 },
  { id: 'kanon', name: 'カノン', model: 'minion-b02.glb', rarity: 'normal', motion: 'breathe', scale: 0.5, tier: 1, color: 0x88ffcc },
  { id: 'marumaro', name: 'マルマロ', model: 'minion-c02.glb', rarity: 'normal', motion: 'hop', scale: 0.5, tier: 1, color: 0xffaa55 },
  { id: 'ruriri', name: 'ルリリ', model: 'minion-d02.glb', rarity: 'normal', motion: 'stretch', scale: 0.5, tier: 2, color: 0xaaddff },
  // ── 空飛ぶ系( fly 系: 通常で約30% ) ──
  { id: 'jaws', name: 'ジョーズ', model: 'Shark.glb', rarity: 'normal', motion: 'sway', scale: 0.55, tier: 2, color: 0x66aaff },
  { id: 'kurage', name: 'クラレ', model: 'Jellyfish.glb', rarity: 'normal', motion: 'drift', scale: 0.5, tier: 2, color: 0xffaadd },
  { id: 'spino', name: 'スピノン', model: 'Spinosaurus.glb', rarity: 'normal', motion: 'breathe', scale: 0.65, tier: 2, color: 0x77ccdd },
  { id: 'plesio', name: 'プレシオン', model: 'Plesiosaurus.glb', rarity: 'normal', motion: 'sway', scale: 0.6, tier: 2, color: 0x88bbff },
  { id: 'pteran', name: 'プテラン', model: 'Pterodactylus.glb', rarity: 'normal', motion: 'fly', scale: 0.6, tier: 2, color: 0xddccff },
  // ── レア ──
  { id: 'tyrant', name: 'ティラント', model: 'Trex.glb', rarity: 'rare', motion: 'breathe', scale: 0.75, tier: 3, color: 0xff7755 },
  // ── シークレット( 隠し枠 ) ──
  { id: 'shadow', name: 'シャドーン', model: 'Bat.glb', rarity: 'secret', motion: 'drift', scale: 0.6, tier: 3, color: 0x554466 },
];

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id);
}

/** 出現ロール: normal 100% / rare 約6% / secret 約2%。通常22種(fly系5種を含む)から選ぶ */
export function rollSpecies(r: number): Species {
  const all = SPECIES as Species[];
  const secret = all[23] as Species;
  const rare = all[22] as Species;
  if (r < 0.02) return secret; // シークレット
  if (r < 0.08) return rare;   // レア
  const normal = all.slice(0, 22); // 通常22種
  const k = Math.min(normal.length - 1, Math.floor(((r - 0.08) / 0.92) * normal.length));
  return normal[k] as Species;
}
