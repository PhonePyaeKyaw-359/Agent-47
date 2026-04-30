import axios from 'axios';

// Fallback to localhost if not set in .env
const HTTP_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
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
  },

  executeAction: async (userId, intentData, sessionId = "") => {
    const response = await api.post(`/api/execute-action`, {
      user_id: userId,
      intent: intentData.intent,
      payload: intentData.payload,
      session_id: sessionId,
    });
    return response.data;
  },

  listGoogleDocs: async (userId, query = "") => {
    const response = await api.get(`/api/google-docs`, {
      params: {
        user_id: userId,
        query,
        page_size: 20,
      },
    });
    return response.data;
  },

  listGoogleFiles: async (userId, fileType = "document", query = "") => {
    const response = await api.get(`/api/google-files`, {
      params: {
        user_id: userId,
        file_type: fileType,
        query,
        page_size: 20,
      },
    });
    return response.data;
  },

  draftEmailBody: async (userId, payload = {}) => {
    const response = await api.post(`/api/draft-email-body`, {
      user_id: userId,
      payload,
    });
    return response.data;
  }
};

export default api;
