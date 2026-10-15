import { memo } from 'react';
import { cn } from '../../utils/misc.js';
import { stickerLabel } from './builtin.js';

/**
 * A built-in sticker: "blob:<name>" (the Vestige Chat blob, drawn in SVG) or
 * "emoji:<emoji>" (a big emoji with a white die-cut outline).
 */
export const Sticker = memo(function Sticker({ value, size = 128, className }) {
  if (value?.startsWith('emoji:')) {
    return (
      <span
        role="img"
        aria-label={stickerLabel(value)}
        className={cn('inline-flex items-center justify-center leading-none select-none', className)}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.72,
          filter:
            'drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff) drop-shadow(0 3px 4px rgb(0 0 0 / 0.25))',
        }}
      >
        {value.slice(6)}
      </span>
    );
  }
  const name = value?.startsWith('blob:') ? value.slice(5) : 'hi';
  return <BlobSticker name={name} size={size} className={className} label={stickerLabel(value)} />;
});

// ---- The Vestige Chat blob ----

const INK = '#3b2a22';
const BODY = '#ffcb45';
const BODY_EDGE = '#e8a300';
const BLUSH = '#ff8f7e';
const TEAR = '#5bc0f8';

const eyes = {
  dot: (
    <>
      <circle cx="47" cy="58" r="5.5" fill={INK} />
      <circle cx="73" cy="58" r="5.5" fill={INK} />
      <circle cx="49" cy="56" r="1.8" fill="#fff" />
      <circle cx="75" cy="56" r="1.8" fill="#fff" />
    </>
  ),
  happy: (
    <g fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round">
      <path d="M40 60 Q47 50 54 60" />
      <path d="M66 60 Q73 50 80 60" />
    </g>
  ),
  closed: (
    <g fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round">
      <path d="M40 57 Q47 63 54 57" />
      <path d="M66 57 Q73 63 80 57" />
    </g>
  ),
  wide: (
    <>
      <circle cx="46" cy="56" r="8.5" fill="#fff" stroke={INK} strokeWidth="2" />
      <circle cx="74" cy="56" r="8.5" fill="#fff" stroke={INK} strokeWidth="2" />
      <circle cx="46" cy="57" r="4.5" fill={INK} />
      <circle cx="74" cy="57" r="4.5" fill={INK} />
    </>
  ),
  hearts: (
    <g fill="#ff4d6d">
      <path d="M47 66 C36 58 38 49 44 49 C46.5 49 47 51 47 52 C47 51 47.5 49 50 49 C56 49 58 58 47 66Z" />
      <path d="M73 66 C62 58 64 49 70 49 C72.5 49 73 51 73 52 C73 51 73.5 49 76 49 C82 49 84 58 73 66Z" />
    </g>
  ),
  aside: (
    <>
      <circle cx="51" cy="60" r="5" fill={INK} />
      <circle cx="77" cy="60" r="5" fill={INK} />
    </>
  ),
  half: (
    <g stroke={INK} strokeWidth="4" strokeLinecap="round">
      <path d="M40 58 H54" />
      <path d="M66 58 H80" />
      <circle cx="47" cy="61" r="3" fill={INK} stroke="none" />
      <circle cx="73" cy="61" r="3" fill={INK} stroke="none" />
    </g>
  ),
};

const mouths = {
  smile: <path d="M50 74 Q60 84 70 74" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />,
  grin: (
    <>
      <path d="M46 72 Q60 92 74 72 Z" fill={INK} />
      <path d="M53 81 Q60 87 67 81 Q60 78 53 81Z" fill="#ff7a8a" />
    </>
  ),
  o: <ellipse cx="60" cy="79" rx="6" ry="8" fill={INK} />,
  smallO: <ellipse cx="60" cy="78" rx="3.5" ry="4.5" fill={INK} />,
  frown: <path d="M50 82 Q60 72 70 82" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />,
  wail: <path d="M48 84 Q60 66 72 84 Z" fill={INK} />,
  flat: <path d="M52 78 H68" stroke={INK} strokeWidth="4" strokeLinecap="round" />,
  wavy: <path d="M50 78 Q55 74 60 78 T70 78" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />,
  smirk: <path d="M50 77 Q62 82 72 72" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />,
};

const blush = (
  <g fill={BLUSH} opacity="0.75">
    <ellipse cx="36" cy="70" rx="7" ry="4.5" />
    <ellipse cx="84" cy="70" rx="7" ry="4.5" />
  </g>
);

function Banner({ text, color = '#ff4d6d' }) {
  return (
    <g transform="rotate(-6 60 104)">
      <rect x={60 - text.length * 7 - 8} y="93" width={text.length * 14 + 16} height="22" rx="11" fill={color} stroke="#fff" strokeWidth="3" />
      <text x="60" y="109" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="15" fill="#fff" letterSpacing="0.5">
        {text}
      </text>
    </g>
  );
}

const Heart = ({ x, y, s = 1, color = '#ff4d6d' }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 8 C-9 1 -7 -6 -2.5 -6 C-1 -6 0 -4.5 0 -3.5 C0 -4.5 1 -6 2.5 -6 C7 -6 9 1 0 8Z" fill={color} />
);

/** Each sticker: eyes, mouth and extras drawn on the shared blob. */
const DESIGNS = {
  hi: {
    eyes: 'happy',
    mouth: 'grin',
    extra: (
      <>
        {blush}
        <g transform="rotate(20 98 40)">
          <ellipse cx="98" cy="42" rx="10" ry="12" fill={BODY} stroke={BODY_EDGE} strokeWidth="2.5" />
          <path d="M108 30 l6 -5 M110 40 l8 -1 M106 21 l3 -7" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <Banner text="HI!" color="#3b82f6" />
      </>
    ),
  },
  love: {
    eyes: 'hearts',
    mouth: 'smile',
    extra: (
      <>
        {blush}
        <Heart x={98} y={22} s={1.4} />
        <Heart x={22} y={30} s={0.9} />
      </>
    ),
  },
  laugh: {
    eyes: 'happy',
    mouth: 'grin',
    extra: (
      <>
        <path d="M34 62 q-6 10 0 14 q6 -4 0 -14Z" fill={TEAR} />
        <path d="M86 62 q-6 10 0 14 q6 -4 0 -14Z" fill={TEAR} />
        <Banner text="HAHA" color="#f59e0b" />
      </>
    ),
  },
  wow: {
    eyes: 'wide',
    mouth: 'o',
    extra: (
      <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
        <path d="M98 16 v14" />
        <circle cx="98" cy="37" r="2" fill={INK} stroke="none" />
        <path d="M108 22 v10" />
        <circle cx="108" cy="37" r="2" fill={INK} stroke="none" />
      </g>
    ),
  },
  sad: {
    eyes: 'dot',
    mouth: 'frown',
    extra: (
      <>
        <path d="M38 47 L52 51 M82 47 L68 51" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M74 66 q-5 9 0 12 q5 -3 0 -12Z" fill={TEAR} />
      </>
    ),
  },
  cry: {
    eyes: 'closed',
    mouth: 'wail',
    extra: (
      <g fill={TEAR}>
        <path d="M40 60 h10 v32 q-5 6 -10 0Z" opacity="0.9" />
        <path d="M70 60 h10 v32 q-5 6 -10 0Z" opacity="0.9" />
      </g>
    ),
  },
  angry: {
    body: '#ff8a5c',
    edge: '#e05a2b',
    eyes: 'dot',
    mouth: 'frown',
    extra: (
      <>
        <path d="M38 47 L54 53 M82 47 L66 53" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
        <g fill="#fff" opacity="0.9">
          <circle cx="18" cy="26" r="6" />
          <circle cx="26" cy="20" r="5" />
          <circle cx="102" cy="26" r="6" />
          <circle cx="94" cy="20" r="5" />
        </g>
      </>
    ),
  },
  cool: {
    eyes: null,
    mouth: 'smirk',
    extra: (
      <g>
        <rect x="34" y="49" width="22" height="14" rx="6" fill={INK} />
        <rect x="64" y="49" width="22" height="14" rx="6" fill={INK} />
        <path d="M56 54 H64" stroke={INK} strokeWidth="3.5" />
        <path d="M38 52 L45 52" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <path d="M68 52 L75 52" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      </g>
    ),
  },
  party: {
    eyes: 'happy',
    mouth: 'grin',
    extra: (
      <>
        <g transform="rotate(-14 60 20)">
          <path d="M46 30 L60 0 L74 30 Z" fill="#8b5cf6" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M50 22 L70 22 M54 14 L66 14" stroke="#fcd34d" strokeWidth="3" />
          <circle cx="60" cy="0" r="4" fill="#f43f5e" />
        </g>
        <g>
          <rect x="14" y="40" width="5" height="9" rx="1" fill="#22c55e" transform="rotate(25 16 44)" />
          <rect x="100" y="52" width="5" height="9" rx="1" fill="#3b82f6" transform="rotate(-30 102 56)" />
          <circle cx="104" cy="30" r="3" fill="#f43f5e" />
          <circle cx="20" cy="70" r="3" fill="#f59e0b" />
        </g>
      </>
    ),
  },
  thanks: {
    eyes: 'happy',
    mouth: 'smile',
    extra: (
      <>
        {blush}
        <Heart x={100} y={30} s={1.1} />
        <Banner text="THANKS!" color="#10b981" />
      </>
    ),
  },
  sleepy: {
    eyes: 'closed',
    mouth: 'smallO',
    extra: (
      <g fontFamily="system-ui, sans-serif" fontWeight="900" fill="#6366f1" stroke="#fff" strokeWidth="1.5" paintOrder="stroke">
        <text x="88" y="34" fontSize="20">Z</text>
        <text x="102" y="20" fontSize="14">z</text>
        <text x="110" y="10" fontSize="10">z</text>
      </g>
    ),
  },
  thinking: {
    eyes: 'aside',
    mouth: 'wavy',
    extra: (
      <>
        <path d="M38 46 Q46 40 54 46" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <text x="96" y="36" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="30" fill="#8b5cf6" stroke="#fff" strokeWidth="2" paintOrder="stroke">
          ?
        </text>
      </>
    ),
  },
  ok: {
    eyes: 'happy',
    mouth: 'smile',
    extra: (
      <>
        <g transform="translate(92 56)">
          <rect x="-8" y="0" width="18" height="20" rx="6" fill={BODY} stroke={BODY_EDGE} strokeWidth="2.5" />
          <rect x="-4" y="-16" width="8" height="20" rx="4" fill={BODY} stroke={BODY_EDGE} strokeWidth="2.5" />
        </g>
        <Banner text="OK!" color="#22c55e" />
      </>
    ),
  },
  no: {
    eyes: 'half',
    mouth: 'flat',
    extra: (
      <>
        <path d="M36 98 L84 70 M36 70 L84 98" stroke={BODY_EDGE} strokeWidth="9" strokeLinecap="round" />
        <Banner text="NOPE" color="#ef4444" />
      </>
    ),
  },
  hug: {
    eyes: 'closed',
    mouth: 'smile',
    extra: (
      <>
        {blush}
        <path d="M14 66 Q8 88 30 92" fill="none" stroke={BODY_EDGE} strokeWidth="7" strokeLinecap="round" />
        <path d="M106 66 Q112 88 90 92" fill="none" stroke={BODY_EDGE} strokeWidth="7" strokeLinecap="round" />
        <Heart x={60} y={18} s={1.2} />
      </>
    ),
  },
  shy: {
    eyes: 'aside',
    mouth: 'wavy',
    extra: (
      <g fill={BLUSH}>
        <ellipse cx="38" cy="70" rx="10" ry="6" />
        <ellipse cx="86" cy="70" rx="10" ry="6" />
        <path d="M30 68 l4 -3 M34 72 l4 -3 M80 68 l4 -3 M86 72 l4 -3" stroke="#e85d4f" strokeWidth="1.5" />
      </g>
    ),
  },
};

const BlobSticker = memo(function BlobSticker({ name, size, className, label }) {
  const design = DESIGNS[name] ?? DESIGNS.hi;
  const body = design.body ?? BODY;
  const edge = design.edge ?? BODY_EDGE;
  const blobPath = 'M60 14 C92 14 104 36 104 62 C104 90 86 104 60 104 C34 104 16 90 16 62 C16 36 28 14 60 14Z';
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={label} className={cn('select-none', className)}>
      <defs>
        <filter id={`sticker-shadow-${name}`} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter={`url(#sticker-shadow-${name})`}>
        {/* Die-cut white border */}
        <path d={blobPath} fill="#fff" stroke="#fff" strokeWidth="10" strokeLinejoin="round" />
        <path d={blobPath} fill={body} stroke={edge} strokeWidth="3" />
        <ellipse cx="44" cy="30" rx="12" ry="6" fill="#fff" opacity="0.35" transform="rotate(-20 44 30)" />
        {design.eyes && eyes[design.eyes]}
        {mouths[design.mouth]}
        {design.extra}
      </g>
    </svg>
  );
});
