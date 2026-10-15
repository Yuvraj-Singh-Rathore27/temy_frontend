import { useCallback, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DevOtpNotice } from '../components/ui/DevOtpNotice.jsx';
import { OtpInput } from '../components/ui/OtpInput.jsx';
import { ErrorState } from '../components/ui/States.jsx';
import { useCountdown } from '../hooks/useCountdown.js';

const isComplete = (code) => /^\d{6}$/.test(code);

/**
 * Step 2 of sign-up (and of signing in to an unverified account).
 * Expects router state { email, retryAfterSeconds?, devOtp? }.
 */
export default function VerifyEmailPage() {
  const { state } = useLocation();
  const email = state?.email;
  const { verifyEmail } = useAuth();
  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState(state?.devOtp ?? null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const { secondsLeft, start } = useCountdown(state?.retryAfterSeconds ?? 0);

  const submit = useCallback(
    async (value) => {
      if (!isComplete(value) || submitting) return;
      setSubmitting(true);
      setError('');
      try {
        await verifyEmail(email, value); // signs in; PublicOnlyRoute then redirects to the app
      } catch (e) {
        setError(e.message);
        setCode('');
        setSubmitting(false);
      }
    },
    [email, submitting, verifyEmail],
  );

  const resend = async () => {
    setResending(true);
    setError('');
    setInfo('');
    try {
      const result = await authApi.resendVerification(email);
      setDevOtp(result.devOtp ?? null);
      start(result.retryAfterSeconds ?? 60);
      setInfo('We sent you a new code.');
    } catch (e) {
      setError(e.message);
      if (e.details?.retryAfterSeconds) start(e.details.retryAfterSeconds);
    } finally {
      setResending(false);
    }
  };

  if (!email) return <Navigate to="/register" replace />;

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={
        <>
          Enter the 6-digit code we sent to <strong className="font-medium text-ink">{email}</strong>.
        </>
      }
      footer={
        <>
          Wrong email?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Start over
          </Link>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
        <div className="flex justify-center text-brand-600">
          <MailCheck className="size-10" aria-hidden />
        </div>
        <DevOtpNotice
          code={devOtp}
          onUse={(value) => {
            setCode(value);
            submit(value);
          }}
        />
        <ErrorState message={error} compact />
        {info && !error && <p className="text-center text-sm text-success">{info}</p>}
        <OtpInput value={code} onChange={setCode} onComplete={submit} error={Boolean(error)} disabled={submitting} autoFocus />
        <Button type="submit" size="lg" fullWidth loading={submitting} disabled={!isComplete(code)}>
          Verify and continue
        </Button>
        <p className="text-center text-sm text-ink-muted">
          Didn&apos;t get it?{' '}
          {secondsLeft > 0 ? (
            <span>Resend in {secondsLeft}s</span>
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
