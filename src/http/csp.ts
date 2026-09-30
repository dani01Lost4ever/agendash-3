import type { RequestHandler } from 'express';

// The dashboard is a self-contained bundle: no CDN, no inline scripts or styles, no eval.
const CSP: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  // Bootstrap draws its form controls with data: SVG images
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
};

const csp = Object.entries(CSP)
  .map(([directive, values]) => `${directive} ${values.join(' ')}`)
  .join('; ');

export function contentSecurityPolicy(): RequestHandler {
  return (_request, response, next) => {
    response.setHeader('Content-Security-Policy', csp);
    next();
  };
}
