import type { RequestHandler } from 'express';

export interface ContentSecurityPolicyOptions {
  /** Sources allowed to show the dashboard in a frame. Defaults to `["'self'"]`. */
  frameAncestors?: string[];
}

// The dashboard is a self-contained bundle: no CDN, no inline scripts or styles, no eval.
const BASE_POLICY: Record<string, string[]> = {
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
};

const KEYWORDS = new Set(['self', 'none']);

/**
 * Validates `frameAncestors` and quotes the `self` and `none` keywords, so both `'self'` and
 * `self` are accepted. Throws on values that could alter other directives of the header.
 */
export function frameAncestorsSources(sources: string[] = ["'self'"]): string[] {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new TypeError("Agendash: frameAncestors must be a non-empty array, e.g. [\"'self'\"]");
  }
  const normalized = sources.map((source) => {
    const trimmed = typeof source === 'string' ? source.trim() : '';
    const keyword = trimmed.replace(/^'(.*)'$/, '$1');
    if (KEYWORDS.has(keyword)) {
      return `'${keyword}'`;
    }
    // A host source (https://app.example.com, https://*.example.com:8443) or a scheme (https:).
    // Whitespace, quotes, commas and semicolons would end the source or the directive.
    if (trimmed === '' || /[\s;,']/.test(trimmed)) {
      throw new TypeError(`Agendash: invalid frameAncestors source ${JSON.stringify(source)}`);
    }
    return trimmed;
  });
  if (normalized.includes("'none'") && normalized.length > 1) {
    throw new TypeError("Agendash: frameAncestors 'none' cannot be combined with other sources");
  }
  return normalized;
}

export function contentSecurityPolicy({ frameAncestors }: ContentSecurityPolicyOptions = {}): RequestHandler {
  const policy = { ...BASE_POLICY, 'frame-ancestors': frameAncestorsSources(frameAncestors) };
  const header = Object.entries(policy)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');

  return (_request, response, next) => {
    // Replaces a policy the host application may have set for its own pages
    response.setHeader('Content-Security-Policy', header);
    next();
  };
}
