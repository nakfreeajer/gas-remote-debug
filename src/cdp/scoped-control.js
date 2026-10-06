'use strict';

const READ_ONLY_METHODS = new Set([
  'DOM.getDocument',
  'DOM.querySelector',
  'DOM.querySelectorAll',
  'DOM.describeNode',
  'DOM.getAttributes',
  'DOM.getBoxModel',
  'DOM.getOuterHTML',
  'Page.getFrameTree',
  'Page.getLayoutMetrics'
]);

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

function validateScope(state, request) {
  if (!state || state.connected !== true || !state.router || state.router.connected !== true) {
    throw new Error('CDP browser state is disconnected');
  }
  const targetId = requireString(request.targetId, 'targetId');
  const sessionId = requireString(request.sessionId, 'sessionId');
  const method = requireString(request.method, 'method');
  const session = state.registries && state.registries.sessions && state.registries.sessions.get(sessionId);
  if (!session || session.detached === true) throw new Error('CDP session is missing or detached');
  if (session.targetId !== targetId) throw new Error('CDP session does not belong to targetId');
  const target = state.registries.targets && state.registries.targets.get(targetId);
  if (!target || target.destroyed === true) throw new Error('CDP target is missing or destroyed');
  return { targetId, sessionId, method };
}

function validateTestAuthorization(scope, request) {
  const authorization = request.testAuthorization;
  if (!authorization || authorization.mode !== 'TEST') throw new Error('Active CDP control requires explicit TEST authorization');
  if (authorization.targetId !== scope.targetId) throw new Error('TEST authorization target does not match command target');
  requireString(authorization.fixtureId, 'testAuthorization.fixtureId');
}

/**
 * Send one CDP command through gas-remote-debug's session router after validating
 * exact target/session ownership. Read-only commands are allowlisted. All other
 * commands require an explicit target-bound TEST authorization.
 */
async function sendScopedCdpCommand(state, request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('request must be an object');
  const scope = validateScope(state, request);
  const params = request.params === undefined ? {} : request.params;
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new TypeError('params must be an object');

  if (!READ_ONLY_METHODS.has(scope.method)) validateTestAuthorization(scope, request);

  if (scope.method === 'Runtime.evaluate') {
    const contextId = request.executionContextId;
    if (!Number.isSafeInteger(contextId) || contextId < 1) throw new Error('Runtime.evaluate requires an exact executionContextId');
    const context = state.registries.contexts && state.registries.contexts.get(`${scope.sessionId}:${contextId}`);
    if (!context || context.alive !== true || context.targetId !== scope.targetId) {
      throw new Error('Runtime execution context is missing, stale, or owned by another target');
    }
    if (params.contextId !== contextId) throw new Error('Runtime.evaluate contextId must match the validated executionContextId');
  } else if (request.executionContextId !== undefined) {
    const contextId = request.executionContextId;
    if (!Number.isSafeInteger(contextId) || contextId < 1) throw new Error('executionContextId must be a positive safe integer');
    const context = state.registries.contexts && state.registries.contexts.get(`${scope.sessionId}:${contextId}`);
    if (!context || context.alive !== true || context.targetId !== scope.targetId) {
      throw new Error('Execution context is missing, stale, or owned by another target');
    }
  }

  const timeoutMs = Number(request.timeoutMs || state.timeoutMs);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive safe integer');
  return state.router.send(scope.method, params, scope.sessionId, timeoutMs);
}

module.exports = { sendScopedCdpCommand, READ_ONLY_METHODS };
