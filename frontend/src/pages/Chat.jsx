import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, LogOut, Loader2, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { chatService, authService } from '../services/api';
import { ChatBubble } from '../components/ChatBubble';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

export default function Chat() {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  const userId = useAuthStore((state) => state.userId);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const chatHistory = useAuthStore((state) => state.chatHistory);
  const sessionId = useAuthStore((state) => state.sessionId);
  const addMessage = useAuthStore((state) => state.addMessage);
  const logout = useAuthStore((state) => state.logout);
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const setSessionId = useAuthStore((state) => state.setSessionId);

  // Protect Route & Verify Auth Status
  useEffect(() => {
    if (!userId) {
      navigate('/');
      return;
    }

    const checkAuth = async () => {
      try {
        const data = await authService.checkStatus(userId);
        if (!data || data.authenticated !== true) {
           setAuthenticated(false);
           navigate('/');
        } else {
           setAuthenticated(true);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setAuthenticated(false);
        navigate('/');
      }
    };

    if (!isAuthenticated) {
        checkAuth();
    }
  }, [userId, isAuthenticated, navigate, setAuthenticated]);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isSending]);

  // Auto focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [isSending]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputValue.trim() || isSending) return;

    const userMessage = { text: inputValue, isUser: true, id: Date.now() };
    addMessage(userMessage);
    setInputValue('');
    setIsSending(true);

    try {
      const response = await chatService.runAgent(userId, inputValue.trim(), sessionId);
      
      if (response.session_id) {
        setSessionId(response.session_id);
      }
      
      const aiResponse = response.response;
      
      const aiMessage = { text: aiResponse, isUser: false, id: Date.now() + 1 };
      addMessage(aiMessage);
    } catch (error) {
      console.error(error);
      const errorMessage = { 
        text: "Sorry, I encountered an error. " + (error.response?.data?.message || error.message), 
        isUser: false, 
        id: Date.now() + 1,
        isError: true
      };
      addMessage(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!isAuthenticated && userId) {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-gray-50">
              <Loader2 className="h-10 w-10 animate-spin text-red-600" />
              <span className="ml-4 text-gray-600 font-medium text-lg">Verifying your authentication...</span>
          </div>
      );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      
      {/* Sidebar - Optional minimal */}
      <div className="hidden md:flex w-72 bg-slate-950 text-slate-200 flex-col shadow-2xl z-10 border-r border-slate-800">
        <div className="p-6 flex items-center border-b border-slate-800">
          <img src="/bot.png" className="h-8 w-8 object-contain drop-shadow-md mr-3" alt="Workspace AI Logo" />
          <h1 className="font-bold text-xl tracking-tight text-white">Workspace AI</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <p className="text-xs uppercase text-slate-500 font-semibold mb-3 tracking-wider">Session Details</p>
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <div className="flex items-center text-sm mb-2">
                 <div className="h-2 w-2 rounded-full bg-blue-500 mr-2"></div>
                 <span className="text-slate-300">Connected</span>
              </div>
              <p className="text-sm font-medium text-slate-200 truncate" title={userId}>User: {userId}</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col h-full bg-slate-950 relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between bg-slate-900 px-4 py-3 border-b border-slate-800 shadow-sm z-10">
          <div className="flex items-center">
            <img src="/bot.png" className="h-8 w-8 object-contain drop-shadow-md mr-3" alt="Workspace AI Logo" />
            <h1 className="font-bold text-lg text-slate-100">Workspace AI</h1>
          </div>
          <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-blue-400 transition-colors">
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          
          {chatHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <img src="/bot.png" className="h-24 w-24 object-contain drop-shadow-2xl mb-6" alt="Workspace AI Bot" />
              <h2 className="text-2xl font-bold text-slate-100 mb-2">How can I help you today?</h2>
              <p className="text-slate-400 max-w-md">
                I'm your Google Workspace AI assistant. I can help manage your calendar, draft emails, and access your documents.
              </p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto pb-4">
              {chatHistory.map((msg) => (
                <ChatBubble key={msg.id} message={msg.text} isUser={msg.isUser} />
              ))}
              
              {isSending && (
                <div className="flex justify-start mb-6">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mr-3 shadow-sm">
                    <span className="text-slate-300 font-bold text-sm">AI</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 text-slate-200 rounded-2xl rounded-tl-sm px-6 py-4 shadow-md flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-transparent border-t-0 pb-6 md:pb-8">
          <div className="max-w-4xl mx-auto relative group">
            <form onSubmit={handleSend} className="relative flex items-center">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask me anything..."
                className="pr-16 py-4 h-16 rounded-2xl text-lg shadow-lg border-slate-700 group-hover:border-blue-600 transition-colors"
                disabled={isSending}
              />
              <Button 
                type="submit" 
                size="icon" 
                variant="primary"
                className="absolute right-2 top-2 bottom-2 h-12 w-12 rounded-xl bg-blue-700 hover:bg-blue-800 shadow-sm transition-all"
                disabled={!inputValue.trim() || isSending}
                isLoading={false}
              >
                {!isSending ? <img src="/sent.png" className="h-6 w-6 object-contain" alt="Send" /> : <Loader2 className="h-5 w-5 animate-spin" />}
              </Button>
            </form>
            <div className="text-center mt-3 text-xs text-gray-400">
              Workspace AI can make mistakes. Verify important information.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
