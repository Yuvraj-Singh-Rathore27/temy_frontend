import { useCallback, useState } from 'react';

/**
 * Minimal controlled-form helper: values, per-field errors (shown after a field
 * is touched or on submit) and a submitting flag.
 */
export function useForm(initialValues, validate) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const field = (name) => ({
    name,
    value: values[name],
    error: touched[name] ? errors[name] : undefined,
    onChange: (event) => {
      const next = { ...values, [name]: event.target.value };
      setValues(next);
      if (touched[name]) setErrors(validate(next));
    },
    onBlur: () => {
      setTouched((t) => ({ ...t, [name]: true }));
      setErrors(validate(values));
    },
  });

  const handleSubmit = (onValid) => async (event) => {
    event.preventDefault();
    if (submitting) return;
    const found = validate(values);
    setErrors(found);
    setTouched(Object.fromEntries(Object.keys(values).map((key) => [key, true])));
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      await onValid(values);
    } finally {
      setSubmitting(false);
    }
  };

  /** Apply server-side field errors. */
  const setServerErrors = useCallback((serverErrors) => {
    setErrors((current) => ({ ...current, ...serverErrors }));
  }, []);

  return { values, field, handleSubmit, submitting, setErrors: setServerErrors };
}
