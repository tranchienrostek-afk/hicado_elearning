import axios from 'axios';

axios.defaults.baseURL = '';

axios.defaults.headers['Content-Type'] = 'application/json';

export const setAxiosAuth = (token?: string) =>
  (axios.defaults.headers.common['Authorization'] = token
    ? `Bearer ${token}`
    : undefined);
