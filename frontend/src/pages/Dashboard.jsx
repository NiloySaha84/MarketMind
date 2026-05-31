import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Sparkles, RefreshCw, Lightbulb, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { getBusinessIdeas, isReportReady } from '../api/businessIdeas.js';
import { extractError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import IdeaCard from '../components/IdeaCard.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const data = await getBusinessIdeas();
      setIdeas(data);
    } catch (err) {
      const msg = extractError(err, 'Could not load your ideas.');
      setError(msg);
      if (isRefresh) toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const firstName = (user?.name || '').split(' ')[0];
  const readyCount = ideas.filter(isReportReady).length;
  const filtered = ideas.filter(
    (i) =>
      !query ||
      i.idea_des?.toLowerCase().includes(query.toLowerCase()) ||
      i.target_market?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
            {firstName ? `Hi ${firstName}, ` : ''}your ideas
          </h1>
          <p className="mt-1.5 text-white/55">
            {ideas.length > 0
              ? `${ideas.length} idea${ideas.length > 1 ? 's' : ''} · ${readyCount} report${readyCount === 1 ? '' : 's'} ready`
              : 'Validate your next venture with AI-powered research.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2.5 text-sm font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
          <Link
            to="/new"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:shadow-brand-600/50"
          >
            <Plus size={16} /> New analysis
          </Link>
        </div>
      </div>

      {ideas.length > 3 && (
        <div className="relative mt-6 max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your ideas…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <SkeletonGrid />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : ideas.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-white/50">No ideas match “{query}”.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((idea, i) => (
              <IdeaCard key={idea.id} idea={idea} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass rounded-2xl p-5">
          <div className="skeleton h-5 w-24 rounded-full" />
          <div className="skeleton mt-4 h-4 w-full rounded" />
          <div className="skeleton mt-2 h-4 w-2/3 rounded" />
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass mx-auto flex max-w-lg flex-col items-center rounded-2xl px-8 py-16 text-center"
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl text-white shadow-xl shadow-brand-600/40" style={{ background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)' }}>
        <Lightbulb size={28} />
      </span>
      <h3 className="mt-6 font-display text-xl font-bold text-white" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
        No ideas yet
      </h3>
      <p className="mt-2 max-w-xs text-white/55">
        Drop in your first idea and let MarketMind research the market and competition for you.
      </p>
      <Link
        to="/new"
        className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:shadow-brand-600/50"
      >
        <Sparkles size={17} /> Analyze your first idea
      </Link>
    </motion.div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="glass flex flex-col items-center rounded-2xl px-8 py-14 text-center">
      <p className="text-white/70">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/30"
      >
        <RefreshCw size={15} /> Try again
      </button>
    </div>
  );
}
