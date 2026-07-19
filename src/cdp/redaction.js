'use strict';

const SECRET_PATTERNS = [
  { pattern: /([?&](?:token|code|state)=)[^&]+/gi, replacement: '$1REDACTED' },
  { pattern: /\b((?:token|code|state)=)[^\s&]+/gi, replacement: '$1REDACTED' },
  { pattern: /(Bearer\s+)[A-Za-z0-9._-]+/gi, replacement: '$1REDACTED' },
  { pattern: /([?&](?:access_token|refresh_token|id_token)=)[^&]+/gi, replacement: '$1REDACTED' },
  { pattern: /((?:api[_-]?key|client[_-]?secret|password)["'\s:=]+)[^\s"'&]+/gi, replacement: '$1REDACTED' },
  { pattern: /(AIza[0-9A-Za-z\-_]{20,})/g, replacement: 'REDACTED_API_KEY' }
];

function redactSecrets(value) {
  if (typeof value !== 'string' || !value) return value;
  let redacted = value;
  for (const rule of SECRET_PATTERNS) {
    redacted = redacted.replace(rule.pattern, rule.replacement);
  }
  return redacted;
}

function safeError(error) {
  return redactSecrets(error && error.message ? error.message : String(error));
}

function idSuffix(value, size = 6) {
  return value ? String(value).slice(-size) : '';
}

function pathCategory(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.pathname.endsWith('/dev')) return 'dev';
    if (parsed.pathname.endsWith('/exec')) return 'exec';
    if (/userCodeAppPanel/i.test(parsed.pathname)) return 'userCodeAppPanel';
    return parsed.pathname || 'other';
  } catch (_) {
    return 'other';
  }
}

function hostCategory(urlString) {
  try {
    const host = new URL(urlString).host || '';
    if (/accounts\.google\.com/i.test(host)) return 'accounts.google.com';
    if (/script\.google\.com/i.test(host)) return 'script.google.com';
    if (/googleusercontent\.com/i.test(host)) return 'googleusercontent.com';
    return host || 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

function getQueryKeys(urlString) {
  try {
    return Array.from(new URL(urlString).searchParams.keys());
  } catch (_) {
    return [];
  }
}

function summarizeUrl(urlString) {
  return {
    hostCategory: hostCategory(urlString),
    pathCategory: pathCategory(urlString),
    queryKeys: getQueryKeys(urlString)
  };
}

function sanitizeException(stage, exceptionDetails) {
  const details = exceptionDetails || {};
  return {
    stage,
    classification: 'RUNTIME_EVALUATION_EXCEPTION',
    text: redactSecrets(details.text || ''),
    className: redactSecrets(details.exception && details.exception.className || ''),
    description: redactSecrets(details.exception && details.exception.description || ''),
    lineNumber: typeof details.lineNumber === 'number' ? details.lineNumber : null,
    columnNumber: typeof details.columnNumber === 'number' ? details.columnNumber : null
  };
}

module.exports = {
  redactSecrets,
  safeError,
  idSuffix,
  pathCategory,
  hostCategory,
  getQueryKeys,
  summarizeUrl,
  sanitizeException
};
