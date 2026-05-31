import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Target,
  Clock,
  CheckCircle2,
  Loader2,
  FileText,
  Users,
  BarChart3,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getBusinessIdeaById, isReportReady } from '../api/businessIdeas.js';
import { extractError } from '../api/client.js';
import { formatDate, pickMarketAnalysis, formatMoneyFromMillions } from '../lib/format.js';
import MarkdownReport from '../components/report/MarkdownReport.jsx';
import MarketSection from '../components/report/MarketSection.jsx';
import CompetitorsSection from '../components/report/CompetitorsSection.jsx';
import Spinner from '../components/Spinner.jsx';

const POLL_INTERVAL = 4000;

export default function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [idea, setIdea] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);
  const pollRef = useRef(null);

  const fetchIdea = useCallback(
    async ({ silent } = {}) => {
      try {
        const data = await getBusinessIdeaById(id);
        setIdea(data);
        setError('');
        return data;
      } catch (err) {
        if (!silent) setError(extractError(err, 'Could not load this report.'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    setLoading(true);
    fetchIdea();
    return () => clearTimeout(pollRef.current);
  }, [fetchIdea]);

  // Auto-poll while the async workers are still producing the report.
  useEffect(() => {
    clearTimeout(pollRef.current);
    if (!idea || isReportReady(idea)) {
      setPolling(false);
      return;
    }
    setPolling(true);
    pollRef.current = setTimeout(async () => {
      const fresh = await fetchIdea({ silent: true });
      if (fresh && isReportReady(fresh)) {
        toast.success('Report complete!');
      }
    }, POLL_INTERVAL);
    return () => clearTimeout(pollRef.current);
  }, [idea, fetchIdea]);

  if (loading) return <ReportSkeleton />;

  if (error && !idea) {
    return (
      <div className="glass mx-auto flex max-w-md flex-col items-center rounded-2xl px-8 py-14 text-center">
        <AlertCircle size={28} className="text-rose-400" />
        <p className="mt-3 text-white/70">{error}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white/80 hover:border-white/30"
          >
            Back to ideas
          </button>
          <button
            onClick={() => fetchIdea()}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const ready = isReportReady(idea);
  const market = pickMarketAnalysis(idea.market_analysis);

  const sections = [
    { id: 'summary', label: 'AI Summary', icon: FileText },
    { id: 'market', label: 'Market', icon: BarChart3 },
    { id: 'competitors', label: 'Competitors', icon: Users },
  ];

  const scrollTo = (sid) => {
    document.getElementById(sid)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-white/55 transition-colors hover:text-white"
      >
        <ArrowLeft size={16} /> All ideas
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass mt-4 overflow-hidden rounded-2xl p-6 sm:p-7"
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge ready={ready} />
          <span className="inline-flex items-center gap-1.5 text-xs text-white/45">
            <Clock size={13} /> {formatDate(idea.created_at)}
          </span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
          {idea.idea_des}
        </h1>
        <p className="mt-2 inline-flex items-center gap-1.5 text-white/55">
          <Target size={15} className="text-accent-400" /> {idea.target_market}
        </p>

        {/* quick highlights */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Highlight label="Market size" value={market ? formatMoneyFromMillions(market.market_size) : '—'} />
          <Highlight label="Competitors" value={idea.competitors?.length || '—'} />
          <Highlight label="Growth/yr" value={market?.growth_per_year != null ? `${market.growth_per_year}%` : '—'} />
        </div>
      </motion.div>

      {polling && !ready && <ProcessingBanner idea={idea} />}

      {/* Sticky section nav */}
      <div className="sticky top-16 z-30 -mx-4 mt-6 border-b border-white/8 bg-ink-950/70 px-4 py-2.5 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border sm:px-3">
        <nav className="flex items-center gap-1.5">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/8 hover:text-white"
            >
              <s.icon size={15} /> {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Section 1: AI Summary */}
      <Section id="summary">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 text-brand-300">
            <FileText size={18} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-white" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
              AI investment report
            </h2>
            <p className="text-xs text-white/45">Generated from market & competitor research</p>
          </div>
        </div>
        {idea.final_summary ? (
          <MarkdownReport content={idea.final_summary} />
        ) : (
          <PendingBlock
            icon={FileText}
            text="The AI report is being written. It appears the moment both analyses are complete."
          />
        )}
      </Section>

      {/* Section 2: Market */}
      <Section id="market">
        <MarketSection marketAnalysis={idea.market_analysis} />
      </Section>

      {/* Section 3: Competitors */}
      <Section id="competitors">
        <CompetitorsSection competitors={idea.competitors} />
      </Section>
    </div>
  );
}

function Section({ id, children }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      className="glass mt-5 scroll-mt-32 rounded-2xl p-6 sm:p-7"
    >
      {children}
    </motion.section>
  );
}

function StatusBadge({ ready }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        ready ? 'bg-emerald-400/12 text-emerald-300' : 'bg-amber-400/12 text-amber-300'
      }`}
    >
      {ready ? <CheckCircle2 size={13} /> : <Loader2 size={13} className="animate-spin" />}
      {ready ? 'Report ready' : 'Analyzing…'}
    </span>
  );
}

function Highlight({ label, value }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="font-display text-base font-bold text-white" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
        {value}
      </p>
    </div>
  );
}

function ProcessingBanner({ idea }) {
  const got = [
    idea.competitors?.length > 0 && 'competitors',
    idea.market_analysis?.length > 0 && 'market data',
  ].filter(Boolean);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-5 flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3"
    >
      <Spinner size={16} />
      <p className="text-sm text-amber-100/80">
        Live analysis in progress — auto-refreshing.
        {got.length > 0 && <span className="text-amber-100/55"> Got {got.join(' & ')} so far.</span>}
      </p>
    </motion.div>
  );
}

function PendingBlock({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-white/40">
        <Icon size={20} />
      </span>
      <p className="max-w-sm text-sm text-white/45">{text}</p>
      <Loader2 size={16} className="animate-spin text-brand-400" />
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div>
      <div className="skeleton h-4 w-24 rounded" />
      <div className="glass mt-4 rounded-2xl p-7">
        <div className="skeleton h-5 w-28 rounded-full" />
        <div className="skeleton mt-4 h-7 w-3/4 rounded" />
        <div className="skeleton mt-3 h-4 w-1/2 rounded" />
        <div className="mt-5 flex gap-2.5">
          <div className="skeleton h-12 w-28 rounded-xl" />
          <div className="skeleton h-12 w-28 rounded-xl" />
          <div className="skeleton h-12 w-28 rounded-xl" />
        </div>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="glass mt-5 rounded-2xl p-7">
          <div className="skeleton h-6 w-40 rounded" />
          <div className="skeleton mt-4 h-4 w-full rounded" />
          <div className="skeleton mt-2 h-4 w-5/6 rounded" />
          <div className="skeleton mt-2 h-4 w-4/6 rounded" />
        </div>
      ))}
    </div>
  );
}
