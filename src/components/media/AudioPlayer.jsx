import { memo, useEffect, useRef, useState } from 'react';
import { Mic, Music, Pause, Play } from 'lucide-react';
import { formatDuration } from '../../utils/media.js';
import { cn } from '../../utils/misc.js';
import { useSecureSrc } from './SecureMedia.jsx';

const SPEEDS = [1, 1.5, 2];
let currentlyPlaying = null; // only one clip plays at a time

/**
 * Player for voice messages and audio files: play/pause, seekable progress,
 * time, and playback speed (voice notes). `tone` matches the bubble colours.
 */
export const AudioPlayer = memo(function AudioPlayer({ attachment, tone = 'in' }) {
  const audioRef = useRef(null);
  const { src, onError, failed } = useSecureSrc(attachment.url ?? attachment.previewUrl);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState((attachment.durationMs ?? 0) / 1000);
  const [speed, setSpeed] = useState(1);
  const voice = attachment.kind === 'voice';
  const onBrand = tone === 'out';

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (currentlyPlaying === audio) currentlyPlaying = null;
    };
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.pause();
      currentlyPlaying = audio;
      try {
        await audio.play();
      } catch {
        // Autoplay restrictions or a load error; the error handler covers the latter.
      }
    } else {
      audio.pause();
    }
  };

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration;
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = duration ? Math.min(1, position / duration) : 0;

  return (
    <div className="flex w-64 max-w-full items-center gap-3 py-1">
      <button
        type="button"
        onClick={toggle}
        disabled={failed || !src}
        aria-label={playing ? 'Pause' : 'Play'}
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
          onBrand ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-brand-600 text-white hover:bg-brand-strong',
        )}
      >
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        {!voice && <p className={cn('mb-1 truncate text-xs font-medium', onBrand ? 'text-white' : 'text-ink')}>{attachment.name}</p>}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          onClick={seek}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio) return;
            if (e.key === 'ArrowRight') audio.currentTime = Math.min(duration, audio.currentTime + 5);
            if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
          }}
          className="group relative h-4 cursor-pointer"
        >
          <div className={cn('absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full', onBrand ? 'bg-white/30' : 'bg-line-strong')} />
          <div
            className={cn('absolute top-1/2 h-1 -translate-y-1/2 rounded-full', onBrand ? 'bg-white' : 'bg-brand-600')}
            style={{ width: `${progress * 100}%` }}
          />
          <div
            className={cn('absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full', onBrand ? 'bg-white' : 'bg-brand-600')}
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <div className={cn('mt-0.5 flex items-center justify-between text-2xs', onBrand ? 'text-white/75' : 'text-ink-muted')}>
          <span>{formatDuration((playing || position ? position : duration) * 1000)}</span>
          {failed ? (
            <span className="text-danger">Unavailable</span>
          ) : voice ? (
            <button type="button" onClick={cycleSpeed} className="rounded-full px-1.5 font-semibold" aria-label="Playback speed">
              {speed}×
            </button>
          ) : null}
        </div>
      </div>
      {voice ? (
        <Mic className={cn('size-5 shrink-0', onBrand ? 'text-white/70' : 'text-brand-500')} aria-hidden />
      ) : (
        <Music className={cn('size-5 shrink-0', onBrand ? 'text-white/70' : 'text-ink-faint')} aria-hidden />
      )}
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        onError={onError}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
      />
    </div>
  );
});
