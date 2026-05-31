import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ExternalLink, ThumbsUp, ThumbsDown, ChevronDown, Globe, Link2 } from 'lucide-react';
import { toBulletList, getDomain } from '../../lib/format.js';

export default function CompetitorsSection({ competitors = [] }) {
  if (!competitors || competitors.length === 0) {
    return (
      <SectionShell>
        <p className="py-8 text-center text-white/45">
          No competitors were identified from the available sources.
        </p>
      </SectionShell>
    );
  }

  return (
    <SectionShell count={competitors.length}>
      <div className="space-y-3">
        {competitors.map((c, i) => (
          <CompetitorRow key={c.id ?? i} competitor={c} index={i} defaultOpen={i === 0} />
        ))}
      </div>
    </SectionShell>
  );
}

function SectionShell({ children, count }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
          <Users size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-white" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
            Competitive landscape
          </h2>
          {count != null && (
            <p className="text-xs text-white/45">{count} competitor{count > 1 ? 's' : ''} found</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function CompetitorRow({ competitor, index, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const strengths = toBulletList(competitor.strengths);
  const weaknesses = toBulletList(competitor.weaknesses);
  const citations = Array.isArray(competitor.citations) ? competitor.citations : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.06, 0.4) }}
      className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: gradientFor(index) }}
        >
          {(competitor.name || '?').charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{competitor.name || 'Unknown competitor'}</p>
          {competitor.website && (
            <span className="inline-flex items-center gap-1 text-xs text-white/45">
              <Globe size={11} /> {getDomain(competitor.website)}
            </span>
          )}
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Pill tone="emerald">{strengths.length} strength{strengths.length === 1 ? '' : 's'}</Pill>
          <Pill tone="rose">{weaknesses.length} weakness{weaknesses.length === 1 ? '' : 'es'}</Pill>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="grid gap-4 border-t border-white/8 p-4 sm:grid-cols-2">
              <ProsCons
                icon={ThumbsUp}
                title="Strengths"
                items={strengths}
                tone="emerald"
                empty="No strengths listed."
              />
              <ProsCons
                icon={ThumbsDown}
                title="Weaknesses"
                items={weaknesses}
                tone="rose"
                empty="No weaknesses listed."
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
              {competitor.website && (
                <a
                  href={competitor.website.startsWith('http') ? competitor.website : `https://${competitor.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-brand-400/40 hover:text-white"
                >
                  <ExternalLink size={13} /> Visit website
                </a>
              )}
              {citations.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-white/40">
                  <Link2 size={13} /> {citations.length} source{citations.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ProsCons({ icon: Icon, title, items, tone, empty }) {
  const toneCls = tone === 'emerald' ? 'text-emerald-300' : 'text-rose-300';
  const dotCls = tone === 'emerald' ? 'bg-emerald-400' : 'bg-rose-400';
  return (
    <div className={`rounded-lg border border-white/8 bg-white/[0.02] p-3.5`}>
      <div className={`mb-2 flex items-center gap-1.5 text-sm font-semibold ${toneCls}`}>
        <Icon size={15} /> {title}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-white/35">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-snug text-white/75">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pill({ children, tone }) {
  const cls = tone === 'emerald' ? 'bg-emerald-400/12 text-emerald-300' : 'bg-rose-400/12 text-rose-300';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function gradientFor(i) {
  const palettes = [
    'linear-gradient(135deg,#8b5cf6,#6366f1)',
    'linear-gradient(135deg,#06b6d4,#3b82f6)',
    'linear-gradient(135deg,#ec4899,#8b5cf6)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#10b981,#06b6d4)',
  ];
  return palettes[i % palettes.length];
}
