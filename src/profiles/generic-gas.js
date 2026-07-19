'use strict';

function buildProbeExpression(globals) {
  const names = Array.isArray(globals) && globals.length ? globals : ['google', 'google.script'];
  const helpers = names.map((name) => {
    const parts = String(name).split('.');
    const access = parts.reduce((expr, part) => `${expr} && ${expr}[${JSON.stringify(part)}]`, 'globalThis');
    return `${JSON.stringify(name)}: typeof (${access}) !== 'undefined'`;
  }).join(',\n      ');

  return `(() => {
    const bodyText = document && document.body ? String(document.body.innerText || '') : '';
    return {
      title: String(document && document.title || ''),
      readyState: String(document && document.readyState || ''),
      pathname: String(location && location.pathname || ''),
      href: String(location && location.href || ''),
      globals: {
        ${helpers}
      },
      hasGoogleObject: typeof globalThis.google !== 'undefined',
      hasGoogleScriptObject: typeof globalThis.google === 'object' && globalThis.google ? typeof globalThis.google.script !== 'undefined' : false,
      bodyHasAppsScriptMarker: /userCodeAppPanel|Google Apps Script/i.test(bodyText)
    };
  })()`;
}

function targetSelector(info, options = {}) {
  const type = options.targetType || '';
  if (type && info.type !== type) return false;
  const include = options.targetUrlIncludes || '';
  if (include && String(info.url || '').indexOf(include) === -1) return false;
  return /script\.google\.com|googleusercontent\.com/i.test(String(info.url || ''))
    || /userCodeAppPanel/i.test(String(info.title || ''));
}

function contextPredicate(probe, _context, options = {}) {
  const globals = Array.isArray(options.globals) && options.globals.length ? options.globals : ['google', 'google.script'];
  if (!probe || typeof probe !== 'object') return false;
  if (!probe.globals || typeof probe.globals !== 'object') return false;
  return globals.every((name) => probe.globals[name] === true);
}

function summarizeRuntimeState(probe) {
  return {
    readyState: probe && probe.readyState ? probe.readyState : '',
    pathname: probe && probe.pathname ? probe.pathname : '',
    hasGoogleObject: Boolean(probe && probe.hasGoogleObject),
    hasGoogleScriptObject: Boolean(probe && probe.hasGoogleScriptObject)
  };
}

const genericGasProfile = {
  name: 'generic-gas',
  description: 'Generic Google Apps Script runtime discovery profile.',
  targetSelector,
  buildProbeExpression,
  contextPredicate,
  summarizeRuntimeState
};

module.exports = genericGasProfile;
