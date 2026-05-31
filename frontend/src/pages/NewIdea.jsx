import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, Target, Sparkles, ArrowRight, Check, Loader2, Search, BarChart3, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { createBusinessIdea, getBusinessIdeaById, isReportReady } from '../api/businessIdeas.js';
import { extractError } from '../api/client.js';

const EXAMPLES = [
  { idea: 'A subscription box for sustainable, zero-waste home cleaning products.', market: 'Eco-conscious millennials in North America' },
  { idea: 'AI tutor that creates personalized study plans for high-school students.', market: 'Students & parents in the US K-12 market' },
  { idea: 'On-demand mobile EV charging service for apartment dwellers.', market: 'Urban EV owners without home charging' },
];

const STAGES = [
  { key: 'submit', label: 'Idea submitted', icon: Check },
  { key: 'competitors', label: 'Scanning competitors', icon: Search },
  { key: 'market', label: 'Sizing the market', icon: BarChart3 },
  { key: 'report', label: 'Writing AI report', icon: FileText },
];

const POLL_INTERVAL = 3500;
const MAX_POLLS = 60; // ~3.5 minutes

export default function NewIdea() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ idea: '', target_market: '' });
  const [phase, setPhase] = useState('form'); // 'form' | 'processing'
  const [createdId, setCreatedId] = useState(null);
  const [progress, setProgress] = useState({ competitors: false, market: false, report: false });
  const pollRef = useRef(null);
  const pollsRef = useRef(0);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const goToReport = (id) => {
    clearTimeout(pollRef.current);
    navigate(`/ideas/${id}`);
  };

  const poll = async (id) => {
    pollsRef.current += 1;
    try {
      const idea = await getBusinessIdeaById(id);
      setProgress({
        competitors: (idea.competitors?.length ?? 0) > 0,
        market: (idea.market_analysis?.length ?? 0) > 0,
        report: Boolean(idea.final_summary),
      });

      if (isReportReady(idea)) {
        toast.success('Your report is ready!');
        goToReport(id);
        return;
      }
    } catch (err) {
      // keep polling on transient errors
      console.warn('poll error', extractError(err));
    }

    if (pollsRef.current >= MAX_POLLS) {
      // Give up auto-navigation but let the user open whatever is available.
      toast('Analysis is taking longer than usual — you can open it anytime.', { icon: '⏳' });
      goToReport(id);
      return;
    }
    pollRef.current = setTimeout(() => poll(id), POLL_INTERVAL);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.idea.trim() || !form.target_market.trim()) {
      toast.error('Describe your idea and its target market.');
      return;
    }
    setPhase('processing');
    try {
      // 1) Create the idea (createBusinessIdea API)
      const result = await createBusinessIdea({
        idea: form.idea.trim(),
        target_market: form.target_market.trim(),
      });
      const id = result.business_idea_id;
      setCreatedId(id);
      toast.success('Idea submitted — running analysis…');

      // 2) Poll getBusinessIdeaById until the report has been created
      pollsRef.current = 0;
      pollRef.current = setTimeout(() => poll(id), POLL_INTERVAL);
    } catch (err) {
      const msg = extractError(err, 'Could not submit your idea.');
      toast.error(msg);
      setPhase('form');
    }
  };

  if (phase === 'processing') {
    return <Processing progress={progress} createdId={createdId} onOpen={() => createdId && goToReport(createdId)} />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-brand-300">
          <Sparkles size={14} /> New analysis
        </div>
        <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
          What are you building?
        </h1>
        <p className="mt-2 max-w-xl text-white/55">
          Describe your idea and who it&apos;s for. MarketMind will research competitors,
          size the market, and write you a grounded report.
        </p>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass mt-8 space-y-6 rounded-2xl p-6 sm:p-8"
      >
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-white/80">
            <Lightbulb size={16} className="text-brand-400" /> Your business idea
          </label>
          <textarea
            value={form.idea}
            onChange={update('idea')}
            rows={4}
            placeholder="e.g. A platform that helps indie game studios find and hire freelance artists with verified portfolios…"
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-4 text-[15px] text-white placeholder:text-white/30 outline-none transition-all focus:border-brand-400/60 focus:bg-white/8 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-white/80">
            <Target size={16} className="text-accent-400" /> Target market
          </label>
          <input
            value={form.target_market}
            onChange={update('target_market')}
            placeholder="e.g. Indie game studios in North America & Europe"
            className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-[15px] text-white placeholder:text-white/30 outline-none transition-all focus:border-brand-400/60 focus:bg-white/8 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-white/40">Or try an example</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setForm({ idea: ex.idea, target_market: ex.market })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-white/60 transition-colors hover:border-brand-400/40 hover:text-white"
              >
                {ex.idea.slice(0, 42)}…
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:shadow-brand-600/50"
        >
          Analyze my idea
          <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </motion.form>
    </div>
  );
}

function Processing({ progress, createdId, onOpen }) {
  const stageState = (key) => {
    if (key === 'submit') return 'done';
    if (key === 'competitors') return progress.competitors ? 'done' : 'active';
    if (key === 'market') return progress.market ? 'done' : progress.competitors ? 'active' : 'pending';
    if (key === 'report') return progress.report ? 'done' : progress.market ? 'active' : 'pending';
    return 'pending';
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center pt-6 text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative mb-8 grid h-24 w-24 place-items-center"
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/20" />
        <span className="absolute inset-2 rounded-full bg-brand-500/10" />
        <span
          className="grid h-16 w-16 place-items-center rounded-2xl text-white shadow-xl shadow-brand-600/40"
          style={{ background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)' }}
        >
          <Sparkles size={26} />
        </span>
      </motion.div>

      <h1 className="font-display text-2xl font-bold text-white sm:text-3xl" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>
        Analyzing your idea
      </h1>
      <p className="mt-2 text-white/55">
        Our agents are researching the web in real time. This usually takes a minute or two.
      </p>

      <div className="mt-9 w-full space-y-3 text-left">
        {STAGES.map((stage) => {
          const state = stageState(stage.key);
          const Icon = stage.icon;
          return (
            <div
              key={stage.key}
              className={`flex items-center gap-3.5 rounded-xl border p-4 transition-all ${
                state === 'done'
                  ? 'border-emerald-400/30 bg-emerald-400/5'
                  : state === 'active'
                  ? 'border-brand-400/40 bg-brand-500/8'
                  : 'border-white/8 bg-white/[0.02] opacity-60'
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  state === 'done'
                    ? 'bg-emerald-400/20 text-emerald-300'
                    : state === 'active'
                    ? 'bg-brand-500/20 text-brand-300'
                    : 'bg-white/5 text-white/40'
                }`}
              >
                <AnimatePresence mode="wait">
                  {state === 'done' ? (
                    <motion.span key="done" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Check size={18} />
                    </motion.span>
                  ) : state === 'active' ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Icon size={18} />
                  )}
                </AnimatePresence>
              </span>
              <span className={`font-medium ${state === 'pending' ? 'text-white/50' : 'text-white'}`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {createdId && (
        <button
          onClick={onOpen}
          className="mt-8 rounded-xl border border-white/12 px-5 py-2.5 text-sm font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white"
        >
          Open report now →
        </button>
      )}
    </div>
  );
}
