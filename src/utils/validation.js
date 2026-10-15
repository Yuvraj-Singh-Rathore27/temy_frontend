// Mirror the server's rules for instant feedback; the server re-validates everything.

export function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain a letter and a number';
  if (new TextEncoder().encode(password).length > 72) return 'Password is too long';
  return null;
}

export function validateName(name) {
  const trimmed = name.trim();
  if (trimmed.length < 2) return 'Name must be at least 2 characters';
  if (trimmed.length > 80) return 'Name must be at most 80 characters';
  return null;
}

export const isEmail = (value) => /^\S+@\S+\.\S+$/.test(value.trim());
