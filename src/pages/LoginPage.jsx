import { useState } from 'react';
import { Lock, Mail } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { ErrorState } from '../components/ui/States.jsx';
import { useForm } from '../hooks/useForm.js';
import { isEmail } from '../utils/validation.js';

function validate({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email is required';
  else if (!isEmail(email)) errors.email = 'Enter a valid email address';
  if (!password) errors.password = 'Password is required';
  return errors;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [formError, setFormError] = useState('');
  const form = useForm({ email: state?.email ?? '', password: '' }, validate);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError('');
    try {
      await login({ email: values.email.trim(), password: values.password });
    } catch (error) {
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        // Correct password but the email isn't confirmed yet; the server just sent a new code.
        navigate('/verify-email', { state: error.details });
        return;
      }
      form.setErrors(error.fieldErrors ?? {});
      setFormError(error.code === 'VALIDATION_ERROR' ? '' : error.message);
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your conversations."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {state?.notice && !formError && (
          <p role="status" className="rounded-control border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
            {state.notice}
          </p>
        )}
        <ErrorState message={formError} onDismiss={() => setFormError('')} />
        <Input
          label="Email"
          type="email"
          icon={Mail}
          autoComplete="email"
          autoFocus={!state?.email}
          placeholder="you@example.com"
          {...form.field('email')}
        />
        <Input
          label="Password"
          type="password"
          icon={Lock}
          autoComplete="current-password"
          autoFocus={Boolean(state?.email)}
          placeholder="Your password"
          {...form.field('password')}
        />
        <div className="-mt-1 text-right">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" fullWidth loading={form.submitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
