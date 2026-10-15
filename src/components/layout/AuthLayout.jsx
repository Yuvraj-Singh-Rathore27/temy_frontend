import { CheckCheck, Lock, Zap } from 'lucide-react';
import { Card } from '../ui/Card.jsx';

export const LOGO_URL = 'https://s3-ap-southeast-1.amazonaws.com/vestdata/images/DistributorProfileImage/noimage.jpg';

const FEATURES = [
  { icon: Zap, text: 'Instant delivery with live typing indicators' },
  { icon: CheckCheck, text: 'Delivered and read receipts on every message' },
  { icon: Lock, text: 'Private one-to-one conversations' },
];

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand-strong p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <Logo light />
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-semibold">Conversations that keep up with you.</h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/85">
                <span className="flex size-9 items-center justify-center rounded-full bg-white/10">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">Powered by Vestige</p>
      </aside>

      <main className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <Card className="p-6 sm:p-8">
            <h1 className="text-2xl font-semibold text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </Card>
          {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function Logo({ light = false }) {
  return (
    <div className="relative flex items-center gap-2.5">
      <img src={LOGO_URL} alt="" className="size-16 rounded-2xl bg-white object-contain p-1" draggable={false} />
      <span className={`text-2xl font-semibold ${light ? 'text-white' : 'text-ink'}`}>Vestige Chat</span>
    </div>
  );
}
