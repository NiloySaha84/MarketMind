import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'loadtests/aggregated';
const outFile = process.argv[3] || 'loadtests/summary.json';

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

const totals = {
  shards: files.length,
  http: { requests: 0, responses: 0, codes: {} },
  vusers: { created: 0, completed: 0, failed: 0 },
  response_time_ms: { min: Infinity, max: 0, sum: 0, count: 0, values: [] },
  sources: [],
};

for (const file of files) {
  const path = join(dir, file);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const agg = raw.aggregate ?? raw;

  totals.sources.push(file);

  totals.http.requests += agg.counters?.['http.requests'] ?? 0;
  totals.http.responses += agg.counters?.['http.responses'] ?? 0;
  totals.vusers.created += agg.counters?.['vusers.created'] ?? 0;
  totals.vusers.completed += agg.counters?.['vusers.completed'] ?? 0;
  totals.vusers.failed += agg.counters?.['vusers.failed'] ?? 0;

  for (const [key, val] of Object.entries(agg.counters ?? {})) {
    const m = key.match(/^http\.codes\.(\d+)$/);
    if (m) totals.http.codes[m[1]] = (totals.http.codes[m[1]] ?? 0) + val;
  }

  const rt = agg.summaries?.['http.response_time'];
  if (rt) {
    totals.response_time_ms.min = Math.min(totals.response_time_ms.min, rt.min ?? Infinity);
    totals.response_time_ms.max = Math.max(totals.response_time_ms.max, rt.max ?? 0);
    if (rt.mean != null && rt.count) {
      totals.response_time_ms.sum += rt.mean * rt.count;
      totals.response_time_ms.count += rt.count;
    }
  }
}

const errors = (totals.http.codes['429'] ?? 0) + (totals.http.codes['401'] ?? 0) + (totals.http.codes['403'] ?? 0) + (totals.http.codes['500'] ?? 0);
const success = totals.http.codes['200'] ?? 0;

const summary = {
  generated_at: new Date().toISOString(),
  shards: totals.shards,
  http: {
    ...totals.http,
    success_rate_pct: totals.http.responses ? Number(((success / totals.http.responses) * 100).toFixed(2)) : 0,
    error_rate_pct: totals.http.responses ? Number(((errors / totals.http.responses) * 100).toFixed(2)) : 0,
    arcjet_429_pct: totals.http.responses ? Number((((totals.http.codes['429'] ?? 0) / totals.http.responses) * 100).toFixed(2)) : 0,
  },
  vusers: totals.vusers,
  response_time_ms: {
    min: totals.response_time_ms.min === Infinity ? 0 : totals.response_time_ms.min,
    max: totals.response_time_ms.max,
    mean: totals.response_time_ms.count ? Number((totals.response_time_ms.sum / totals.response_time_ms.count).toFixed(2)) : 0,
  },
  sources: totals.sources,
};

writeFileSync(outFile, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
