import { lazy, Suspense } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '../../utils/misc.js';

// Leaflet (~150 KB) loads only when the first map is shown.
const LeafletMap = lazy(() => import('./LeafletMap.jsx'));

function Placeholder({ className }) {
  return (
    <div className={cn('flex items-center justify-center bg-surface-sunken text-ink-faint', className)}>
      <MapPin className="size-7 animate-pulse" aria-hidden />
    </div>
  );
}

export function LocationMap({ className, ...props }) {
  return (
    <Suspense fallback={<Placeholder className={className} />}>
      <LeafletMap className={className} {...props} />
    </Suspense>
  );
}
