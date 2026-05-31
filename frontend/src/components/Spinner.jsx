export default function Spinner({ size = 18, className = '' }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-white/25 border-t-white ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
