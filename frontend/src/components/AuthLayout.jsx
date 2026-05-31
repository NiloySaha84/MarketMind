import { motion } from 'framer-motion';
import { Sparkles, BarChart3, Users, FileText } from 'lucide-react';
import Logo from './Logo.jsx';

const features = [
  { icon: Users, title: 'Competitor intel', text: 'Real competitors with strengths & weaknesses, grounded in live web sources.' },
  { icon: BarChart3, title: 'Market sizing', text: 'TAM, 5-year projection and annual growth — quantified, not guessed.' },
  { icon: FileText, title: 'AI investment memo', text: 'A crisp, realistic report you can actually act on.' },
];

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left — brand / pitch */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(700px 500px at 20% 10%, rgba(124,58,237,0.35), transparent 60%), radial-gradient(600px 500px at 90% 90%, rgba(6,182,212,0.22), transparent 55%)',
          }}
        />
        <Logo size="lg" />

        <div className="max-w-md">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-brand-300">
            <Sparkles size={14} /> AI-powered idea validation
          </div>
          <h1
            className="font-display text-4xl font-extrabold leading-tight text-white"
            style={{ fontFamily: 'Sora, Inter, sans-serif' }}
          >
            Validate your next big idea{' '}
            <span className="text-gradient">before you build it.</span>
          </h1>
          <p className="mt-4 text-white/60">
            MarketMind researches the market, maps the competition, and writes you a
            grounded investment-style report in minutes.
          </p>

          <div className="mt-9 space-y-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.1 }}
                className="flex items-start gap-3.5"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-brand-300">
                  <f.icon size={18} />
                </span>
                <div>
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="text-sm text-white/55">{f.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/30">© {new Date().getFullYear()} MarketMind</p>
      </div>

      {/* Right — form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 lg:hidden">
            <Logo size="lg" />
          </div>
          <h2
            className="font-display text-3xl font-bold text-white"
            style={{ fontFamily: 'Sora, Inter, sans-serif' }}
          >
            {title}
          </h2>
          <p className="mt-2 text-white/55">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
