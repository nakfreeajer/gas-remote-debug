'use strict';

const { pathCategory } = require('./redaction');
const {
  ensureSession,
  upsertTarget,
  markTargetDestroyed,
  recordAttachedSession,
  recordDetachedSession,
  upsertFrame,
  markFrameDetached,
  recordFrameNavigation
} = require('./target-registry');
const {
  recordExecutionContextCreated,
  markExecutionContextDestroyed,
  clearSessionContexts
} = require('./context-registry');

async function enableSession(state, sessionId) {
  const session = ensureSession(state, sessionId);
  if (session.configured) return;
  session.configured = true;
  await state.router.send('Runtime.enable', {}, sessionId, state.timeoutMs).catch(() => {});
  await state.router.send('Page.enable', {}, sessionId, state.timeoutMs).catch(() => {});
  await state.router.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true
  }, sessionId, state.timeoutMs).catch(() => {});
  await state.router.send('Page.getFrameTree', {}, sessionId, state.timeoutMs).catch(() => {});
}

function findAttachedSessionForTarget(state, targetId) {
  for (const session of state.registries.sessions.values()) {
    if (session.targetId === targetId && session.detached !== true) {
      return session;
    }
  }
  return null;
}

function registerLifecycleHandlers(state) {
  if (state.lifecycleHandlersRegistered) return;
  state.lifecycleHandlersRegistered = true;

  state.router.on('Target.targetCreated', (params) => {
    upsertTarget(state, params.targetInfo || {});
  });
  state.router.on('Target.targetInfoChanged', (params) => {
    upsertTarget(state, params.targetInfo || {});
  });
  state.router.on('Target.targetDestroyed', (params) => {
    markTargetDestroyed(state, params.targetId);
  });
  state.router.on('Target.attachedToTarget', async (params, parentSessionId) => {
    recordAttachedSession(state, params.sessionId, params.targetInfo || {}, parentSessionId);
    await enableSession(state, params.sessionId);
  });
  state.router.on('Target.detachedFromTarget', (params) => {
    recordDetachedSession(state, params.sessionId);
  });
  state.router.on('Runtime.executionContextCreated', (params, sessionId) => {
    recordExecutionContextCreated(state, sessionId, params.context || {});
  });
  state.router.on('Runtime.executionContextDestroyed', (params, sessionId) => {
    markExecutionContextDestroyed(state, sessionId, params.executionContextId);
  });
  state.router.on('Runtime.executionContextsCleared', (_params, sessionId) => {
    clearSessionContexts(state, sessionId);
  });
  state.router.on('Page.frameAttached', (params, sessionId) => {
    upsertFrame(state, params.frameId, sessionId, params.parentFrameId || '');
  });
  state.router.on('Page.frameDetached', (params) => {
    markFrameDetached(state, params.frameId);
  });
  state.router.on('Page.frameNavigated', (params, sessionId) => {
    recordFrameNavigation(state, params.frame || {}, sessionId);
  });
}

async function discoverTargets(state) {
  registerLifecycleHandlers(state);
  await state.router.send('Target.setDiscoverTargets', { discover: true }, null, state.timeoutMs);
  await state.router.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true
  }, null, state.timeoutMs);
  const result = await state.router.send('Target.getTargets', {}, null, state.timeoutMs);
  const targetInfos = result.targetInfos || [];
  for (const info of targetInfos) {
    upsertTarget(state, info);
  }
  return targetInfos;
}

function selectTargetInfo(targetInfos, options = {}) {
  if (typeof options.targetSelector === 'function') {
    return targetInfos.find((info) => options.targetSelector(info)) || null;
  }
  const targetType = options.targetType || 'page';
  const requiredPath = options.pathCategory || '';
  return targetInfos.find((info) => {
    if (targetType && info.type !== targetType) return false;
    if (requiredPath && pathCategory(info.url || '') !== requiredPath) return false;
    if (options.targetUrlIncludes && String(info.url || '').indexOf(String(options.targetUrlIncludes)) === -1) return false;
    return true;
  }) || null;
}

async function attachRecursive(state, options = {}) {
  const targetInfos = await discoverTargets(state);
  const topTarget = selectTargetInfo(targetInfos, options);
  if (!topTarget) return null;
  const existingSession = findAttachedSessionForTarget(state, topTarget.targetId);
  if (existingSession) {
    state.topTargetId = topTarget.targetId;
    state.topSessionId = existingSession.sessionId;
    await enableSession(state, existingSession.sessionId);
    return { targetInfo: topTarget, sessionId: existingSession.sessionId };
  }
  const attached = await state.router.send('Target.attachToTarget', {
    targetId: topTarget.targetId,
    flatten: true
  }, null, state.timeoutMs);
  state.topTargetId = topTarget.targetId;
  state.topSessionId = attached.sessionId;
  recordAttachedSession(state, attached.sessionId, topTarget, null);
  await enableSession(state, attached.sessionId);
  if (state.progress) {
    state.progress({
      stage: 'top-target-attached',
      targetId: topTarget.targetId,
      pathCategory: pathCategory(topTarget.url || '')
    });
  }
  return { targetInfo: topTarget, sessionId: attached.sessionId };
}

async function refreshRegistries(state) {
  return discoverTargets(state);
}

module.exports = {
  discoverTargets,
  attachRecursive,
  refreshRegistries,
  selectTargetInfo,
  findAttachedSessionForTarget
};
