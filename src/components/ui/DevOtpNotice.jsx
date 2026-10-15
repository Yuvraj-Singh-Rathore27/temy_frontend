import { FlaskConical } from 'lucide-react';

/**
 * Development-only helper: the server returns the code in its response when no
 * email server is configured. Production servers never send it, so this never shows there.
 */
export function DevOtpNotice({ code, onUse }) {
  if (!code) return null;
  return (
    <div className="flex items-center gap-3 rounded-control border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <p className="flex-1">
        Development mode — your code is <strong className="font-mono tracking-widest">{code}</strong>
      </p>
      {onUse && (
        <button type="button" onClick={() => onUse(code)} className="font-medium text-amber-900 underline dark:text-amber-100 underline-offset-2">
          Fill in
        </button>
      )}
    </div>
  );
}
