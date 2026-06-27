'use strict';

const { DEFAULT_TIMEOUT_MS, RawCdpClient, delay } = require('./cdp-client');
const { summarizeTarget } = require('./target-discovery');

function safeJsonParse(text) {
  if (typeof text !== 'string') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function extractEvaluateResult(response) {
  const payload = response && response.result ? response.result : {};
  return {
    type: payload.result ? payload.result.type : null,
    value: payload.result ? payload.result.value : null,
    description: payload.result ? payload.result.description : null,
    objectId: payload.result ? payload.result.objectId : null,
    exceptionDetails: payload.exceptionDetails || null
  };
}

async function runtimeEvaluate(client, contextId, expression, options) {
  const response = await client.send(
    'Runtime.evaluate',
    {
      expression,
      contextId,
      awaitPromise: options && Object.prototype.hasOwnProperty.call(options, 'awaitPromise') ? options.awaitPromise : true,
      returnByValue: options && Object.prototype.hasOwnProperty.call(options, 'returnByValue') ? options.returnByValue : true,
      includeCommandLineAPI: true
    },
    options && options.timeoutMs ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  );

  const result = extractEvaluateResult(response);
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text || 'Runtime.evaluate exception';
    throw new Error(text);
  }
  return result;
}

async function collectExecutionContexts(client) {
  const contexts = [];
  const seen = new Set();
  client.on('Runtime.executionContextCreated', (params) => {
    if (!params || !params.context || seen.has(params.context.id)) {
      return;
    }
    seen.add(params.context.id);
    contexts.push({
      id: params.context.id,
      name: params.context.name || '',
      origin: params.context.origin || '',
      auxData: params.context.auxData || {},
      uniqueId: params.context.uniqueId || '',
      frameId: params.context.auxData && params.context.auxData.frameId ? params.context.auxData.frameId : '',
      isDefault: !!(params.context.auxData && params.context.auxData.isDefault)
    });
  });
  await client.send('Runtime.enable');
  await delay(500);
  return contexts;
}

function buildProbeExpression(globals) {
  const names = Array.isArray(globals) ? globals : [];
  return [
    'JSON.stringify((function () {',
    '  function exists(path) {',
    '    var parts = String(path || "").split(".");',
    '    var value = globalThis;',
    '    for (var i = 0; i < parts.length; i += 1) {',
    '      if (!parts[i]) { continue; }',
    '      if (value == null || !(parts[i] in value)) { return false; }',
    '      value = value[parts[i]];',
    '    }',
    '    return true;',
    '  }',
    '  var globals = ' + JSON.stringify(names) + ';',
    '  var found = {};',
    '  globals.forEach(function (name) { found[name] = exists(name); });',
    '  return {',
    '    ok: true,',
    '    href: String(location && location.href),',
    '    title: String(document && document.title),',
    '    found: found,',
    '    windowKeys: Object.keys(globalThis).filter(function (key) { return /google|script|app|runtime|panel/i.test(key); }).slice(0, 50)',
    '  };',
    '})())'
  ].join('\n');
}

async function probeContext(client, context, globals) {
  const probeA = await runtimeEvaluate(client, context.id, '1 + 1', {
    awaitPromise: false,
    returnByValue: true,
    timeoutMs: 5000
  });
  const probeB = await runtimeEvaluate(
    client,
    context.id,
    'JSON.stringify({ ok: true, href: String(location && location.href), title: String(document && document.title) })',
    { awaitPromise: false, returnByValue: true, timeoutMs: 5000 }
  );
  const probeC = await runtimeEvaluate(
    client,
    context.id,
    buildProbeExpression(globals),
    { awaitPromise: false, returnByValue: true, timeoutMs: 5000 }
  );

  return {
    probeA,
    probeB,
    probeC,
    parsedProbeB: safeJsonParse(probeB.value),
    parsedProbeC: safeJsonParse(probeC.value)
  };
}

function scoreContext(context, parsedProbeC, globals) {
  const found = parsedProbeC && parsedProbeC.found ? parsedProbeC.found : {};
  const matched = globals.filter((name) => found[name] === true).length;
  return [
    context.isDefault ? 0 : 1,
    globals.length - matched,
    context.name ? 0 : 1
  ];
}

async function inspectTarget(target, WebSocketImpl, globals) {
  const client = new RawCdpClient(target.webSocketDebuggerUrl, WebSocketImpl);
  const result = {
    target: summarizeTarget(target),
    contexts: []
  };

  try {
    await client.connect();
    const contexts = await collectExecutionContexts(client);
    for (const context of contexts) {
      const summary = {
        id: context.id,
        name: context.name,
        origin: context.origin,
        frameId: context.frameId,
        auxData: context.auxData,
        isDefault: context.isDefault,
        probeA: null,
        probeB: null,
        probeC: null,
        error: null
      };
      try {
        const probes = await probeContext(client, context, globals);
        summary.probeA = { type: probes.probeA.type, value: probes.probeA.value };
        summary.probeB = probes.parsedProbeB;
        summary.probeC = probes.parsedProbeC;
      } catch (error) {
        summary.error = error.message;
      }
      result.contexts.push(summary);
    }
  } finally {
    await client.close();
  }

  return result;
}

async function selectRuntimeContext(targets, WebSocketImpl, globals) {
  const inspection = [];
  let bestMatch = null;

  for (const target of targets) {
    const inspected = await inspectTarget(target, WebSocketImpl, globals);
    inspection.push(inspected);
    for (const context of inspected.contexts) {
      if (!context.probeC || !context.probeC.found) {
        continue;
      }
      const hasAll = globals.every((name) => context.probeC.found[name] === true);
      if (!hasAll) {
        continue;
      }
      const score = scoreContext(context, context.probeC, globals);
      if (!bestMatch || JSON.stringify(score) < JSON.stringify(bestMatch.score)) {
        bestMatch = {
          score,
          target: inspected.target,
          context: {
            id: context.id,
            name: context.name,
            origin: context.origin,
            frameId: context.frameId,
            auxData: context.auxData,
            isDefault: context.isDefault
          },
          probe: context.probeC
        };
      }
    }
  }

  if (!bestMatch) {
    throw new Error('Could not find a runtime context exposing all requested globals.');
  }

  return {
    inspection,
    selectedTarget: bestMatch.target,
    selectedContext: bestMatch.context,
    selectedProbe: bestMatch.probe
  };
}

module.exports = {
  collectExecutionContexts,
  extractEvaluateResult,
  inspectTarget,
  runtimeEvaluate,
  safeJsonParse,
  selectRuntimeContext
};