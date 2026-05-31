import { Link } from 'react-router-dom';

export default function Logo({ to = '/', size = 'md', withText = true }) {
  const dims = size === 'lg' ? 44 : size === 'sm' ? 30 : 36;
  const inner = (
    <span className="flex items-center gap-2.5 select-none">
      <span
        className="relative grid place-items-center rounded-xl shadow-lg shadow-brand-600/30"
        style={{
          width: dims,
          height: dims,
          background: 'linear-gradient(135deg, #8b5cf6, #6366f1 60%, #06b6d4)',
        }}
      >
        <svg width={dims * 0.6} height={dims * 0.6} viewBox="0 0 64 64" fill="none">
          <path
            d="M14 44V20l12 14 10-18 14 28"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="18" r="4.5" fill="white" />
        </svg>
      </span>
      {withText && (
        <span
          className="font-display font-extrabold tracking-tight text-[1.15rem] text-white"
          style={{ fontFamily: 'Sora, Inter, sans-serif' }}
        >
          Market<span className="text-brand-400">Mind</span>
        </span>
      )}
    </span>
  );

  if (to) return <Link to={to}>{inner}</Link>;
  return inner;
}
