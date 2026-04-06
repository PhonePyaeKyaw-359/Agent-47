import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      userId: null,
      isAuthenticated: false,
      
      // Sessions map
      sessions: [],
      activeSessionId: null,
      
      setUserId: (id) => set({ userId: id }),
      setAuthenticated: (status) => set({ isAuthenticated: status }),
      
      createNewSession: () => {
        const newId = crypto.randomUUID();
        const newSession = {
          id: newId,
          title: "New Chat",
          messages: [],
          updatedAt: Date.now()
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: newId
        }));
      },
      
      setActiveSession: (id) => set({ activeSessionId: id }),
      
      addMessage: (message) => set((state) => {
        let activeId = state.activeSessionId;
        let newSessions = [...state.sessions];
        let activeSession = newSessions.find(s => s.id === activeId);
        
        // Auto-create if none exists
        if (!activeSession) {
          activeId = crypto.randomUUID();
          activeSession = {
            id: activeId,
            title: "New Chat",
            messages: [],
            updatedAt: Date.now()
          };
          newSessions.unshift(activeSession);
        }

        newSessions = newSessions.map((s) => {
          if (s.id === activeId) {
            let title = s.title;
            if (s.messages.length === 0 && message.isUser) {
              title = message.text.slice(0, 30) + (message.text.length > 30 ? "..." : "");
            }
            return {
              ...s,
              title,
              messages: [...s.messages, message],
              updatedAt: Date.now()
            };
          }
          return s;
        });
        
        // Sort sessions by updatedAt desc
        newSessions.sort((a, b) => b.updatedAt - a.updatedAt);

        return {
          sessions: newSessions,
          activeSessionId: activeId
        };
      }),
      
      updateSessionId: (oldId, newId) => set((state) => ({
        sessions: state.sessions.map((s) => s.id === oldId ? { ...s, id: newId } : s),
        activeSessionId: state.activeSessionId === oldId ? newId : state.activeSessionId
      })),

      deleteSession: (id) => set((state) => {
        const newSessions = state.sessions.filter(s => s.id !== id);
        let newActiveId = state.activeSessionId;
        if (newActiveId === id) {
          newActiveId = newSessions.length > 0 ? newSessions[0].id : null;
        }
        return {
          sessions: newSessions,
          activeSessionId: newActiveId
        };
      }),
      
      logout: () => set({ userId: null, isAuthenticated: false, sessions: [], activeSessionId: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        userId: state.userId,
        sessions: state.sessions,
        activeSessionId: state.activeSessionId
      }),
    }
  )
);
