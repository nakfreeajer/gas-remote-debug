'use strict';

const { idSuffix, redactSecrets, summarizeUrl } = require('./redaction');

function createRegistries() {
  return {
    targets: new Map(),
    sessions: new Map(),
    frames: new Map(),
    contexts: new Map()
  };
}

function ensureSession(state, sessionId) {
  if (!state.registries.sessions.has(sessionId)) {
    state.registries.sessions.set(sessionId, {
      sessionId,
      targetId: '',
      parentSessionId: '',
      detached: false,
      configured: false,
      frameIds: new Set(),
      generation: state.lifecycleGeneration || 0
    });
  }
  return state.registries.sessions.get(sessionId);
}

function upsertTarget(state, info) {
  const targetId = info.targetId || info.id;
  if (!targetId) return;
  const current = state.registries.targets.get(targetId) || {
    targetId,
    createdAt: Date.now(),
    destroyed: false
  };
  state.registries.targets.set(targetId, {
    ...current,
    targetId,
    type: info.type || current.type || '',
    title: info.title || current.title || '',
    url: redactSecrets(info.url || current.url || ''),
    attached: Boolean(info.attached),
    openerId: info.openerId || current.openerId || '',
    browserContextId: info.browserContextId || current.browserContextId || '',
    webSocketDebuggerUrl: info.webSocketDebuggerUrl || current.webSocketDebuggerUrl || '',
    destroyed: false,
    safeUrl: summarizeUrl(info.url || current.url || '')
  });
}

function markTargetDestroyed(state, targetId) {
  const target = state.registries.targets.get(targetId);
  if (target) target.destroyed = true;
}

function recordAttachedSession(state, sessionId, info, parentSessionId) {
  const session = ensureSession(state, sessionId);
  session.targetId = info.targetId || info.id || session.targetId || '';
  session.parentSessionId = parentSessionId || '';
  session.detached = false;
  session.generation = state.lifecycleGeneration || 0;
  upsertTarget(state, { ...info, attached: true });
}

function recordDetachedSession(state, sessionId) {
  const session = state.registries.sessions.get(sessionId);
  if (session) session.detached = true;
  for (const context of state.registries.contexts.values()) {
    if (context.sessionId === sessionId) {
      context.alive = false;
      context.staleReason = 'SESSION_DETACHED';
    }
  }
}

function upsertFrame(state, frameId, sessionId, parentFrameId) {
  if (!frameId) return;
  const current = state.registries.frames.get(frameId) || { frameId, attachedAt: Date.now() };
  state.registries.frames.set(frameId, {
    ...current,
    frameId,
    sessionId: sessionId || current.sessionId || '',
    parentFrameId: parentFrameId || current.parentFrameId || '',
    detached: false,
    navigatedAt: Date.now()
  });
  if (sessionId) {
    const session = ensureSession(state, sessionId);
    session.frameIds.add(frameId);
  }
}

function markFrameDetached(state, frameId) {
  const frame = state.registries.frames.get(frameId);
  if (frame) frame.detached = true;
  for (const context of state.registries.contexts.values()) {
    if (context.frameId === frameId) {
      context.alive = false;
      context.staleReason = 'FRAME_DETACHED';
    }
  }
}

function recordFrameNavigation(state, frame, sessionId) {
  if (!frame || !frame.id) return;
  upsertFrame(state, frame.id, sessionId, frame.parentId || '');
  const current = state.registries.frames.get(frame.id);
  current.url = redactSecrets(frame.url || '');
  current.name = frame.name || '';
  current.loaderId = frame.loaderId || '';
  current.safeUrl = summarizeUrl(frame.url || '');

  for (const context of state.registries.contexts.values()) {
    if (context.sessionId === sessionId && context.frameId === frame.id) {
      context.alive = false;
      context.staleReason = 'FRAME_NAVIGATED';
    }
  }

  const isTopSession = sessionId === state.topSessionId;
  const isRootFrame = !frame.parentId;
  if (isTopSession && isRootFrame) {
    state.lifecycleGeneration += 1;
    state.latestTopLevelLoadMs = Date.now();
    for (const context of state.registries.contexts.values()) {
      if (context.sessionId === sessionId) {
        context.alive = false;
        context.staleReason = 'NAVIGATION_SUPERSEDED';
      }
    }
  }
}

function summarizeTarget(target) {
  return {
    targetIdSuffix: idSuffix(target.targetId),
    type: target.type || '',
    title: target.title || '',
    attached: Boolean(target.attached),
    hostCategory: target.safeUrl ? target.safeUrl.hostCategory : '',
    pathCategory: target.safeUrl ? target.safeUrl.pathCategory : '',
    queryKeys: target.safeUrl ? target.safeUrl.queryKeys : []
  };
}

module.exports = {
  createRegistries,
  ensureSession,
  upsertTarget,
  markTargetDestroyed,
  recordAttachedSession,
  recordDetachedSession,
  upsertFrame,
  markFrameDetached,
  recordFrameNavigation,
  summarizeTarget
};
