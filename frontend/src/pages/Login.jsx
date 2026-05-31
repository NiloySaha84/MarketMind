import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field, TextInput } from '../components/Field.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { extractError } from '../api/client.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';

  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(form);
      toast.success('Welcome back!');
      navigate(from, { replace: true });
    } catch (err) {
      const msg = extractError(err, 'Invalid email or password.');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to access your idea analyses.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Email" icon={Mail} htmlFor="email">
          <TextInput
            id="email"
            icon
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={update('email')}
          />
        </Field>

        <Field label="Password" icon={Lock} htmlFor="password" error={error}>
          <TextInput
            id="password"
            icon
            hasToggle
            autoComplete="current-password"
            placeholder="••••••••"
            value={form.password}
            onChange={update('password')}
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:shadow-brand-600/50 disabled:opacity-60"
        >
          {loading ? <Spinner /> : <>Log in <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" /></>}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/55">
        Don&apos;t have an account?{' '}
        <Link to="/signup" className="font-semibold text-brand-300 hover:text-brand-200">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
