// Vercel serverless entry point.
// Wrap in try/catch so module-load errors show in HTTP response instead of a blank 500.
let app;
let loadError = null;
try {
  app = require('../backend/server');
} catch (err) {
  loadError = err;
  app = (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(500).end(JSON.stringify({
      crashed: true,
      phase: 'module-load',
      error: loadError.message,
      stack: loadError.stack,
      node: process.version,
    }));
  };
}

// Catch top-level unhandled rejections that might crash the process on Vercel
process.on('unhandledRejection', (reason) => {
  console.error('[api/index] unhandledRejection:', reason);
  loadError = reason;
});

module.exports = app;
