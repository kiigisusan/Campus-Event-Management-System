import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../../lib/api';
import { email as emailRule, password as passwordRule, validate } from '../../lib/validate';
import { useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import { Button, InlineError, Input } from '../../components/ui';
import { AuthCard } from './Login';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, submit] = useSubmit(async (e) => {
    e.preventDefault();
    const msg = emailRule(email);
    setError(msg);
    if (msg) return;
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  if (sent) {
    return (
      <AuthCard title="Check your email" footer={<Link to="/login" className="font-semibold text-jacaranda-600 hover:underline">Back to log in</Link>}>
        <div className="flex gap-3"><MailCheck className="h-6 w-6 shrink-0 text-acacia-600" aria-hidden />
          <p>If an account exists for <strong>{email}</strong>, we’ve sent a link to reset the password. The link works for a limited time.</p></div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your email and we’ll send you a reset link."
      footer={<Link to="/login" className="font-semibold text-jacaranda-600 hover:underline">Back to log in</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoComplete="email" />
        <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
      </form>
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const [v, setV] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');

  const [busy, submit] = useSubmit(async (e) => {
    e.preventDefault();
    const found = validate(v, {
      password: passwordRule,
      confirm: (c, all) => (c === all.password ? '' : 'The two passwords don’t match'),
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      await api.post('/auth/reset-password', { token, password: v.password });
      toast.success('Password changed. Log in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage(errorMessage(err));
    }
  });

  if (!token) {
    return (
      <AuthCard title="This link isn’t valid" footer={<Link to="/forgot-password" className="font-semibold text-jacaranda-600 hover:underline">Request a new link</Link>}>
        <p>The reset link is missing its token. Open the link from your email again, or request a new one.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <InlineError>{message}</InlineError>
        <Input label="New password" type="password" autoComplete="new-password" value={v.password}
          onChange={(e) => setV({ ...v, password: e.target.value })} error={errors.password} help="At least 8 characters, with a letter and a number." />
        <Input label="Repeat new password" type="password" autoComplete="new-password" value={v.confirm}
          onChange={(e) => setV({ ...v, confirm: e.target.value })} error={errors.confirm} />
        <Button type="submit" className="w-full" loading={busy}>Save new password</Button>
      </form>
    </AuthCard>
  );
}
