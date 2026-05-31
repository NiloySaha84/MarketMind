import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function Field({ label, icon: Icon, error, hint, children, htmlFor }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-white/75">
          {label}
        </label>
        {hint}
      </div>
      <div className="relative">
        {Icon && (
          <Icon
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
          />
        )}
        {children}
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-400">{error}</p>}
    </div>
  );
}

export function TextInput({ icon, hasToggle, ...props }) {
  const [show, setShow] = useState(false);
  const isPassword = hasToggle;
  const type = isPassword ? (show ? 'text' : 'password') : props.type || 'text';

  return (
    <>
      <input
        {...props}
        type={type}
        className={`w-full rounded-xl border border-white/10 bg-white/5 py-3 text-[15px] text-white placeholder:text-white/30 outline-none transition-all focus:border-brand-400/60 focus:bg-white/8 focus:ring-2 focus:ring-brand-500/20 ${
          icon ? 'pl-11' : 'pl-4'
        } ${isPassword ? 'pr-11' : 'pr-4'}`}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80"
          tabIndex={-1}
        >
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      )}
    </>
  );
}
