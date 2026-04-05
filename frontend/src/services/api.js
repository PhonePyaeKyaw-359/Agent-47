import axios from 'axios';

const api = axios.create({
  baseURL: 'https://workspace-ai-400859143635.asia-southeast1.run.app',
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
    const response = await api.post(`/run`, {
      user_id: userId,
      message: message,
      session_id: sessionId
    });
    return response.data;
  }
};

export default api;
