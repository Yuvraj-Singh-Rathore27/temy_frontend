import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints.js';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DevOtpNotice } from '../components/ui/DevOtpNotice.jsx';
import { Input } from '../components/ui/Input.jsx';
import { OtpInput } from '../components/ui/OtpInput.jsx';
import { ErrorState } from '../components/ui/States.jsx';
import { useCountdown } from '../hooks/useCountdown.js';
import { useForm } from '../hooks/useForm.js';
import { validatePassword } from '../utils/validation.js';

function validate({ code, password, confirm }) {
  const errors = {};
  if (!/^\d{6}$/.test(code)) errors.code = 'Enter the 6-digit code';
  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (confirm !== password) errors.confirm = 'Passwords do not match';
  return errors;
}

/** Expects router state { email, retryAfterSeconds?, devOtp? } from the forgot-password page. */
export default function ResetPasswordPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const email = state?.email;
  const [devOtp, setDevOtp] = useState(state?.devOtp ?? null);
  const [formError, setFormError] = useState('');
  const [resending, setResending] = useState(false);
  const { secondsLeft, start } = useCountdown(state?.retryAfterSeconds ?? 0);
  const form = useForm({ code: '', password: '', confirm: '' }, validate);
  const codeField = form.field('code');

  const onSubmit = form.handleSubmit(async ({ code, password }) => {
    setFormError('');
    try {
      await authApi.resetPassword({ email, code, password });
      navigate('/login', { replace: true, state: { notice: 'Your password was changed. Sign in with your new password.', email } });
    } catch (error) {
      form.setErrors(error.fieldErrors ?? {});
      setFormError(error.code === 'VALIDATION_ERROR' ? '' : error.message);
    }
  });

  const resend = async () => {
    setResending(true);
    setFormError('');
    try {
      const result = await authApi.forgotPassword(email);
      setDevOtp(result.devOtp ?? null);
      start(result.retryAfterSeconds ?? 60);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setResending(false);
    }
  };

  if (!email) return <Navigate to="/forgot-password" replace />;

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={
        <>
          If an account exists for <strong className="font-medium text-ink">{email}</strong>, we sent it a 6-digit code.
        </>
      }
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <DevOtpNotice code={devOtp} onUse={(value) => codeField.onChange({ target: { value } })} />
        <ErrorState message={formError} onDismiss={() => setFormError('')} />
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink-soft">Code</p>
          <OtpInput value={codeField.value} onChange={(value) => codeField.onChange({ target: { value } })} error={codeField.error} autoFocus />
          {codeField.error && <p className="text-xs text-danger">{codeField.error}</p>}
        </div>
        <Input
          label="New password"
          type="password"
          icon={Lock}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="Use 8+ characters with at least one letter and one number."
          {...form.field('password')}
        />
        <Input label="Confirm new password" type="password" icon={Lock} autoComplete="new-password" {...form.field('confirm')} />
        <Button type="submit" size="lg" fullWidth loading={form.submitting}>
          Change password
        </Button>
        <p className="text-center text-sm text-ink-muted">
          {secondsLeft > 0 ? (
            <span>Resend code in {secondsLeft}s</span>
          ) : (
            <button type="button" onClick={resend} disabled={resending} className="font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60">
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
        </p>
      </form>
    </AuthLayout>
  );
}
