export const SEARCH_FEATURE = "feature";
export const SEARCH_CONJUNCTION = "conjunction";

export interface SearchItem {
  glyph: string;
  color: string;
  ori: number;
  pos: [number, number];
  is_target: boolean;
}

export interface TrialSpec {
  condition: string;
  search_type: string;
  target_present: boolean;
  set_size: number;
  items: SearchItem[];
  target_index: number | null;
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

export class Controller {
  readonly feature_set_sizes: number[];
  readonly conjunction_set_sizes: number[];
  readonly array_radius_px: number;
  readonly array_radius_jitter_px: number;
  readonly orientation_pool: number[];
  readonly target_glyph: string;
  readonly conjunction_alt_glyph: string;
  readonly target_color: string;
  readonly distractor_color: string;
  readonly random_seed: number | null;
  readonly enable_logging: boolean;
  private readonly random: () => number;
  block_idx: number;
  trial_count_total: number;
  trial_count_block: number;
  correct_total: number;
  correct_block: number;
  timeout_total: number;
  timeout_block: number;
  correct_rt_sum_total: number;
  correct_rt_sum_block: number;
  correct_rt_n_total: number;
  correct_rt_n_block: number;

  constructor(args: {
    feature_set_sizes?: unknown;
    conjunction_set_sizes?: unknown;
    array_radius_px?: unknown;
    array_radius_jitter_px?: unknown;
    orientation_pool?: unknown;
    target_glyph?: unknown;
    conjunction_alt_glyph?: unknown;
    target_color?: unknown;
    distractor_color?: unknown;
    random_seed?: unknown;
    enable_logging?: unknown;
  }) {
    this.feature_set_sizes = cleanIntList(args.feature_set_sizes, [8, 12, 16]);
    this.conjunction_set_sizes = cleanIntList(args.conjunction_set_sizes, [8, 12, 16]);
    this.array_radius_px = Math.max(80, toFiniteNumber(args.array_radius_px, 250));
    this.array_radius_jitter_px = Math.max(0, toFiniteNumber(args.array_radius_jitter_px, 30));
    this.orientation_pool = cleanFloatList(args.orientation_pool, [0, 90, 180, 270]);
    this.target_glyph = String(args.target_glyph ?? "T");
    this.conjunction_alt_glyph = String(args.conjunction_alt_glyph ?? "L");
    this.target_color = String(args.target_color ?? "red");
    this.distractor_color = String(args.distractor_color ?? "green");
    this.random_seed =
      args.random_seed == null || Number.isNaN(Number(args.random_seed))
        ? null
        : Math.trunc(Number(args.random_seed));
    this.enable_logging = args.enable_logging !== false;
    this.random = makeSeededRandom(this.random_seed ?? Math.floor(Date.now() % 2147483647));

    this.block_idx = -1;
    this.trial_count_total = 0;
    this.trial_count_block = 0;
    this.correct_total = 0;
    this.correct_block = 0;
    this.timeout_total = 0;
    this.timeout_block = 0;
    this.correct_rt_sum_total = 0;
    this.correct_rt_sum_block = 0;
    this.correct_rt_n_total = 0;
    this.correct_rt_n_block = 0;
  }

  static from_dict(config: Record<string, unknown>): Controller {
    const cfg = config ?? {};
    return new Controller({
      feature_set_sizes: cfg.feature_set_sizes,
      conjunction_set_sizes: cfg.conjunction_set_sizes,
      array_radius_px: cfg.array_radius_px,
      array_radius_jitter_px: cfg.array_radius_jitter_px,
      orientation_pool: cfg.orientation_pool,
      target_glyph: cfg.target_glyph,
      conjunction_alt_glyph: cfg.conjunction_alt_glyph,
      target_color: cfg.target_color,
      distractor_color: cfg.distractor_color,
      random_seed: cfg.random_seed,
      enable_logging: cfg.enable_logging
    });
  }

  start_block(block_idx: number): void {
    this.block_idx = Math.trunc(block_idx);
    this.trial_count_block = 0;
    this.correct_block = 0;
    this.timeout_block = 0;
    this.correct_rt_sum_block = 0;
    this.correct_rt_n_block = 0;
  }

  next_trial_id(): number {
    return this.trial_count_total + 1;
  }

  sample_duration(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    if (Array.isArray(value) && value.length >= 2) {
      const a = toFiniteNumber(value[0], fallback);
      const b = toFiniteNumber(value[1], fallback);
      const lower = Math.min(a, b);
      const upper = Math.max(a, b);
      return Math.max(0, lower + (upper - lower) * this.random());
    }
    return Math.max(0, fallback);
  }

  parse_condition(condition: string): [string, boolean] {
    const token = String(condition ?? "")
      .trim()
      .toLowerCase();
    if (token === "feature_present") {
      return [SEARCH_FEATURE, true];
    }
    if (token === "feature_absent") {
      return [SEARCH_FEATURE, false];
    }
    if (token === "conjunction_present") {
      return [SEARCH_CONJUNCTION, true];
    }
    if (token === "conjunction_absent") {
      return [SEARCH_CONJUNCTION, false];
    }
    if (token === "feature") {
      return [SEARCH_FEATURE, true];
    }
    if (token === "conjunction") {
      return [SEARCH_CONJUNCTION, true];
    }
    if (token === "absent") {
      return [SEARCH_CONJUNCTION, false];
    }
    throw new Error(`Unsupported visual-search condition: ${condition}`);
  }

  private sampleSetSize(searchType: string): number {
    const pool = searchType === SEARCH_FEATURE ? this.feature_set_sizes : this.conjunction_set_sizes;
    const sampled = pool[Math.floor(this.random() * pool.length)];
    return Math.max(1, Math.trunc(sampled));
  }

  private samplePositions(nItems: number): Array<[number, number]> {
    const step = 360 / Math.max(1, nItems);
    const positions: Array<[number, number]> = [];
    for (let i = 0; i < nItems; i += 1) {
      const angleDeg = i * step + (this.random() * 0.5 - 0.25) * step;
      const radius =
        this.array_radius_px +
        (this.random() * 2 - 1) * this.array_radius_jitter_px;
      const clippedRadius = Math.max(80, radius);
      const theta = (angleDeg * Math.PI) / 180;
      positions.push([
        clippedRadius * Math.cos(theta),
        clippedRadius * Math.sin(theta)
      ]);
    }
    for (let i = positions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      const tmp = positions[i];
      positions[i] = positions[j];
      positions[j] = tmp;
    }
    return positions;
  }

  build_trial(condition: string): TrialSpec {
    const [searchType, targetPresent] = this.parse_condition(condition);
    const setSize = this.sampleSetSize(searchType);
    const positions = this.samplePositions(setSize);
    const targetIndex = targetPresent ? Math.floor(this.random() * setSize) : null;

    const items: SearchItem[] = positions.map((pos, idx) => {
      const isTarget = targetIndex != null && idx === targetIndex;
      let glyph = this.target_glyph;
      let color = this.target_color;
      if (!isTarget) {
        if (searchType === SEARCH_FEATURE) {
          glyph = this.target_glyph;
          color = this.distractor_color;
        } else if (this.random() < 0.5) {
          glyph = this.target_glyph;
          color = this.distractor_color;
        } else {
          glyph = this.conjunction_alt_glyph;
          color = this.target_color;
        }
      }
      const orientation = this.orientation_pool[Math.floor(this.random() * this.orientation_pool.length)];
      return {
        glyph,
        color,
        ori: Number(orientation),
        pos: [Number(pos[0]), Number(pos[1])],
        is_target: isTarget
      };
    });

    return {
      condition: String(condition),
      search_type: searchType,
      target_present: targetPresent,
      set_size: setSize,
      items,
      target_index: targetIndex
    };
  }

  evaluate_response(args: {
    response_key: string | null | undefined;
    present_key: string;
    absent_key: string;
    target_present: boolean;
  }): boolean {
    const key = String(args.response_key ?? "")
      .trim()
      .toLowerCase();
    const presentKey = String(args.present_key).trim().toLowerCase();
    const absentKey = String(args.absent_key).trim().toLowerCase();
    if (key !== presentKey && key !== absentKey) {
      return false;
    }
    return args.target_present ? key === presentKey : key === absentKey;
  }

  record_trial(args: {
    hit: boolean;
    rt_s: number | null;
    responded: boolean;
    condition: string;
  }): void {
    this.trial_count_total += 1;
    this.trial_count_block += 1;
    if (args.hit) {
      this.correct_total += 1;
      this.correct_block += 1;
      if (args.rt_s != null && Number.isFinite(args.rt_s)) {
        const rt = Math.max(0, Number(args.rt_s));
        this.correct_rt_sum_total += rt;
        this.correct_rt_sum_block += rt;
        this.correct_rt_n_total += 1;
        this.correct_rt_n_block += 1;
      }
    }
    if (!args.responded) {
      this.timeout_total += 1;
      this.timeout_block += 1;
    }

    if (this.enable_logging) {
      console.debug(
        [
          "[VisualSearch]",
          `block=${this.block_idx}`,
          `trial_block=${this.trial_count_block}`,
          `trial_total=${this.trial_count_total}`,
          `cond=${args.condition}`,
          `hit=${args.hit}`,
          `responded=${args.responded}`,
          `rt=${args.rt_s}`
        ].join(" ")
      );
    }
  }
}

