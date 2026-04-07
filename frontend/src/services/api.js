import axios from 'axios';

const HTTP_BASE = 'https://workspace-ai-400859143635.asia-southeast1.run.app';
export const WS_BASE_URL = HTTP_BASE.replace(/^http/, 'ws');  // wss://...

const api = axios.create({
  baseURL: HTTP_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authService = {
  getLoginInfo: async (userId) => {
    const response = await api.get(`/auth/login`, {
      params: { user_id: userId }
    });
    return response.data;
  },
  
  checkStatus: async (userId) => {
    const response = await api.get(`/auth/status/${userId}`);
    return response.data;
  }
};

export const chatService = {
  runAgent: async (userId, message, sessionId = "") => {
    // Get browser UTC offset, e.g. -420 minutes for UTC+7 → "+07:00"
    const rawOffset = -new Date().getTimezoneOffset(); // minutes, positive = ahead of UTC
    const sign = rawOffset >= 0 ? "+" : "-";
    const absMinutes = Math.abs(rawOffset);
    const hh = String(Math.floor(absMinutes / 60)).padStart(2, "0");
    const mm = String(absMinutes % 60).padStart(2, "0");
    const timezoneOffset = `${sign}${hh}:${mm}`;

    const response = await api.post(`/run`, {
      user_id: userId,
      message: message,
      session_id: sessionId,
      timezone_offset: timezoneOffset,
    });
    return response.data;
  }
};

export const gmailService = {
  triageInbox: async (userId, query = 'in:inbox newer_than:7d', maxMessages = 25, applyLabels = true) => {
    const response = await api.post('/gmail/triage', {
      user_id: userId,
      query,
      max_messages: maxMessages,
      apply_labels: applyLabels,
    });
    return response.data;
  },

  summarizeThreads: async (userId, query = 'in:inbox newer_than:14d', maxThreads = 5) => {
    const response = await api.post('/gmail/summarize', {
      user_id: userId,
      query,
      max_threads: maxThreads,
    });
    return response.data;
  },
};

export default api;
