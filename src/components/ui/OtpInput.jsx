import { useRef } from 'react';
import { cn } from '../../utils/misc.js';

/**
 * Six single-digit boxes that behave like one field: typing moves forward,
 * Backspace moves back, and pasting a whole code fills every box.
 */
export function OtpInput({ value, onChange, length = 6, error, disabled, autoFocus, onComplete }) {
  const refs = useRef([]);
  // Empty boxes are kept as spaces in `value` so clearing a middle digit doesn't shift the rest.
  const digits = Array.from({ length }, (_, i) => (value[i] && value[i] !== ' ' ? value[i] : ''));

  const setDigits = (next) => {
    const code = next.map((d) => d || ' ').join('').trimEnd();
    onChange(code);
    if (code.length === length && !code.includes(' ')) onComplete?.(code);
  };

  const focus = (index) => refs.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  const handleChange = (index, raw) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    const next = [...digits];
    // A paste or autofill can deliver several digits at once.
    for (let i = 0; i < typed.length && index + i < length; i += 1) next[index + i] = typed[i];
    setDigits(next);
    focus(index + typed.length);
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) next[index] = '';
      else if (index > 0) {
        next[index - 1] = '';
        focus(index - 1);
      }
      setDigits(next);
    } else if (event.key === 'ArrowLeft') focus(index - 1);
    else if (event.key === 'ArrowRight') focus(index + 1);
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    setDigits(Array.from({ length }, (_, i) => pasted[i] ?? ''));
    focus(pasted.length);
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Verification code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1}`}
          aria-invalid={error ? true : undefined}
          className={cn(
            'h-control w-full min-w-0 rounded-control border bg-surface text-center text-xl font-semibold text-ink outline-none',
            'transition-[border-color,box-shadow] focus:border-brand-400 focus:shadow-focus disabled:bg-surface-muted',
            error ? 'border-danger' : 'border-line',
          )}
        />
      ))}
    </div>
  );
}
