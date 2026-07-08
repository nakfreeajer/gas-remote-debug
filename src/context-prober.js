const BUILTIN_PROBES = {
  ping: '1 + 1',

  env: `JSON.stringify({
    href: String(location.href),
    title: String(document.title),
    readyState: document?.readyState || 'unknown'
  })`,
};

function buildRuntimeProbe(helperNames) {
  const checks = helperNames.map(name =>
    `"${name}": typeof ${name} !== 'undefined'`
  ).join(', ');

  const keyScan = helperNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const windowKeys = keyScan
    ? `Object.keys(window).filter(k => /${keyScan}/i.test(k)).slice(0, 50)`
    : '[]';

  return `JSON.stringify({
    helpers: { ${checks} },
    windowKeys: ${windowKeys},
    href: location.href,
    title: document.title
  })`;
}

function buildDomProbe({ selectors = [], textStrings = [], loadingPatterns = [] } = {}) {
  const selectorChecks = selectors.map(s =>
    `"${s}": !!document.querySelector('${s.replace(/'/g, "\\'")}')`
  ).join(', ');

  const textChecks = textStrings.map(s =>
    `"${s}": document.body ? document.body.innerText.includes('${s.replace(/'/g, "\\'")}') : false`
  ).join(', ');

  const loadingRegex = loadingPatterns.length
    ? new RegExp(loadingPatterns.join('|'), 'i').source
    : '^$';

  const textSamples = selectors.slice(0, 5).map(s =>
    `"${s}": document.querySelector('${s.replace(/'/g, "\\'")}')?.innerText?.trim()?.substring(0, 300) || ''`
  ).join(', ');

  return `JSON.stringify({
    readyState: document?.readyState || 'unknown',
    selectors: { ${selectorChecks} },
    textFound: { ${textChecks} },
    textSamples: { ${textSamples} },
    bodyPreview: document.body?.innerText?.trim()?.substring(0, 400) || '',
    isLoadingShell: /${loadingRegex}/i.test(document.body?.innerText?.trim() || '')
  })`;
}

function scoreContext(runtimeResult, domResult, helperNames) {
  let score = 0;
  const features = [];

  const hasAnyHelper = runtimeResult?.helpers
    && helperNames.some(h => runtimeResult.helpers[h]);

  if (hasAnyHelper) {
    score += 100;
    for (const h of helperNames) {
      if (runtimeResult.helpers[h]) features.push(`helper:${h}`);
    }
  }

  const hasSelectors = domResult?.selectors
    && Object.values(domResult.selectors).some(Boolean);
  const hasText = domResult?.textFound
    && Object.values(domResult.textFound).some(Boolean);
  const isLoading = domResult?.isLoadingShell === true;

  if ((hasSelectors || hasText) && !isLoading) {
    score += 50;
    for (const [sel, found] of Object.entries(domResult?.selectors || {})) {
      if (found) features.push(`dom:${sel}`);
    }
    for (const [str, found] of Object.entries(domResult?.textFound || {})) {
      if (found) features.push(`text:"${str}"`);
    }
  }

  if (isLoading) {
    score -= 10;
    features.push('LOADING-SHELL');
  }

  let finalType = 'empty';
  if (hasAnyHelper && (hasSelectors || hasText) && !isLoading) finalType = 'full';
  else if (hasAnyHelper) finalType = 'runtime';
  else if ((hasSelectors || hasText) && !isLoading) finalType = 'dom';

  return { score, type: finalType, features };
}

module.exports = {
  BUILTIN_PROBES,
  buildRuntimeProbe,
  buildDomProbe,
  scoreContext
};
