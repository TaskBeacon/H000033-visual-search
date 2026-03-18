interface SummaryRow {
  search_array_hit?: unknown;
  search_array_rt?: unknown;
  timed_out?: unknown;
  block_id?: unknown;
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

