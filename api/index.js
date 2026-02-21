// Vercel serverless entry point.
// Wrap in try/catch so module-load errors show in HTTP response instead of a blank 500.
let app;
try {
  app = require('../backend/server');
} catch (err) {
  app = (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(500).end(JSON.stringify({
      crashed: true,
      error: err.message,
      stack: err.stack,
      node: process.version,
    }));
  };
}
module.exports = app;
