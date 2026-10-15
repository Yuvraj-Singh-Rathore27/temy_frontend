import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { cn } from '../../utils/misc.js';
import { IconButton } from './Button.jsx';
import { inputClass } from './Input.jsx';
import { Spinner } from './Spinner.jsx';

/**
 * Read-only value with a pencil button; editing shows an input with save/cancel.
 * `onSave(value)` may throw — its message is shown under the field.
 */
export function EditableField({ label, value, placeholder, maxLength, multiline = false, validate, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(value ?? '');
    setError('');
    setEditing(true);
  };

  const save = async () => {
    const problem = validate?.(draft);
    if (problem) return setError(problem);
    if (draft.trim() === (value ?? '').trim()) return setEditing(false);
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation(); // cancel the edit without also closing the surrounding panel
      setEditing(false);
    }
    if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      save();
    }
  };

  const Field = multiline ? 'textarea' : 'input';

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium tracking-wide text-brand-700 uppercase">{label}</p>
      {editing ? (
        <div className="flex items-start gap-1">
          <div className="relative flex-1">
            <Field
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={maxLength}
              rows={multiline ? 3 : undefined}
              aria-label={label}
              aria-invalid={error ? true : undefined}
              className={cn(inputClass, multiline ? 'resize-none py-2' : 'h-10', error && 'border-danger')}
            />
            {maxLength && <span className="absolute right-2 bottom-1 text-2xs text-ink-faint">{maxLength - draft.length}</span>}
          </div>
          {saving ? (
            <Spinner size="sm" className="m-3" />
          ) : (
            <>
              <IconButton icon={Check} label={`Save ${label}`} size="sm" onClick={save} className="mt-1 text-success" />
              <IconButton icon={X} label="Cancel" size="sm" onClick={() => setEditing(false)} className="mt-1" />
            </>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className={cn('flex-1 py-1.5 text-sm break-words whitespace-pre-wrap', value ? 'text-ink' : 'text-ink-faint italic')}>
            {value || placeholder}
          </p>
          <IconButton icon={Pencil} label={`Edit ${label}`} size="sm" onClick={start} />
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
