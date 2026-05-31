import api from './client.js';

export const signupRequest = async ({ name, email, password }) => {
  const { data } = await api.post('/auth/signup', { name, email, password });
  return data.data; // { user, token }
};

export const loginRequest = async ({ email, password }) => {
  const { data } = await api.post('/auth/login', { email, password });
  return data.data; // { user, token }
};
