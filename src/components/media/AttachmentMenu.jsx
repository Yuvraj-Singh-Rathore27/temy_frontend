import { useCallback, useRef, useState } from 'react';
import { Camera, FileText, Headphones, Image as ImageIcon, MapPin, Paperclip } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { IconButton } from '../ui/Button.jsx';

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

/** 📎 menu: photos & videos, camera (phones), documents, audio, location. Calls onPick(File[]) or onShareLocation(). */
export function AttachmentMenu({ onPick, onShareLocation, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputs = { media: useRef(null), camera: useRef(null), document: useRef(null), audio: useRef(null) };
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const choose = (name) => {
    close();
    if (name === 'location') onShareLocation?.();
    else inputs[name].current?.click();
  };

  const handleFiles = (event) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // allow picking the same file again
    if (files.length) onPick(files);
  };

  const options = [
    { name: 'media', label: 'Photos & videos', icon: ImageIcon, color: 'bg-violet-500' },
    isTouch() && { name: 'camera', label: 'Camera', icon: Camera, color: 'bg-rose-500' },
    { name: 'document', label: 'Document', icon: FileText, color: 'bg-sky-500' },
    { name: 'audio', label: 'Audio', icon: Headphones, color: 'bg-amber-500' },
    onShareLocation && { name: 'location', label: 'Location', icon: MapPin, color: 'bg-emerald-500' },
  ].filter(Boolean);

  return (
    <div className="relative" ref={ref}>
      <IconButton icon={Paperclip} label="Attach" className="size-control" onClick={() => setOpen((v) => !v)} disabled={disabled} aria-expanded={open} />
      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-52 animate-fade-in rounded-card border border-line bg-surface p-1.5 shadow-pop">
          {options.map(({ name, label, icon: Icon, color }) => (
            <button
              key={name}
              type="button"
              role="menuitem"
              onClick={() => choose(name)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-ink-soft hover:bg-surface-sunken"
            >
              <span className={`flex size-8 items-center justify-center rounded-full text-white ${color}`}>
                <Icon className="size-4" aria-hidden />
              </span>
              {label}
            </button>
          ))}
        </div>
      )}
      <input ref={inputs.media} type="file" accept="image/*,video/*" multiple hidden onChange={handleFiles} />
      <input ref={inputs.camera} type="file" accept="image/*" capture="environment" hidden onChange={handleFiles} />
      <input ref={inputs.document} type="file" multiple hidden onChange={handleFiles} />
      <input ref={inputs.audio} type="file" accept="audio/*" multiple hidden onChange={handleFiles} />
    </div>
  );
}
