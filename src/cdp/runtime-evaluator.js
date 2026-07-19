'use strict';

const { safeError, sanitizeException } = require('./redaction');
const { listRuntimeContexts: listContextsRaw, summarizeRuntimeContext } = require('./context-registry');

function isStaleContext(state, runtimeContext) {
  const key = `${runtimeContext.sessionId}:${runtimeContext.executionContextId || runtimeContext.contextId}`;
  const entry = state.registries.contexts.get(key);
  if (!entry) {
    return { stale: true, classification: 'STALE_RUNTIME_CONTEXT', reason: 'CONTEXT_MISSING' };
  }
  if (!entry.alive) {
    return { stale: true, classification: 'STALE_RUNTIME_CONTEXT', reason: entry.staleReason || 'CONTEXT_NOT_ALIVE' };
  }
  if (runtimeContext.generation !== undefined && entry.generation !== runtimeContext.generation) {
    return { stale: true, classification: 'STALE_RUNTIME_CONTEXT', reason: 'GENERATION_SUPERSEDED' };
  }
  return { stale: false, entry };
}

function listRuntimeContexts(state, options = {}) {
  return listContextsRaw(state, {
    includeIgnored: Boolean(options.includeIgnoredContexts),
    generation: typeof options.generation === 'number' ? options.generation : undefined
  }).map((context) => ({
    ...summarizeRuntimeContext(context),
    targetId: context.targetId,
    sessionId: context.sessionId,
    executionContextId: context.executionContextId,
    frameId: context.frameId,
    generation: context.generation,
    name: context.name || '',
    defaultWorld: context.defaultWorld
  }));
}

async function evaluateInContext(state, runtimeContext, expression, options = {}) {
  const stage = options.stage || 'evaluateInContext';
  const before = isStaleContext(state, runtimeContext);
  if (before.stale) {
    return { ok: false, classification: before.classification, stage, reason: before.reason };
  }
  try {
    const result = await state.router.send('Runtime.evaluate', {
      contextId: runtimeContext.executionContextId || runtimeContext.contextId,
      expression,
      awaitPromise: Object.prototype.hasOwnProperty.call(options, 'awaitPromise') ? options.awaitPromise : true,
      returnByValue: Object.prototype.hasOwnProperty.call(options, 'returnByValue') ? options.returnByValue : true,
      includeCommandLineAPI: true
    }, runtimeContext.sessionId, options.timeoutMs || state.timeoutMs);

    const after = isStaleContext(state, runtimeContext);
    if (after.stale) {
      return { ok: false, classification: after.classification, stage, reason: after.reason };
    }
    if (result.exceptionDetails) {
      return { ok: false, ...sanitizeException(stage, result.exceptionDetails) };
    }
    return {
      ok: true,
      value: options.returnByValue === false ? (result.result || null) : (result.result ? result.result.value : null),
      result
    };
  } catch (error) {
    return {
      ok: false,
      stage,
      classification: 'RUNTIME_EVALUATION_ERROR',
      message: safeError(error)
    };
  }
}

async function waitForDefaultContexts(state, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const pollMs = Number(options.pollMs || 250);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const contexts = listRuntimeContexts(state, {
      includeIgnoredContexts: Boolean(options.includeIgnoredContexts),
      generation: typeof options.afterGeneration === 'number' ? options.afterGeneration : undefined
    }).filter((context) => context.defaultWorld === true);
    if (!options.predicate && contexts.length > 0) return contexts;
    if (typeof options.predicate === 'function') {
      const match = options.predicate(contexts);
      if (match) return match;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return options.predicate ? null : [];
}

async function findRuntimeContext(state, predicate, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const pollMs = Number(options.pollMs || 250);
  const probeExpression = options.probeExpression || `(() => ({
    readyState: document.readyState,
    title: document.title || '',
    href: String(location && location.href || ''),
    hasGoogle: typeof google,
    hasGoogleScript: typeof google === 'object' && google ? typeof google.script : 'undefined'
  }))()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const contexts = listRuntimeContexts(state, {
      includeIgnoredContexts: Boolean(options.includeIgnoredContexts)
    });
    for (const context of contexts) {
      const probe = await evaluateInContext(state, context, probeExpression, {
        awaitPromise: false,
        returnByValue: true,
        timeoutMs: state.timeoutMs,
        stage: 'findRuntimeContext.probe'
      });
      if (!probe.ok) continue;
      if (predicate(probe.value, context)) {
        return { ...context, probe: probe.value };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

async function waitForRuntimeContext(state, predicate, options = {}) {
  return findRuntimeContext(state, predicate, options);
}

async function refreshRegistries(state) {
  const { refreshRegistries: refreshRecursive } = require('./recursive-attach');
  return refreshRecursive(state);
}

module.exports = {
  listRuntimeContexts,
  evaluateInContext,
  waitForDefaultContexts,
  findRuntimeContext,
  waitForRuntimeContext,
  refreshRegistries
};
