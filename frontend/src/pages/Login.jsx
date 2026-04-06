import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuthStore } from '../store/useAuthStore';
import { authService } from '../services/api';

export default function Login() {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const setUserId = useAuthStore((state) => state.setUserId);
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const userId = useAuthStore((state) => state.userId);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const verifyAuth = async () => {
      if (userId) {
        try {
          setIsLoading(true);
          const data = await authService.checkStatus(userId);
          if (data && data.authenticated === true) {
            setAuthenticated(true);
            navigate('/chat');
          } else {
            setAuthenticated(false);
          }
        } catch (err) {
          console.error('Auth status check failed:', err);
          setAuthenticated(false);
        } finally {
          setIsLoading(false);
        }
      }
    };
    verifyAuth();
  }, [userId, navigate, setAuthenticated, searchParams]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) {
      setError('Please enter a user ID');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      setUserId(inputValue);
      const data = await authService.getLoginInfo(inputValue);

      if (data && data.auth_url) {
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          data.auth_url,
          'Google Login',
          `width=${width},height=${height},left=${left},top=${top},popup=yes`
        );

        const pollInterval = setInterval(async () => {
          try {
            if (popup && popup.closed) {
              clearInterval(pollInterval);
              setIsLoading(false);
            }
            const statusData = await authService.checkStatus(inputValue);
            if (statusData && statusData.authenticated === true) {
              clearInterval(pollInterval);
              if (popup && !popup.closed) popup.close();
              setAuthenticated(true);
              navigate('/chat');
            }
          } catch (_) {}
        }, 2000);
      } else {
        setError('Failed to get authentication URL. Please try again.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">

      {/* Ambient glow orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-accent/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/4 blur-[100px]" />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-sm animate-fade-in-up">
        {/* Top accent line */}
        <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

        <div className="bg-bg-surface border border-border rounded-3xl p-8 shadow-card">

          {/* Logo mark */}
          <div className="flex flex-col items-center mb-8">
            <div className="h-12 w-12 rounded-2xl mb-5 overflow-hidden">
              <img src="/bot.png" alt="Workspace AI Logo" className="h-full w-full object-cover" />
            </div>
            <h1 className="text-xl font-semibold text-ink-primary tracking-tight">
              Workspace AI
            </h1>
            <p className="mt-1 text-sm text-ink-secondary text-center">
              Sign in with your Google Workspace to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="user-id"
                className="block text-xs font-medium text-ink-secondary mb-1.5 uppercase tracking-wider"
              >
                User ID
              </label>
              <Input
                id="user-id"
                name="user_id"
                type="text"
                autoComplete="username"
                required
                placeholder="e.g. john.doe"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className={error ? 'border-red-800 focus-visible:border-red-600' : ''}
              />
              {error && (
                <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                  <span>⚠</span> {error}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm mt-2"
              isLoading={isLoading}
            >
              Continue with Google Workspace
            </Button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-ink-muted">
            Your credentials are handled securely via OAuth 2.0
          </p>
        </div>

        {/* Bottom accent line */}
        <div className="absolute -bottom-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-border-accent to-transparent" />
      </div>
    </div>
  );
}
