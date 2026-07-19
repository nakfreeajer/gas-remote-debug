'use strict';

const { idSuffix, redactSecrets, hostCategory, pathCategory } = require('./redaction');

function isIgnoredWorld(context) {
  const aux = context.auxData || {};
  const name = String(context.name || '');
  const origin = String(context.origin || '');
  if (aux.isDefault !== true) return true;
  if (aux.type && aux.type !== 'default') return true;
  if (/^__playwright_utility_world/i.test(name)) return true;
  if (/^__puppeteer_utility_world/i.test(name)) return true;
  if (/chrome-extension:|edge-extension:|moz-extension:/i.test(origin)) return true;
  return false;
}

function recordExecutionContextCreated(state, sessionId, context) {
  if (!context || !context.id) return;
  const aux = context.auxData || {};
  const key = `${sessionId}:${context.id}`;
  state.registries.contexts.set(key, {
    key,
    targetId: state.registries.sessions.get(sessionId)?.targetId || '',
    sessionId,
    executionContextId: context.id,
    frameId: aux.frameId || '',
    origin: redactSecrets(String(context.origin || '')),
    originClassification: hostCategory(String(context.origin || '')),
    pathClassification: pathCategory(String(context.origin || '')),
    name: String(context.name || ''),
    auxiliaryData: aux,
    defaultWorld: aux.isDefault === true,
    ignored: isIgnoredWorld(context),
    alive: true,
    generation: state.lifecycleGeneration || 0,
    createdAt: Date.now(),
    staleReason: ''
  });
}

function markExecutionContextDestroyed(state, sessionId, executionContextId, reason = 'EXECUTION_CONTEXT_DESTROYED') {
  const key = `${sessionId}:${executionContextId}`;
  const current = state.registries.contexts.get(key);
  if (current) {
    current.alive = false;
    current.staleReason = reason;
  }
}

function clearSessionContexts(state, sessionId, reason = 'EXECUTION_CONTEXTS_CLEARED') {
  for (const context of state.registries.contexts.values()) {
    if (context.sessionId === sessionId) {
      context.alive = false;
      context.staleReason = reason;
    }
  }
}

function listRuntimeContexts(state, options = {}) {
  const includeIgnored = Boolean(options.includeIgnored);
  return Array.from(state.registries.contexts.values()).filter((context) => {
    if (!context.alive) return false;
    if (!includeIgnored && context.ignored) return false;
    if (options.sessionId && context.sessionId !== options.sessionId) return false;
    if (typeof options.generation === 'number' && context.generation < options.generation) return false;
    return true;
  });
}

function summarizeRuntimeContext(context) {
  return {
    targetIdSuffix: idSuffix(context.targetId),
    sessionIdSuffix: idSuffix(context.sessionId),
    executionContextId: context.executionContextId,
    frameIdSuffix: idSuffix(context.frameId),
    originClassification: context.originClassification,
    defaultWorld: Boolean(context.defaultWorld),
    ignored: Boolean(context.ignored),
    alive: Boolean(context.alive),
    generation: context.generation,
    name: context.name || ''
  };
}

module.exports = {
  isIgnoredWorld,
  recordExecutionContextCreated,
  markExecutionContextDestroyed,
  clearSessionContexts,
  listRuntimeContexts,
  summarizeRuntimeContext
};
