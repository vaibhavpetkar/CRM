/**
 * Hides secrets that travel in URLs (webhook tokens, invite, reset and public
 * quote links) before a URL is written to the logs. Any path segment or query
 * value that looks like a long random token is replaced with "[redacted]".
 */
const TOKEN_LIKE = /^[A-Za-z0-9_-]{24,}$/;

export const redactUrl = (url: string): string => {
  const [path, query] = url.split('?', 2);
  const safePath = path
    .split('/')
    .map((segment) => (TOKEN_LIKE.test(segment) ? '[redacted]' : segment))
    .join('/');
  if (query === undefined) return safePath;
  const safeQuery = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      return /token|secret|password|key|code/i.test(key) || TOKEN_LIKE.test(value) ? `${key}=[redacted]` : pair;
    })
    .join('&');
  return `${safePath}?${safeQuery}`;
};
