import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FLASH_KEY, errorMessage, fieldErrors } from '../../lib/api';
import { email as emailRule, required, validate } from '../../lib/validate';
import { useSubmit } from '../../lib/useAsync';
import { homeFor, useAuth } from '../../context/AuthContext';
import { Button, Card, InlineError, Input } from '../../components/ui';

export const AuthCard = ({ title, subtitle, children, footer }) => (
  <div className="mx-auto max-w-md pt-4 sm:pt-10">
    <h1 className="text-3xl font-extrabold">{title}</h1>
    {subtitle && <p className="mt-1 text-ink-500">{subtitle}</p>}
    <Card className="mt-6">{children}</Card>
    {footer && <p className="mt-4 text-center text-sm text-ink-500">{footer}</p>}
  </div>
);

export default function Login() {
  const { login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [twoFactor, setTwoFactor] = useState(null); // { twoFactorToken, sentTo, expiresInMinutes }
  const [code, setCode] = useState('');

  // Show "your session expired" (set by the API layer) once.
  useEffect(() => {
    const flash = sessionStorage.getItem(FLASH_KEY);
    if (flash) { setMessage(flash); sessionStorage.removeItem(FLASH_KEY); }
  }, []);

  const goOn = (user) => navigate(location.state?.from || homeFor(user), { replace: true });
  const change = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const [signingIn, signIn] = useSubmit(async (e) => {
    e.preventDefault();
    const found = validate(values, { email: emailRule, password: required('Password') });
    setErrors(found);
    if (Object.keys(found).length) return;
    setMessage('');
    try {
      const result = await login(values.email.trim(), values.password);
      if (result.twoFactorRequired) setTwoFactor(result);
      else goOn(result);
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage(errorMessage(err));
    }
  });

  const [verifying, verify] = useSubmit(async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setErrors({ code: 'Enter the 6-digit code from the email' });
    setErrors({});
    try {
      goOn(await verifyTwoFactor(twoFactor.twoFactorToken, code.trim()));
    } catch (err) {
      setMessage(errorMessage(err));
    }
  });

  if (twoFactor) {
    return (
      <AuthCard title="Check your email" subtitle={`We sent a 6-digit code to ${twoFactor.sentTo}. It expires in ${twoFactor.expiresInMinutes} minutes.`}>
        <form onSubmit={verify} className="space-y-4" noValidate>
          <InlineError>{message}</InlineError>
          <Input label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={errors.code} autoFocus
            hint="Admin accounts need a code sent to their email each time they log in." />
          <Button type="submit" className="w-full" loading={verifying}>Verify and log in</Button>
          <Button variant="ghost" className="w-full" onClick={() => { setTwoFactor(null); setCode(''); setMessage(''); }}>Use a different account</Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Welcome back" subtitle="Log in to book events or manage your own."
      footer={<>New here? <Link to="/register" className="font-semibold text-jacaranda-600 hover:underline">Create an account</Link></>}>
      <form onSubmit={signIn} className="space-y-4" noValidate>
        <InlineError>{message}</InlineError>
        <Input label="Email" type="email" autoComplete="email" value={values.email} onChange={change('email')} error={errors.email} />
        <Input label="Password" type="password" autoComplete="current-password" value={values.password} onChange={change('password')} error={errors.password} />
        <Link to="/forgot-password" className="block text-sm font-semibold text-jacaranda-600 hover:underline">Forgot your password?</Link>
        <Button type="submit" className="w-full" loading={signingIn}>Log in</Button>
      </form>
    </AuthCard>
  );
}
