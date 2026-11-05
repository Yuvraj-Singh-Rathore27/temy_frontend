import { CheckCheck, Leaf, Lock, ShieldCheck, Zap } from 'lucide-react';

export const LOGO_URL = 'https://s3-ap-southeast-1.amazonaws.com/vestdata/images/DistributorProfileImage/noimage.jpg';

const FEATURES = [
  { icon: Zap, text: 'Instant delivery with live typing indicators' },
  { icon: CheckCheck, text: 'Delivered and read receipts on every message' },
  { icon: Lock, text: 'Private one-to-one conversations' },
];

// Fixed positions so the particles look the same on every render.
const PARTICLES = [
  { left: '8%', size: 6, duration: 13, delay: 0 },
  { left: '18%', size: 4, duration: 17, delay: -5 },
  { left: '31%', size: 7, duration: 15, delay: -9 },
  { left: '44%', size: 3, duration: 19, delay: -2 },
  { left: '57%', size: 5, duration: 14, delay: -11 },
  { left: '68%', size: 4, duration: 18, delay: -7 },
  { left: '79%', size: 6, duration: 16, delay: -3 },
  { left: '90%', size: 3, duration: 20, delay: -13 },
];

const HEADLINE = ['Conversations', 'that', 'keep', 'up', 'with'];

/** Decorative leaf shape for the animated background. */
function LeafShape({ className, style }) {
  return (
    <svg viewBox="0 0 64 64" className={className} style={style} aria-hidden>
      <path
        d="M54 8C30 8 10 22 10 44c0 4 1 8 3 12 2-14 12-26 26-32-12 8-20 19-22 33 4 1 7 1 10 1 20 0 30-20 27-50z"
        fill="currentColor"
      />
    </svg>
  );
}

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="vestige-theme min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Brand panel (desktop) ---------- */}
      <aside className="vestige-hero relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="vestige-dots absolute inset-0" aria-hidden />
        {/* SVG text scales with the panel, so the word always fits. */}
        <svg
          viewBox="0 0 1000 170"
          className="v-fade-in pointer-events-none absolute right-6 bottom-2 left-6 select-none"
          style={{ animationDelay: '400ms' }}
          aria-hidden
        >
          <text
            x="500"
            y="150"
            textAnchor="middle"
            textLength="980"
            lengthAdjust="spacingAndGlyphs"
            fontSize="180"
            fontWeight="900"
            fill="none"
            stroke="rgb(255 255 255 / 0.12)"
            strokeWidth="2"
            fontFamily="Inter, Segoe UI, sans-serif"
          >
            VESTIGE
          </text>
        </svg>
        <div className="v-drift absolute -top-32 -right-24 size-[28rem] rounded-full bg-emerald-300/20 blur-3xl" aria-hidden />
        <div
          className="v-drift absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-amber-300/15 blur-3xl"
          style={{ animationDelay: '-6s' }}
          aria-hidden
        />
        <div className="v-spin-slow absolute top-1/2 right-[-10rem] size-[30rem] -translate-y-1/2 rounded-full border border-white/10" aria-hidden>
          <span className="absolute top-6 left-1/2 size-2.5 rounded-full bg-amber-300/80 shadow-[0_0_12px_rgb(252_211_77/0.8)]" />
        </div>

        {PARTICLES.map((p) => (
          <span
            key={p.left}
            className="v-particle"
            style={{ left: p.left, width: p.size, height: p.size, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }}
            aria-hidden
          />
        ))}

        <LeafShape className="v-leaf absolute bottom-[22%] right-[30%] size-9 text-amber-200/25" style={{ animationDelay: '-4s' }} />
        <LeafShape className="v-leaf absolute top-[55%] left-[8%] size-7 text-white/10" style={{ animationDelay: '-8s' }} />

        <div className="v-fade-up relative">
          <Logo light />
        </div>

        <div className="relative max-w-lg">
          <span
            className="v-fade-up inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium tracking-wide text-white/90 backdrop-blur"
            style={{ animationDelay: '120ms' }}
          >
            <Leaf className="size-3.5 text-amber-300" aria-hidden />
            Wellness · Wealth · Since 2004
          </span>
          <h2 className="mt-6 text-4xl leading-tight font-semibold xl:text-5xl">
            {HEADLINE.map((word, i) => (
              <span key={word} className="v-word mr-[0.25em]" style={{ animationDelay: `${250 + i * 90}ms` }}>
                {word}
              </span>
            ))}
            <span className="v-word" style={{ animationDelay: `${250 + HEADLINE.length * 90}ms` }}>
              <span className="v-text-shimmer">you.</span>
            </span>
          </h2>
          <p className="v-fade-up mt-4 max-w-md text-white/75" style={{ animationDelay: '750ms' }}>
            Stay connected with your Vestige team, uplines and customers — fast, private and always in sync.
          </p>
          <ul className="mt-9 space-y-3">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <li
                key={text}
                className="v-fade-up group flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/90 backdrop-blur-sm transition-all duration-300 hover:translate-x-1.5 hover:border-white/25 hover:bg-white/10"
                style={{ animationDelay: `${850 + i * 120}ms` }}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white/25 to-white/5 ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                  <Icon className="size-4.5 text-amber-200" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="v-fade-in relative flex items-center justify-between text-sm text-white/70" style={{ animationDelay: '1300ms' }}>
          <p>
            Powered by <span className="font-semibold text-white">Vestige</span>
          </p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-amber-300" aria-hidden />
            Secure &amp; encrypted
          </p>
        </div>
      </aside>

      {/* ---------- Form side ---------- */}
      <main className="vestige-canvas relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
        <div className="vestige-aurora pointer-events-none absolute -inset-[20%]" aria-hidden />
        <div className="vestige-watermark-text pointer-events-none absolute inset-0" aria-hidden />
        <img
          src={LOGO_URL}
          alt=""
          aria-hidden
          draggable={false}
          className="vestige-watermark-logo v-float-slow pointer-events-none absolute -right-24 -bottom-20 w-[26rem] max-w-[90vw] -rotate-12 select-none"
        />
        <LeafShape className="v-leaf pointer-events-none absolute right-8 bottom-10 size-16 text-brand-500/10" />
        <LeafShape className="v-leaf pointer-events-none absolute top-10 left-8 size-10 text-amber-400/15" style={{ animationDelay: '-6s' }} />

        <div className="relative w-full max-w-md">
          <div className="v-fade-up mb-8 flex justify-center lg:hidden">
            <Logo />
          </div>

          <div className="v-fade-up v-tilt" style={{ animationDelay: '100ms' }}>
            <div className="vestige-glow-border">
              <div className="vestige-card relative overflow-hidden rounded-3xl">
                <div className="vestige-card-bar h-1 w-full" aria-hidden />
                <div className="p-6 sm:p-9">
                  <span
                    className="v-fade-up mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 py-1 pr-3.5 pl-1.5 text-xs font-semibold text-brand-700"
                    style={{ animationDelay: '150ms' }}
                  >
                    <span className="v-namaste flex size-6 items-center justify-center rounded-full bg-surface text-sm shadow-sm" aria-hidden>
                      🙏
                    </span>
                    Welcome to VAKA
                  </span>
                  <h1 className="v-fade-up text-2xl font-semibold tracking-tight text-ink sm:text-3xl" style={{ animationDelay: '200ms' }}>
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="v-fade-up mt-1.5 text-sm text-ink-muted" style={{ animationDelay: '260ms' }}>
                      {subtitle}
                    </p>
                  )}
                  <div className="v-fade-up mt-7" style={{ animationDelay: '340ms' }}>
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {footer && (
            <div className="v-fade-in mt-6 text-center text-sm text-ink-muted" style={{ animationDelay: '600ms' }}>
              {footer}
            </div>
          )}
          <p className="v-fade-in mt-8 flex items-center justify-center gap-1.5 text-xs text-ink-faint lg:hidden" style={{ animationDelay: '700ms' }}>
            <ShieldCheck className="size-3.5 text-brand-500" aria-hidden />
            Powered by Vestige · Secure &amp; encrypted
          </p>
        </div>
      </main>
    </div>
  );
}

export function Logo({ light = false }) {
  return (
    <div className="relative flex items-center gap-3.5">
      <div className="v-pop relative">
        <span
          className={`v-ring absolute inset-0 rounded-2xl ${light ? 'bg-white/40' : 'bg-brand-500/30'}`}
          aria-hidden
        />
        <div className="v-float relative">
          <div className={`v-logo-shine rounded-2xl shadow-lg ${light ? 'ring-4 ring-white/25 shadow-black/20' : 'ring-4 ring-brand-500/15 shadow-brand-600/20'}`}>
            <img src={LOGO_URL} alt="Vestige" className="size-16 bg-white object-contain p-1.5" draggable={false} />
          </div>
        </div>
      </div>
      <div className="leading-tight">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={`text-2xl font-bold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>VAKA</span>
          <span
            className={`v-fade-up inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              light ? 'bg-white/15 text-amber-100 ring-1 ring-white/25' : 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
            }`}
            style={{ animationDelay: '500ms' }}
          >
            <span className="v-namaste inline-block" aria-hidden>
              ☀️
            </span>
            Good Morning Vestigian
          </span>
        </div>
        <span className={`block text-xs font-medium tracking-[0.18em] uppercase ${light ? 'text-amber-200/90' : 'text-brand-600'}`}>
          Connect · Grow · Thrive
        </span>
      </div>
    </div>
  );
}
