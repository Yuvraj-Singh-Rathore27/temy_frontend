import { useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints.js';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { ErrorState } from '../components/ui/States.jsx';
import { useForm } from '../hooks/useForm.js';

const validate = ({ email }) => (/^\S+@\S+\.\S+$/.test(email.trim()) ? {} : { email: 'Enter a valid email address' });

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');
  const form = useForm({ email: '' }, validate);

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setFormError('');
    const normalized = email.trim().toLowerCase();
    try {
      const result = await authApi.forgotPassword(normalized);
      navigate('/reset-password', { state: { email: normalized, ...result } });
    } catch (error) {
      form.setErrors(error.fieldErrors ?? {});
      setFormError(error.code === 'VALIDATION_ERROR' ? '' : error.message);
    }
  });

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a code to reset it."
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="size-4" /> Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <ErrorState message={formError} onDismiss={() => setFormError('')} />
        <Input label="Email" type="email" icon={Mail} autoComplete="email" autoFocus placeholder="you@example.com" {...form.field('email')} />
        <Button type="submit" size="lg" fullWidth loading={form.submitting}>
          Send reset code
        </Button>
      </form>
    </AuthLayout>
  );
}
