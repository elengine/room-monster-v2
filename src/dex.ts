// おへやモンスター v2 — 図鑑(localStorage永続) + 統計(ゲット数/逃げた回数)

const KEY = 'oheya2:dex';

export type DexEntry = { got: number; fled: number };

export function loadDex(): Record<string, DexEntry> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, DexEntry>; }
  catch { return {}; }
}

function save(d: Record<string, DexEntry>): void {
  localStorage.setItem(KEY, JSON.stringify(d));
}

/** 図鑑を全消去( 確認ダイアログは呼び出し側で ) */
export function clearDex(): void {
  localStorage.removeItem(KEY);
}

export function recordCatch(id: string): void {
  const d = loadDex();
  const e = d[id] ?? { got: 0, fled: 0 };
  e.got++;
  d[id] = e;
  save(d);
}

export function recordFlee(id: string): void {
  const d = loadDex();
  const e = d[id] ?? { got: 0, fled: 0 };
  e.fled++;
  d[id] = e;
  save(d);
}

export function totalCaught(): number {
  return Object.values(loadDex()).reduce((a, e) => a + e.got, 0);
}
