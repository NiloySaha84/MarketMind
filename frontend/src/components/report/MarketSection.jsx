import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { BarChart3, TrendingUp, Target, CalendarClock, Coins } from 'lucide-react';
import { formatMoneyFromMillions, formatPercent, pickMarketAnalysis } from '../../lib/format.js';

export default function MarketSection({ marketAnalysis = [] }) {
  const market = pickMarketAnalysis(marketAnalysis);

  const series = useMemo(() => {
    if (!market) return [];
    const start = Number(market.market_size);
    const end = Number(market.five_year_projection);
    const growth = Number(market.growth_per_year);
    const thisYear = new Date().getFullYear();

    if (!Number.isFinite(start) && !Number.isFinite(end)) return [];

    // chart: year 0–5, compound growth if we have it
    const base = Number.isFinite(start) ? start : end / Math.pow(1 + (growth || 0) / 100, 5);
    const points = [];
    for (let y = 0; y <= 5; y++) {
      let value;
      if (Number.isFinite(growth) && growth) {
        value = base * Math.pow(1 + growth / 100, y);
      } else if (Number.isFinite(start) && Number.isFinite(end)) {
        value = start + ((end - start) * y) / 5;
      } else {
        value = base;
      }
      points.push({ year: thisYear + y, label: y === 0 ? 'Now' : `+${y}y`, value: Math.round(value) });
    }
    // last point = five_year_projection when set
    if (Number.isFinite(end)) points[5].value = Math.round(end);
    return points;
  }, [market]);

  const hasData =
    market &&
    (market.market_size != null ||
      market.five_year_projection != null ||
      market.growth_per_year != null);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-500/15 text-accent-300">
          <BarChart3 size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-white" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
            Market analysis
          </h2>
          <p className="text-xs text-white/45">
            {hasData ? 'Estimates grounded in live web research' : 'Awaiting market data'}
          </p>
        </div>
      </div>

      {!hasData ? (
        <p className="py-8 text-center text-white/45">No market analysis data available yet.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              icon={Target}
              label="Market size (TAM)"
              value={formatMoneyFromMillions(market.market_size)}
              sub="Total addressable today"
              accent="from-violet-500/20 to-violet-500/0"
              iconCls="text-brand-300"
              delay={0}
            />
            <MetricCard
              icon={CalendarClock}
              label="5-year projection"
              value={formatMoneyFromMillions(market.five_year_projection)}
              sub={`By ${new Date().getFullYear() + 5}`}
              accent="from-cyan-500/20 to-cyan-500/0"
              iconCls="text-accent-300"
              delay={0.08}
            />
            <MetricCard
              icon={TrendingUp}
              label="Annual growth"
              value={formatPercent(market.growth_per_year)}
              sub="Compound (CAGR)"
              accent="from-emerald-500/20 to-emerald-500/0"
              iconCls="text-emerald-300"
              delay={0.16}
            />
          </div>

          {series.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-medium text-white/70">
                  <Coins size={14} className="text-accent-300" /> Projected market growth
                </p>
                <span className="text-xs text-white/40">USD, millions</span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(v) => formatMoneyFromMillions(v)}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(167,139,250,0.4)' }} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#22d3ee"
                      strokeWidth={2.5}
                      fill="url(#marketFill)"
                      activeDot={{ r: 5, fill: '#22d3ee', stroke: '#0b0a14', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {market.source && market.source !== 'tavily:none' && (
            <p className="mt-3 truncate text-xs text-white/35">
              Sources: {market.source}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, accent, iconCls, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="relative overflow-hidden rounded-xl border border-white/8 bg-white/[0.02] p-4"
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-white/45">{label}</span>
          <Icon size={16} className={iconCls} />
        </div>
        <p className="mt-2 font-display text-2xl font-extrabold text-white" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
          {value}
        </p>
        <p className="mt-0.5 text-xs text-white/40">{sub}</p>
      </div>
    </motion.div>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-ink-850/95 px-3 py-2 text-sm shadow-xl backdrop-blur">
      <p className="font-semibold text-white">{point.year}</p>
      <p className="text-accent-300">{formatMoneyFromMillions(point.value)}</p>
    </div>
  );
}
