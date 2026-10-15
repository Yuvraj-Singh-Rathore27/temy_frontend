import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './auth/RouteGuards.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import ChatPage from './pages/ChatPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import JoinGroupPage from './pages/JoinGroupPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              {/* One layout route, so the socket connection survives switching conversations. */}
              <Route element={<ChatPage />}>
                <Route path="/" element={null} />
                <Route path="/c/:conversationId" element={null} />
              </Route>
              <Route path="/join/:code" element={<JoinGroupPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
