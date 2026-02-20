const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.REACT_APP_API_URL) {
  console.error('[config] REACT_APP_API_URL is not set. API calls will fail. Set it in the Vercel dashboard to your backend URL (e.g. https://your-backend.onrender.com/api).');
}

export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
export const APP_ENV = process.env.NODE_ENV || 'development';
