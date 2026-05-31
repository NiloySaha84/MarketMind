import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field, TextInput } from '../components/Field.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { extractError } from '../api/client.js';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Your name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email.';
    if (form.password.length < 6) next.password = 'At least 6 characters.';
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await signup({ name: form.name, email: form.email, password: form.password });
      toast.success('Account created — welcome to MarketMind!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = extractError(err, 'Could not create account.');
      setErrors((prev) => ({ ...prev, email: msg }));
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start validating ideas in minutes — it's free.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" icon={User} htmlFor="name" error={errors.name}>
          <TextInput
            id="name"
            icon
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={form.name}
            onChange={update('name')}
          />
        </Field>

        <Field label="Email" icon={Mail} htmlFor="email" error={errors.email}>
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

        <Field label="Password" icon={Lock} htmlFor="password" error={errors.password}>
          <TextInput
            id="password"
            icon
            hasToggle
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={form.password}
            onChange={update('password')}
          />
        </Field>

        <Field label="Confirm password" icon={Lock} htmlFor="confirm" error={errors.confirm}>
          <TextInput
            id="confirm"
            icon
            hasToggle
            autoComplete="new-password"
            placeholder="Re-enter password"
            value={form.confirm}
            onChange={update('confirm')}
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:shadow-brand-600/50 disabled:opacity-60"
        >
          {loading ? <Spinner /> : <>Create account <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" /></>}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/55">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
