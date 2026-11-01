import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage, fieldErrors } from '../../lib/api';
import { email, minLen, password, studentId, validate } from '../../lib/validate';
import { useSubmit } from '../../lib/useAsync';
import { homeFor, useAuth } from '../../context/AuthContext';
import { Button, InlineError, Input, Select } from '../../components/ui';
import { AuthCard } from './Login';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [v, setV] = useState({ role: 'student', name: '', email: '', password: '', student_id_number: '', programme: '', org_name: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const change = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  const [busy, submit] = useSubmit(async (e) => {
    e.preventDefault();
    const rules = { name: minLen('Name', 2), email, password };
    if (v.role === 'student') rules.student_id_number = studentId;
    else rules.org_name = minLen('Organisation name', 2);
    const found = validate(v, rules);
    setErrors(found);
    if (Object.keys(found).length) return;
    setMessage('');
    const body = { role: v.role, name: v.name.trim(), email: v.email.trim(), password: v.password };
    if (v.role === 'student') {
      body.student_id_number = v.student_id_number.trim();
      if (v.programme.trim()) body.programme = v.programme.trim();
    } else body.org_name = v.org_name.trim();
    try {
      navigate(homeFor(await register(body)), { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage(errorMessage(err));
    }
  });

  return (
    <AuthCard title="Create your account" subtitle="Students book events. Organizers run them."
      footer={<>Already registered? <Link to="/login" className="font-semibold text-jacaranda-600 hover:underline">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <InlineError>{message}</InlineError>
        <Select label="I am a" value={v.role} onChange={change('role')} hint="Admin accounts are created by a super admin, not here.">
          <option value="student">Student</option>
          <option value="organizer">Event organizer</option>
        </Select>
        <Input label="Full name" autoComplete="name" value={v.name} onChange={change('name')} error={errors.name} />
        <Input label="Email" type="email" autoComplete="email" value={v.email} onChange={change('email')} error={errors.email} />
        <Input label="Password" type="password" autoComplete="new-password" value={v.password} onChange={change('password')} error={errors.password}
          help="At least 8 characters, with a letter and a number." />
        {v.role === 'student' ? (
          <>
            <Input label="Student ID" value={v.student_id_number} onChange={change('student_id_number')} error={errors.student_id_number}
              hint="3-20 letters, digits or dashes. It must be unique." />
            <Input label="Programme (optional)" value={v.programme} onChange={change('programme')} error={errors.programme} />
          </>
        ) : (
          <Input label="Organisation or club name" value={v.org_name} onChange={change('org_name')} error={errors.org_name} />
        )}
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      </form>
    </AuthCard>
  );
}
