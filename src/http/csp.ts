import type { RequestHandler } from 'express';

const CSP = {
  "default-src": [
    "'self'",
  ],
  "script-src": [
    "https://code.jquery.com",
    "https://cdn.jsdelivr.net",
    "https://cdnjs.cloudflare.com",
    "https://stackpath.bootstrapcdn.com",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "'self'",
  ],
  "style-src": [
    "https://cdn.jsdelivr.net",
    "https://stackpath.bootstrapcdn.com",
    "https://fonts.googleapis.com",
    "https://unpkg.com",
    "'self'",
  ],
  "font-src": [
    "https://fonts.gstatic.com",
  ],
};

const csp = Object.entries(CSP)
  .map(([type, values]) => `${type} ${values.join(" ")}`)
  .join("; ");

export function contentSecurityPolicy(): RequestHandler {
  return (req, res, next) => {
    res.header('Content-Security-Policy', csp);
    next();
  };
}
