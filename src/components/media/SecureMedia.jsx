import { forwardRef, useCallback, useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { assetUrl } from '../../api/client.js';
import { fetchAttachmentBytes, refreshMediaSession } from '../../api/files.js';
import { decryptedUrl, isEncryptedFile } from '../../e2ee/session.js';
import { cn } from '../../utils/misc.js';

/**
 * Source URL for a private attachment. On a load error (usually an expired
 * media cookie) it refreshes the session once and retries with a cache-buster.
 * Local blob: URLs (uploads in progress) are used as-is.
 */
export function useSecureSrc(url) {
  const encrypted = Boolean(url) && isEncryptedFile(url);
  const plain = usePlainSrc(encrypted ? null : url);
  const decrypted = useDecryptedSrc(encrypted ? url : null);
  return encrypted ? decrypted : plain;
}

/** End-to-end encrypted file: download, decrypt on this device, show from memory. */
function useDecryptedSrc(url) {
  const [state, setState] = useState({ url: null, src: null, failed: false });
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    decryptedUrl(url, fetchAttachmentBytes)
      .then((src) => alive && setState({ url, src, failed: !src }))
      .catch(() => alive && setState({ url, src: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [url]);
  const current = state.url === url;
  return { src: current ? state.src : null, onError: () => {}, failed: current && state.failed };
}

function usePlainSrc(url) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const isLocal = url?.startsWith('blob:');
  const base = isLocal ? url : assetUrl(url);
  const src = !base ? null : attempt === 0 || isLocal ? base : `${base}${base.includes('?') ? '&' : '?'}r=${attempt}`;

  const onError = useCallback(async () => {
    if (isLocal || attempt >= 1) return setFailed(true);
    await refreshMediaSession();
    setAttempt((n) => n + 1);
  }, [attempt, isLocal]);

  return { src, onError, failed };
}

export function SecureImage({ url, alt = '', className, ...props }) {
  const { src, onError, failed } = useSecureSrc(url);
  // Still decrypting / loading: a quiet placeholder rather than the "unavailable" icon.
  if (!failed && !src && url) return <div className={cn('animate-pulse bg-surface-sunken', className)} aria-busy="true" />;
  if (failed || !src) {
    return (
      <div className={cn('flex items-center justify-center bg-surface-sunken text-ink-faint', className)} role="img" aria-label="Image unavailable">
        <ImageOff className="size-6" />
      </div>
    );
  }
  return <img src={src} alt={alt} onError={onError} className={className} draggable={false} {...props} />;
}

export const SecureVideo = forwardRef(function SecureVideo({ url, posterUrl, className, ...props }, ref) {
  const { src, onError } = useSecureSrc(url);
  const poster = useSecureSrc(posterUrl);
  return <video ref={ref} src={src ?? undefined} poster={poster.src ?? undefined} onError={onError} className={className} {...props} />;
});
