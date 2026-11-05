import { FileText, MessageCircleMore, MonitorSmartphone, Phone, Search, ShieldCheck } from 'lucide-react';

export const LOGO_URL = 'https://s3-ap-southeast-1.amazonaws.com/vestdata/images/DistributorProfileImage/noimage.jpg';

const FEATURES = [
  { icon: MessageCircleMore, lines: ['Group chats', 'up to 256 members'] },
  { icon: Phone, lines: ['Voice & video calls', 'with screen sharing'] },
  { icon: FileText, lines: ['Share files, media', 'and locations'] },
  { icon: Search, lines: ['Search messages'] },
  { icon: ShieldCheck, lines: ['Encrypted & secure', 'with complete logs'] },
  { icon: MonitorSmartphone, lines: ['Works on mobile,', 'tablet and desktop'] },
];

/** Neon ribbons in the four corners. Stretches with the screen so they stay in the corners. */
function Background() {
  return (
    <div className="vaka-bg" aria-hidden>
      <span className="vaka-dots vaka-dots-tl" />
      <span className="vaka-dots vaka-dots-br" />
      <svg className="vaka-waves" viewBox="0 0 1451 739" preserveAspectRatio="none">
        <defs>
          <linearGradient id="vaka-lime" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#0fb24a" />
            <stop offset="0.55" stopColor="#7fe02a" />
            <stop offset="1" stopColor="#e2f53a" />
          </linearGradient>
          <linearGradient id="vaka-lime-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0fb24a" stopOpacity="0" />
            <stop offset="0.4" stopColor="#3fce3a" />
            <stop offset="1" stopColor="#d6f53a" />
          </linearGradient>
          <linearGradient id="vaka-cyan" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#0a6f8c" />
            <stop offset="0.5" stopColor="#12c2d8" />
            <stop offset="1" stopColor="#35e39a" />
          </linearGradient>
          <linearGradient id="vaka-deep" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#012e3c" stopOpacity="0" />
            <stop offset="0.6" stopColor="#04566a" stopOpacity="0.75" />
            <stop offset="1" stopColor="#0a8f8f" stopOpacity="0.9" />
          </linearGradient>
          <filter id="vaka-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <g className="vaka-wave">
          <path d="M0 206C100 170 200 94 268 0H222C156 70 76 128 0 160Z" fill="url(#vaka-lime)" opacity="0.2" />
          <path d="M0 156C74 128 152 70 218 0H188C130 58 66 104 0 130Z" fill="url(#vaka-lime)" />
          <path d="M0 168C80 138 164 78 234 0" fill="none" stroke="#c8f53a" strokeWidth="6" opacity="0.55" filter="url(#vaka-blur)" />
        </g>

        <g className="vaka-wave vaka-wave-slow">
          <path d="M960 112C1130 134 1300 92 1451 18V112C1300 160 1110 160 960 112Z" fill="url(#vaka-deep)" />
          <path d="M1000 104C1170 124 1330 104 1451 58V68C1330 114 1170 134 1000 106Z" fill="url(#vaka-cyan)" opacity="0.85" />
          <path d="M1120 94C1260 92 1376 48 1451 2V44C1372 82 1260 108 1120 96Z" fill="url(#vaka-lime-fade)" />
          <path d="M1120 94C1260 92 1376 48 1451 2" fill="none" stroke="#d2f53a" strokeWidth="5" opacity="0.4" filter="url(#vaka-blur)" />
        </g>

        <g className="vaka-wave vaka-wave-slow">
          <path d="M0 668C70 688 140 716 214 739H150C96 722 46 704 0 692Z" fill="url(#vaka-cyan)" opacity="0.9" />
          <path d="M0 692C46 704 96 722 150 739H62C40 732 20 726 0 722Z" fill="url(#vaka-lime)" />
          <path d="M0 668C70 688 140 716 214 739" fill="none" stroke="#35e3c8" strokeWidth="5" opacity="0.5" filter="url(#vaka-blur)" />
        </g>

        <g className="vaka-wave">
          <path d="M888 739C1000 690 1130 646 1250 660C1330 670 1396 660 1451 628V739Z" fill="url(#vaka-deep)" />
          <path d="M900 739C1010 690 1140 656 1250 668C1330 678 1396 668 1451 640V676C1396 700 1330 708 1250 698C1150 686 1050 704 960 739Z" fill="url(#vaka-cyan)" />
          <path d="M1120 690C1190 662 1270 664 1340 682" fill="none" stroke="#c9fbff" strokeWidth="9" opacity="0.8" filter="url(#vaka-blur)" />
          <path d="M1190 739C1270 712 1372 712 1451 668V712C1400 730 1350 734 1310 739Z" fill="url(#vaka-lime)" opacity="0.95" />
          <path d="M888 739C1000 690 1130 646 1250 660" fill="none" stroke="#a8ef2c" strokeWidth="3" opacity="0.8" />
        </g>
      </svg>
    </div>
  );
}

function SunIcon() {
  return (
    <svg className="vaka-sun" viewBox="0 0 40 40" aria-hidden>
      <g stroke="#ffc928" strokeWidth="2.2" strokeLinecap="round">
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="20" y1="2.5" x2="20" y2="7" transform={`rotate(${i * 30} 20 20)`} />
        ))}
      </g>
      <circle cx="20" cy="20" r="9.5" fill="#ffd21f" />
      <circle cx="20" cy="20" r="9.5" fill="#ff9d0a" opacity="0.28" />
    </svg>
  );
}

/** Three-person icon on the card badge. */
function GroupIcon() {
  return (
    <svg className="vaka-group" viewBox="0 0 32 28" aria-hidden>
      <circle cx="7.5" cy="10" r="4" fill="#8b5cf6" />
      <path d="M1 24c0-5 3-8 6.5-8S14 19 14 24c-4 1.800-9 1.800-13 0Z" fill="#6d5ef7" />
      <circle cx="24.500" cy="10" r="4" fill="#f472b6" />
      <path d="M18 24c0-5 3-8 6.500-8S31 19 31 24c-4 1.800-9 1.800-13 0Z" fill="#ec4899" />
      <circle cx="16" cy="7.500" r="5" fill="#fbbf24" />
      <path d="M8 26c0-7 3.500-11 8-11s8 4 8 11c-5 2-11 2-16 0Z" fill="#f97316" />
    </svg>
  );
}

/** `hideHeading` keeps the title for screen readers but hides it on screen (Login). */
export function AuthLayout({ title, subtitle, children, footer, hideHeading = false }) {
  return (
    // data-theme="dark" keeps every `dark:` style inside this screen dark, whatever the app theme is.
    <div className="vestige-theme vaka-auth" data-theme="dark">
      <Background />

      <div className="vaka-grid">
        <section className="vaka-brand">
          <div className="vaka-logo v-pop">
            <span className="vaka-ring vaka-ring-outer" aria-hidden />
            <span className="vaka-ring" aria-hidden />
            <div className="vaka-tile">
              <img src={LOGO_URL} alt="Vestige" draggable={false} />
            </div>
          </div>

          <p className="vaka-greeting v-fade-up" style={{ animationDelay: '150ms' }}>
            <SunIcon />
            Good Morning Vestigians
          </p>

          <p className="vaka-name v-fade-up" style={{ animationDelay: '250ms' }}>
            VAKA
          </p>

          <p className="vaka-tagline v-fade-up" style={{ animationDelay: '350ms' }}>
            Conversations that
            <br />
            keep up with{' '}
            <span className="vaka-you">
              you.
              <svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden>
                <path d="M2 9C40 3 82 2 118 5" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" />
              </svg>
            </span>
          </p>
        </section>

        <main className="vaka-form">
          <div className="vaka-card v-fade-up" style={{ animationDelay: '200ms' }}>
            <p className="vaka-badge">
              <GroupIcon />
              <span>
                Welcome to <b>VAKA</b>
              </span>
            </p>

            <h1 className={hideHeading ? 'sr-only' : 'mt-5 text-2xl font-semibold tracking-tight text-ink'}>{title}</h1>
            {subtitle && <p className={hideHeading ? 'sr-only' : 'mt-1.5 text-sm text-ink-muted'}>{subtitle}</p>}

            <div className={hideHeading ? 'mt-5' : 'mt-6'}>{children}</div>
          </div>

          {footer && (
            <div className="vaka-footer v-fade-in" style={{ animationDelay: '600ms' }}>
              {footer}
            </div>
          )}
        </main>

        <ul className="vaka-features">
          {FEATURES.map(({ icon: Icon, lines }, i) => (
            <li key={lines[0]} className="vaka-feature v-fade-up" style={{ animationDelay: `${450 + i * 80}ms` }}>
              <Icon aria-hidden />
              <span>
                {lines[0]}
                {lines[1] && (
                  <>
                    <br />
                    {lines[1]}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
