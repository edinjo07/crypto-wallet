import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export default function useUsdPricesSocket() {
  const [prices, setPrices] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const baseUrl = process.env.REACT_APP_API_URL
      ? process.env.REACT_APP_API_URL.replace('/api', '')
      : 'http://localhost:3000';

    // Get JWT token from localStorage
    const token = localStorage.getItem('token');
    
    if (!token) {
      setError('Authentication token not found');
      return;
    }

    // Connect with JWT token authentication
    const socket = io(baseUrl, {
      auth: {
        token: token
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socket.on('prices:connected', (payload) => {
      console.log('Socket.IO connected', payload);
      setError(null);
    });

    socket.on('prices:usd', (payload) => {
      setPrices(payload.prices);
      setError(null);
    });

    socket.on('prices:error', (payload) => {
      setError(payload.message || 'socket price error');
    });

    socket.on('connect_error', (error) => {
      // Suppress console errors for authentication issues (expected when not logged in or token expired)
      if (error.message?.includes('authentication') || error.message?.includes('token')) {
        setError(error.message || 'Connection error');
      } else {
        console.error('Socket.IO connection error:', error);
        setError(error.message || 'Connection error');
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
    });

    return () => socket.disconnect();
  }, []);

  return { prices, error };
}
