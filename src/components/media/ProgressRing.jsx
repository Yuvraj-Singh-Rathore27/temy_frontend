import { cn } from '../../utils/misc.js';

/** Circular progress (0–1) used for uploads and downloads. */
export function ProgressRing({ progress = 0, size = 44, stroke = 3, tone = 'in', className }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const onDark = tone === 'out' || tone === 'dark';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('-rotate-90', className)} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className={onDark ? 'stroke-white/30' : 'stroke-line-strong'} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.max(0.02, Math.min(1, progress)))}
        className={cn('transition-[stroke-dashoffset] duration-200', onDark ? 'stroke-white' : 'stroke-brand-600')}
      />
    </svg>
  );
}
