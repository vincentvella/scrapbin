// Pure part helpers (no native imports), so `bun test` can run them.

export const CATEGORIES = [
  'resistor',
  'capacitor',
  'IC',
  'LED',
  'transistor',
  'diode',
  'inductor',
  'connector',
  'module',
  'sensor',
  'switch',
  'hardware',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export type DetectedPart = {
  name: string;
  category: Category;
  value: string | null;
  package: string | null;
  quantity: number;
  quantityIsEstimate: boolean;
  confidence: Confidence;
  notes: string | null;
};

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/[ωΩ]|ohms?/g, '') // toLowerCase turns Ω into ω
    .replace(/[\s\-_]+/g, '');

const HARDWARE_TYPES: [RegExp, string][] = [
  [/standoff/i, 'standoff'],
  [/spacer/i, 'spacer'],
  [/washer/i, 'washer'],
  [/\bnut\b/i, 'nut'],
  [/screw/i, 'screw'],
  [/bolt/i, 'bolt'],
  [/rivet/i, 'rivet'],
  [/heat.?shrink/i, 'heat-shrink'],
  [/zip.?tie|cable tie/i, 'zip-tie'],
  [/\bwire\b/i, 'wire'],
];
/** The kind of hardware a name describes ("Socket cap screw" -> "screw"), or null. */
export const hardwareType = (name: string) => HARDWARE_TYPES.find(([re]) => re.test(name))?.[1] ?? null;

// "M2 x 8mm", "M2×8", "8.0mm" -> "m2x8", "8"
const size = (v: string) => norm(v).replace(/[×*]/g, 'x').replace(/\.0+(?=\D|$)/g, '').replace(/mm$/, '');

/** Two parts are the same inventory entry when this key matches ("10kΩ" == "10K ohm"). */
export function partKey(p: { category: string; name: string; value?: string | null; package?: string | null }) {
  // Hardware matches on type + size: head style, material and wording vary between scans of the same screws.
  const type = p.category === 'hardware' && p.value?.trim() ? hardwareType(p.name) : null;
  if (type) return ['hardware', type, size(p.value!)].join('|');
  return [p.category, norm(p.name), norm(p.value), norm(p.package)].join('|');
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Validate model output (a trust boundary): drop malformed rows, coerce fields. */
export function parseDetectedParts(raw: string): DetectedPart[] {
  const data: unknown = JSON.parse(raw);
  const rows = (data as { parts?: unknown })?.parts;
  if (!Array.isArray(rows)) throw new Error('Model reply had no parts list');
  return rows.flatMap((r): DetectedPart[] => {
    const name = str(r?.name);
    if (!name) return [];
    const quantity = Math.max(1, Math.round(Number(r.quantity) || 1));
    return [
      {
        name,
        category: CATEGORIES.includes(r.category) ? r.category : 'other',
        value: str(r.value),
        package: str(r.package),
        quantity,
        quantityIsEstimate: r.quantityIsEstimate === true,
        confidence: CONFIDENCES.includes(r.confidence) ? r.confidence : 'low',
        notes: str(r.notes),
      },
    ];
  });
}

// Thousands by hand: Basalt's Hermes may be built without Intl.
export const formatCount = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`;

/** The rows a save will actually store, and the button label that counts them (kinds and units). */
export function saveSummary<T extends { name: string; quantity: number }>(rows: T[]) {
  const items = rows.filter((r) => r.name.trim() && r.quantity > 0);
  const units = items.reduce((n, r) => n + r.quantity, 0);
  return { items, label: items.length ? `Save ${plural(items.length, 'kind')} · ${plural(units, 'part')}` : 'Nothing to save' };
}

type PartLike = { category: string; name: string; value?: string | null; package?: string | null };

const STOP = new Set(['with', 'and', 'the', 'for', 'of', 'style', 'type', 'pcs', 'module']);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 1 && !STOP.has(w)));

/** The inventory part this item will add to automatically (same key), if any. */
export const exactMatch = <P extends PartLike>(item: PartLike, inventory: P[]) => {
  const key = partKey(item);
  return inventory.find((p) => partKey(p) === key) ?? null;
};

/**
 * Inventory parts that are probably the same thing worded differently ("Membrane keypad 4x4" vs
 * "4x4 membrane matrix keypad"): same category, overlapping name words, and no conflicting value.
 */
export function similarParts<P extends PartLike>(item: PartLike, inventory: P[], limit = 3): P[] {
  const key = partKey(item);
  const a = words(item.name);
  return inventory
    .filter((p) => p.category === item.category && partKey(p) !== key)
    .filter((p) => !(norm(item.value) && norm(p.value) && norm(item.value) !== norm(p.value))) // 1kΩ is not 10kΩ
    .map((p) => {
      const b = words(p.name);
      const shared = [...a].filter((w) => b.has(w)).length;
      return { p, score: shared / (a.size + b.size - shared || 1) };
    })
    .filter((x) => x.score >= 0.4)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.p);
}

/** The match to pre-select: a similar part with the identical name (only details like the package differ). */
export function defaultTarget<P extends PartLike & { id: number }>(item: PartLike, inventory: P[]) {
  const same = similarParts(item, inventory).find((p) => norm(p.name) === norm(item.name));
  return same ? { partId: same.id, mode: 'add' as const } : undefined;
}

/** Display names for category headings. */
export const CATEGORY_LABELS: Record<Category, string> = {
  resistor: 'Resistors',
  capacitor: 'Capacitors',
  IC: 'ICs',
  LED: 'LEDs',
  transistor: 'Transistors',
  diode: 'Diodes',
  inductor: 'Inductors',
  connector: 'Connectors',
  module: 'Modules',
  sensor: 'Sensors',
  switch: 'Switches',
  hardware: 'Hardware',
  other: 'Other',
};
