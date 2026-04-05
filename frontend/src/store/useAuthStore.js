import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      userId: null,
      isAuthenticated: false,
      chatHistory: [],
      sessionId: "",
      
      setUserId: (id) => set({ userId: id }),
      setSessionId: (id) => set({ sessionId: id }),
      setAuthenticated: (status) => set({ isAuthenticated: status }),
      
      addMessage: (message) => set((state) => ({
        chatHistory: [...state.chatHistory, message]
      })),
      
      setChatHistory: (history) => set({ chatHistory: history }),
      
      logout: () => set({ userId: null, isAuthenticated: false, chatHistory: [], sessionId: "" }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ userId: state.userId }), // Only persist userId
    }
  )
);
