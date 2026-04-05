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

  // On mount, check if there's a stored userId and we are returning from OAuth
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
             // Not authenticated yet
             setAuthenticated(false);
          }
        } catch (err) {
          console.error("Auth status check failed:", err);
          // If we fail, we just stay on login
          setAuthenticated(false);
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    // You could also check if URL has specific callback params like ?code=...
    // Adjust based on your API's exact redirect callback behavior
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
      // 1. Store user ID before redirect
      setUserId(inputValue);
      
      // 2. Get auth URL
      const data = await authService.getLoginInfo(inputValue);
      
      if (data && data.auth_url) {
        // 3. Open Popup instead of redirecting
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const popup = window.open(
          data.auth_url,
          'Google Login',
          `width=${width},height=${height},left=${left},top=${top},popup=yes`
        );
        
        // 4. Poll for authentication status
        const pollInterval = setInterval(async () => {
          try {
            if (popup && popup.closed) {
              clearInterval(pollInterval);
              setIsLoading(false);
              // Just in case they closed it before finishing
            }
            
            const statusData = await authService.checkStatus(inputValue);
            if (statusData && statusData.authenticated === true) {
              clearInterval(pollInterval);
              if (popup && !popup.closed) {
                popup.close();
              }
              setAuthenticated(true);
              navigate('/chat');
            }
          } catch (pollErr) {
            // Ignore temporary endpoint failures during polling
          }
        }, 2000); // Check every 2 seconds

      } else {
        setError('Failed to get authentication URL. Please try again.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'An error occurred during login. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 sm:px-6 lg:px-8">
      {/* Background decoration */}
      <div className="absolute top-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-900/30 blur-3xl opacity-50" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] rounded-full bg-slate-800/50 blur-3xl opacity-50" />
      </div>

      <div className="max-w-md w-full space-y-8 bg-slate-900 p-10 rounded-3xl shadow-2xl shadow-blue-900/20 z-10 border border-slate-800">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-tr from-blue-600 to-slate-800 rounded-2xl flex items-center justify-center shadow-lg mb-6 transform transition-transform hover:scale-105">
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="mt-2 text-3xl font-extrabold text-slate-100 tracking-tight">
            Welcome Back
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Sign in with your Google Workspace to continue
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm space-y-2">
            <label htmlFor="user-id" className="block text-sm font-medium text-slate-300 ml-1">
              User ID
            </label>
            <Input
              id="user-id"
              name="user_id"
              type="text"
              autoComplete="username"
              required
              placeholder="e.g. john.doe or 12345"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className={error ? "border-red-500 focus-visible:ring-red-500" : ""}
            />
            {error && <p className="text-red-400 text-sm mt-1 ml-1 font-medium">{error}</p>}
          </div>

          <div>
            <Button 
              type="submit" 
              className="w-full flex justify-center text-lg shadow-blue-700/30"
              isLoading={isLoading}
            >
              Login with Google Workspace
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
