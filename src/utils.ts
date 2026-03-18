export const SEARCH_FEATURE = "feature";
export const SEARCH_CONJUNCTION = "conjunction";

const DEFAULT_CONDITIONS = [
  "feature_present",
  "feature_absent",
  "conjunction_present",
  "conjunction_absent"
] as const;

const CANONICAL_CONDITIONS = new Set<string>(DEFAULT_CONDITIONS);

export interface SearchItem {
  glyph: string;
  color: string;
  ori: number;
  pos: [number, number];
  is_target: boolean;
}

export interface TrialSpec {
  condition: string;
  condition_id: string;
  search_type: string;
  target_present: boolean;
  set_size: number;
  items: SearchItem[];
  target_index: number | null;
}

interface SummaryRow {
  search_array_hit?: unknown;
  search_array_rt?: unknown;
  timed_out?: unknown;
  block_id?: unknown;
}

function makeSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanIntList(values: unknown, fallback: number[]): number[] {
  if (Array.isArray(values)) {
    const out = values
      .map((value) => Math.trunc(Number(value)))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (out.length > 0) {
      return out;
    }
  }
  return [...fallback];
}

function cleanFloatList(values: unknown, fallback: number[]): number[] {
  if (Array.isArray(values)) {
    const out = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (out.length > 0) {
      return out;
    }
  }
  return [...fallback];
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "y"].includes(String(value ?? "").trim().toLowerCase());
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCondition(condition: unknown): string {
  const token = String(condition ?? "").trim().toLowerCase();
  if (!token) {
    return "feature_present";
  }
  if (CANONICAL_CONDITIONS.has(token)) {
    return token;
  }
  return "feature_present";
}

function parseCondition(condition: string): [string, boolean] {
  const token = String(condition ?? "").trim().toLowerCase();
  const mapping: Record<string, [string, boolean]> = {
    feature_present: [SEARCH_FEATURE, true],
    feature_absent: [SEARCH_FEATURE, false],
    conjunction_present: [SEARCH_CONJUNCTION, true],
    conjunction_absent: [SEARCH_CONJUNCTION, false],
    feature: [SEARCH_FEATURE, true],
    conjunction: [SEARCH_CONJUNCTION, true],
    absent: [SEARCH_CONJUNCTION, false]
  };
  const value = mapping[token];
  if (!value) {
    throw new Error(`Unsupported visual-search condition: ${condition}`);
  }
  return value;
}

function trialRng(args: {
  blockSeed: number | null;
  trialId: number | string;
  condition: string;
  randomSeed: number | null;
}): () => number {
  const base =
    args.randomSeed != null
      ? Math.trunc(args.randomSeed)
      : args.blockSeed != null
        ? Math.trunc(args.blockSeed)
        : 0;
  const condition = String(args.condition).trim().toLowerCase();
  let condOffset = 99;
  if (condition === "feature_present") {
    condOffset = 11;
  } else if (condition === "feature_absent") {
    condOffset = 12;
  } else if (condition === "conjunction_present") {
    condOffset = 21;
  } else if (condition === "conjunction_absent") {
    condOffset = 22;
  }
  const numericTrialId = Number(args.trialId);
  const trialId = Number.isFinite(numericTrialId) ? Math.trunc(numericTrialId) : 0;
  const mixedSeed = (base * 1000003 + trialId * 97 + condOffset) >>> 0;
  return makeSeededRandom(mixedSeed);
}

function samplePositions(
  rng: () => number,
  nItems: number,
  arrayRadiusPx: number,
  arrayRadiusJitterPx: number
): Array<[number, number]> {
  const step = 360 / Math.max(1, nItems);
  const positions: Array<[number, number]> = [];
  for (let idx = 0; idx < nItems; idx += 1) {
    const angleDeg = idx * step + (rng() * 0.5 - 0.25) * step;
    const radius = arrayRadiusPx + (rng() * 2 - 1) * arrayRadiusJitterPx;
    const clippedRadius = Math.max(80, radius);
    const theta = (angleDeg * Math.PI) / 180;
    positions.push([clippedRadius * Math.cos(theta), clippedRadius * Math.sin(theta)]);
  }
  for (let idx = positions.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(rng() * (idx + 1));
    const tmp = positions[idx];
    positions[idx] = positions[swapIdx];
    positions[swapIdx] = tmp;
  }
  return positions;
}

function buildSearchItems(args: {
  rng: () => number;
  searchType: string;
  targetPresent: boolean;
  setSize: number;
  positions: Array<[number, number]>;
  targetGlyph: string;
  conjunctionAltGlyph: string;
  targetColor: string;
  distractorColor: string;
  orientationPool: number[];
}): { items: SearchItem[]; targetIndex: number | null } {
  const targetIndex = args.targetPresent ? Math.floor(args.rng() * args.setSize) : null;
  const items = args.positions.map((pos, idx) => {
    const isTarget = targetIndex != null && idx === targetIndex;
    let glyph = args.targetGlyph;
    let color = args.targetColor;

    if (!isTarget) {
      if (args.searchType === SEARCH_FEATURE) {
        glyph = args.targetGlyph;
        color = args.distractorColor;
      } else if (args.rng() < 0.5) {
        glyph = args.targetGlyph;
        color = args.distractorColor;
      } else {
        glyph = args.conjunctionAltGlyph;
        color = args.targetColor;
      }
    }

    const orientation = args.orientationPool[Math.floor(args.rng() * args.orientationPool.length)];
    const position: [number, number] = [Number(pos[0]), Number(pos[1])];
    return {
      glyph,
      color,
      ori: Number(orientation),
      pos: position,
      is_target: isTarget
    };
  });

  return { items, targetIndex };
}

export function buildVisualSearchTrialSpec(options: {
  condition: string;
  trialId: number | string;
  blockSeed?: number | null;
  generationConfig?: Record<string, unknown> | null;
}): TrialSpec {
  const cfg = dictFromOptions(options.generationConfig);
  const token = normalizeCondition(options.condition);
  const randomSeed = toNumberOrNull(cfg.random_seed);
  const rng = trialRng({
    blockSeed: options.blockSeed ?? null,
    trialId: options.trialId,
    condition: token,
    randomSeed
  });

  const [searchType, targetPresent] = parseCondition(token);
  const featureSetSizes = cleanIntList(cfg.feature_set_sizes, [8, 12, 16]);
  const conjunctionSetSizes = cleanIntList(cfg.conjunction_set_sizes, [8, 12, 16]);
  const setSizePool = searchType === SEARCH_FEATURE ? featureSetSizes : conjunctionSetSizes;
  const setSize = Math.max(1, Math.trunc(setSizePool[Math.floor(rng() * setSizePool.length)]));

  const arrayRadiusPx = Math.max(80, toFiniteNumber(cfg.array_radius_px, 245));
  const arrayRadiusJitterPx = Math.max(0, toFiniteNumber(cfg.array_radius_jitter_px, 25));
  const positions = samplePositions(rng, setSize, arrayRadiusPx, arrayRadiusJitterPx);

  const orientationPool = cleanFloatList(cfg.orientation_pool, [0, 90, 180, 270]);
  const targetGlyph = String(cfg.target_glyph ?? "T");
  const conjunctionAltGlyph = String(cfg.conjunction_alt_glyph ?? "L");
  const targetColor = String(cfg.target_color ?? "red");
  const distractorColor = String(cfg.distractor_color ?? "green");
  const { items, targetIndex } = buildSearchItems({
    rng,
    searchType,
    targetPresent,
    setSize,
    positions,
    targetGlyph,
    conjunctionAltGlyph,
    targetColor,
    distractorColor,
    orientationPool
  });

  if (Boolean(cfg.enable_logging ?? true)) {
    console.debug(
      [
        "[VisualSearch]",
        `condition=${token}`,
        `trial_id=${String(options.trialId)}`,
        `set_size=${setSize}`,
        `target_present=${String(targetPresent)}`
      ].join(" ")
    );
  }

  const numericTrialId = Number(options.trialId);
  const trialId = Number.isFinite(numericTrialId) ? Math.trunc(numericTrialId) : 0;
  return {
    condition: token,
    condition_id: `${token}_trial_${String(trialId).padStart(3, "0")}`,
    search_type: searchType,
    target_present: targetPresent,
    set_size: setSize,
    items,
    target_index: targetIndex
  };
}

function dictFromOptions(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" ? { ...value } : {};
}

function summarize(rows: SummaryRow[]): {
  total_trials: number;
  accuracy: number;
  accuracy_pct: string;
  mean_rt_ms: string;
  timeout_count: number;
} {
  if (rows.length === 0) {
    return {
      total_trials: 0,
      accuracy: 0,
      accuracy_pct: "0.0%",
      mean_rt_ms: "0",
      timeout_count: 0
    };
  }
  let correct = 0;
  let timeoutCount = 0;
  let rtSum = 0;
  let rtCount = 0;

  for (const row of rows) {
    const hit = toBool(row.search_array_hit);
    if (hit) {
      correct += 1;
      const rt = toNumberOrNull(row.search_array_rt);
      if (rt != null) {
        rtSum += rt;
        rtCount += 1;
      }
    }
    if (toBool(row.timed_out)) {
      timeoutCount += 1;
    }
  }

  const accuracy = correct / rows.length;
  const meanRtMs = rtCount > 0 ? (rtSum / rtCount) * 1000 : 0;
  return {
    total_trials: rows.length,
    accuracy,
    accuracy_pct: `${(accuracy * 100).toFixed(1)}%`,
    mean_rt_ms: String(Math.round(meanRtMs)),
    timeout_count: timeoutCount
  };
}

export function summarizeBlock(
  reducedRows: Record<string, unknown>[],
  blockId: string
): {
  total_trials: number;
  accuracy: number;
  accuracy_pct: string;
  mean_rt_ms: string;
  timeout_count: number;
} {
  const rows = reducedRows.filter((row) => String(row.block_id ?? "") === blockId) as SummaryRow[];
  return summarize(rows);
}

export function summarizeOverall(
  reducedRows: Record<string, unknown>[]
): {
  total_trials: number;
  accuracy: number;
  accuracy_pct: string;
  mean_rt_ms: string;
  timeout_count: number;
} {
  return summarize(reducedRows as SummaryRow[]);
}
