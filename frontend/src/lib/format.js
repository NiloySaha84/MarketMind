// market_size & five_year_projection are expressed in MILLIONS of USD.
export function formatMoneyFromMillions(valueInMillions) {
  if (valueInMillions == null || Number.isNaN(Number(valueInMillions))) return '—';
  const millions = Number(valueInMillions);
  if (millions >= 1_000_000) return `$${(millions / 1_000_000).toFixed(2)}T`;
  if (millions >= 1_000) return `$${(millions / 1_000).toFixed(millions >= 10_000 ? 1 : 2)}B`;
  if (millions >= 1) return `$${millions.toFixed(millions >= 100 ? 0 : 1)}M`;
  return `$${(millions * 1000).toFixed(0)}K`;
}

export function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}%`;
}

export function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function formatRelative(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

// strengths/weaknesses may arrive as an array, a string, or null.
export function toBulletList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    // split on sentence/semicolon boundaries for nicer display
    return value
      .split(/;|\n|•/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function getDomain(url) {
  if (!url) return '';
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// Aggregate possibly-multiple market_analysis rows into one representative set.
export function pickMarketAnalysis(marketAnalysis = []) {
  const rows = ensureArray(marketAnalysis);
  if (rows.length === 0) return null;
  const withData = rows.find(
    (m) => m.market_size != null || m.five_year_projection != null || m.growth_per_year != null
  );
  return withData || rows[0];
}
