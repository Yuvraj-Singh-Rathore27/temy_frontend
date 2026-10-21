import { useState } from 'react';
import { Lock, Mail, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { ErrorState } from '../components/ui/States.jsx';
import { useForm } from '../hooks/useForm.js';
import { isEmail, validateName, validatePassword } from '../utils/validation.js';

function validate({ name, email, password, confirm }) {
  const errors = {};
  const nameError = validateName(name);
  if (nameError) errors.name = nameError;
  if (!isEmail(email)) errors.email = 'Enter a valid email address';
  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (confirm !== password) errors.confirm = 'Passwords do not match';
  return errors;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');
  const form = useForm({ name: '', email: '', password: '', confirm: '' }, validate);

  const onSubmit = form.handleSubmit(async ({ name, email, password }) => {
    setFormError('');
    try {
      // Step 1: create the account. Step 2 (verify page) confirms the emailed code.
      // TEMPORARILY DISABLED email verification: register signs the user in directly.
      // const result = await register({ name: name.trim(), email: email.trim(), password });
      // navigate('/verify-email', { state: result });
      await register({ name: name.trim(), email: email.trim(), password });
      navigate('/', { replace: true });
    } catch (error) {
      form.setErrors(error.fieldErrors ?? {});
      setFormError(error.code === 'VALIDATION_ERROR' ? '' : error.message);
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <ErrorState message={formError} onDismiss={() => setFormError('')} />
        <Input label="Full name" icon={User} autoComplete="name" autoFocus placeholder="Jane Doe" maxLength={80} {...form.field('name')} />
        <Input label="Email" type="email" icon={Mail} autoComplete="email" placeholder="you@example.com" {...form.field('email')} />
        <Input
          label="Password"
          type="password"
          icon={Lock}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="Use 8+ characters with at least one letter and one number."
          {...form.field('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          icon={Lock}
          autoComplete="new-password"
          placeholder="Repeat your password"
          {...form.field('confirm')}
        />
        <Button type="submit" size="lg" fullWidth loading={form.submitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
