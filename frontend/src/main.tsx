import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import axios from 'axios'

// Set up a global interceptor to pass the current username
axios.interceptors.request.use(config => {
  const user = localStorage.getItem('robin_user');
  if (user) {
    config.headers['X-Robin-User'] = user;
  }
  return config;
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
