import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Users, TrendingUp, Clock, CircleDot, CheckCircle2 } from 'lucide-react';
import { formatRelative, formatMoneyFromMillions, formatPercent, pickMarketAnalysis } from '../lib/format.js';
import { isReportReady } from '../api/businessIdeas.js';

export default function IdeaCard({ idea, index = 0 }) {
  const ready = isReportReady(idea);
  const market = pickMarketAnalysis(idea.market_analysis);
  const competitorCount = idea.competitors?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4) }}
    >
      <Link
        to={`/ideas/${idea.id}`}
        className="glass glass-hover group flex h-full flex-col rounded-2xl p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              ready
                ? 'bg-emerald-400/12 text-emerald-300'
                : 'bg-amber-400/12 text-amber-300'
            }`}
          >
            {ready ? <CheckCircle2 size={12} /> : <CircleDot size={12} className="animate-pulse" />}
            {ready ? 'Report ready' : 'Analyzing'}
          </span>
          <ArrowUpRight
            size={18}
            className="text-white/30 transition-all group-hover:text-brand-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </div>

        <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-white">
          {idea.idea_des}
        </h3>
        <p className="mt-1.5 line-clamp-1 text-sm text-white/45">{idea.target_market}</p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat icon={TrendingUp} label="Market" value={market ? formatMoneyFromMillions(market.market_size) : '—'} accent="text-accent-300" />
          <Stat icon={TrendingUp} label="Growth" value={market ? formatPercent(market.growth_per_year) : '—'} accent="text-emerald-300" />
          <Stat icon={Users} label="Rivals" value={competitorCount || '—'} accent="text-brand-300" />
        </div>

        <div className="mt-4 flex items-center gap-1.5 border-t border-white/8 pt-3 text-xs text-white/40">
          <Clock size={12} /> {formatRelative(idea.created_at)}
        </div>
      </Link>
    </motion.div>
  );
}

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/35">
        <Icon size={11} className={accent} /> {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-bold text-white">{value}</div>
    </div>
  );
}
