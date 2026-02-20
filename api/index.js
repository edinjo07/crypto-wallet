// Vercel serverless entry point.
// Vercel auto-detects files in the /api directory as serverless functions.
// This file re-exports the Express app from the backend so all /api/* routes
// are handled by the same server — no code duplication needed.
module.exports = require('../backend/server');
