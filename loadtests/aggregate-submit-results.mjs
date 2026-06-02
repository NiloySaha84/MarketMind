import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'loadtests/submit-aggregated';
const outFile = process.argv[3] || 'loadtests/submit-summary.json';

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

const totals = {
  shards: files.length,
  http: { requests: 0, responses: 0, codes: {} },
  vusers: { created: 0, completed: 0, failed: 0 },
  response_time_ms: { min: Infinity, max: 0, sum: 0, count: 0 },
  post_response_time_ms: { min: Infinity, max: 0, sum: 0, count: 0 },
  sources: [],
};

for (const file of files) {
  const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
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
  if (rt?.mean != null && rt.count) {
    totals.response_time_ms.min = Math.min(totals.response_time_ms.min, rt.min ?? Infinity);
    totals.response_time_ms.max = Math.max(totals.response_time_ms.max, rt.max ?? 0);
    totals.response_time_ms.sum += rt.mean * rt.count;
    totals.response_time_ms.count += rt.count;
  }

  const postRt = agg.summaries?.['plugins.metrics-by-endpoint.response_time./api/v1/business-ideas.POST'];
  if (postRt?.mean != null && postRt.count) {
    totals.post_response_time_ms.min = Math.min(totals.post_response_time_ms.min, postRt.min ?? Infinity);
    totals.post_response_time_ms.max = Math.max(totals.post_response_time_ms.max, postRt.max ?? 0);
    totals.post_response_time_ms.sum += postRt.mean * postRt.count;
    totals.post_response_time_ms.count += postRt.count;
  }
}

const submissions = totals.http.codes['201'] ?? 0;
const rateLimited = totals.http.codes['429'] ?? 0;
const serverErrors = (totals.http.codes['500'] ?? 0) + (totals.http.codes['503'] ?? 0);
const postAttempts = submissions + rateLimited + serverErrors;

const summary = {
  generated_at: new Date().toISOString(),
  test_type: 'idea_submission',
  shards: totals.shards,
  submissions: {
    created_201: submissions,
    rate_limited_429: rateLimited,
    server_errors_5xx: serverErrors,
    post_attempts: postAttempts,
    success_rate_pct: postAttempts ? Number(((submissions / postAttempts) * 100).toFixed(2)) : 0,
    estimated_queue_jobs: submissions * 2,
  },
  http: {
    requests: totals.http.requests,
    responses: totals.http.responses,
    codes: totals.http.codes,
  },
  vusers: totals.vusers,
  response_time_ms: {
    all_requests_mean: totals.response_time_ms.count
      ? Number((totals.response_time_ms.sum / totals.response_time_ms.count).toFixed(2))
      : 0,
    post_submit_mean: totals.post_response_time_ms.count
      ? Number((totals.post_response_time_ms.sum / totals.post_response_time_ms.count).toFixed(2))
      : null,
    post_submit_max: totals.post_response_time_ms.max === 0 ? null : totals.post_response_time_ms.max,
  },
  sources: totals.sources,
};

writeFileSync(outFile, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
