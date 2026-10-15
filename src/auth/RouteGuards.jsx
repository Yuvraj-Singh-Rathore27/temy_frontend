import { WifiOff } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/Button.jsx';
import { FullPageSpinner } from '../components/ui/Spinner.jsx';
import { EmptyState } from '../components/ui/States.jsx';
import { useAuth } from './AuthContext.jsx';

function ServerUnavailable() {
  const { retry } = useAuth();
  return (
    <div className="app-height flex items-center justify-center">
      <EmptyState
        icon={WifiOff}
        title="Can't reach the server"
        description="Check your internet connection or make sure the API server is running."
        action={<Button onClick={retry}>Try again</Button>}
      />
    </div>
  );
}

/** Only signed-in users; everyone else is sent to /login (and returned afterwards). */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner label="Restoring your session…" />;
  if (status === 'offline') return <ServerUnavailable />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Login / register pages: signed-in users go straight to the app. */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') {
    const from = location.state?.from?.pathname;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }
  return <Outlet />;
}
