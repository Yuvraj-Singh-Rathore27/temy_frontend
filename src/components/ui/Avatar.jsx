import { memo, useState } from 'react';
import { assetUrl } from '../../api/client.js';
import { initials } from '../../utils/format.js';
import { avatarColor, cn } from '../../utils/misc.js';

const SIZES = {
  sm: { box: 'size-8 text-xs', dot: 'size-2.5' },
  md: { box: 'size-11 text-sm', dot: 'size-3' },
  lg: { box: 'size-14 text-base', dot: 'size-3.5' },
  xl: { box: 'size-28 text-3xl', dot: 'size-5' },
};

/** Profile photo (or initials) with an optional online dot. */
export const Avatar = memo(function Avatar({ user, size = 'md', showStatus = false, className }) {
  const s = SIZES[size];
  const src = assetUrl(user?.avatarUrl);
  // Remember which URL failed so a new photo gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = src && failedSrc !== src;

  return (
    <div className={cn('relative shrink-0', className)}>
      {showImage ? (
        <img
          src={src}
          alt=""
          className={cn('rounded-full bg-surface-sunken object-cover', s.box)}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className={cn('flex items-center justify-center rounded-full font-semibold', s.box, avatarColor(user?.id))} aria-hidden>
          {initials(user?.name)}
        </div>
      )}
      {showStatus && user?.isOnline && (
        <span className={cn('absolute right-0 bottom-0 rounded-full bg-online ring-2 ring-surface', s.dot)} aria-label="Online" />
      )}
    </div>
  );
});
