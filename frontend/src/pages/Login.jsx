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
      setError('Please enter a username');
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
          } catch { /* ignore */ }
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-base font-sans relative overflow-hidden">
      {/* Ambient Light Orbs for Futuristic Vibe */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-accent/20 rounded-full blur-[120px] pointer-events-none mix-blend-multiply" />
      <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] bg-accent-dim/15 rounded-full blur-[150px] pointer-events-none mix-blend-multiply" />
      <div className="absolute bottom-[0%] left-[20%] w-[800px] h-[500px] bg-cta/15 rounded-full blur-[150px] pointer-events-none mix-blend-multiply" />

      {/* Card */}
      <div className="relative w-full max-w-md animate-fade-in-up z-10">
        <div className="bg-white/60 backdrop-blur-2xl border border-white/50 rounded-[32px] p-10 shadow-[0_8px_32px_rgba(99,102,241,0.05)]">

          {/* Logo mark */}
          <div className="flex flex-col items-center mb-8">
            <div className="h-16 w-16 rounded-[20px] mb-5 overflow-hidden shadow-sm border border-white/60 bg-white">
              <img src="/bot.png" alt="Agent47 Logo" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-ink-primary tracking-tight font-display">
              Welcome to Agent47
            </h1>
            <p className="mt-2 text-sm text-ink-secondary text-center font-medium">
              Sign in with your Google Workspace to orchestrate your life.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="user-id"
                className="block text-[11px] font-semibold text-ink-secondary mb-2 uppercase tracking-wider pl-1"
              >
                Username
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
                className={`bg-white/80 backdrop-blur-md border-white/60 h-12 rounded-2xl ${error ? 'border-red-400 focus-visible:border-red-500' : 'focus-visible:border-accent/40'}`}
              />
              {error && (
                <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5 font-medium pl-1">
                  <span>⚠</span> {error}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-[15px] font-semibold mt-4 rounded-2xl bg-accent hover:bg-accent-dim transition-colors shadow-sm"
              isLoading={isLoading}
            >
              Continue with Google Workspace
            </Button>
          </form>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-ink-muted font-medium">
            Secured via OAuth 2.0. No passwords stored.
          </p>
        </div>
      </div>
    </div>
  );
}
