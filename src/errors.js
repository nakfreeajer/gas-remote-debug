class FrameGateError extends Error {
  constructor(message, { code, targetId, contextId, details } = {}) {
    super(message);
    this.name = 'FrameGateError';
    this.code = code || 'FRAME_GATE_ERROR';
    this.targetId = targetId || null;
    this.contextId = contextId || null;
    this.details = details || null;
  }
}

class BrowserNotReachableError extends FrameGateError {
  constructor(host, port) {
    super(
      `Chrome CDP not reachable at ${host}:${port}. ` +
      `Start Chrome with --remote-debugging-port=${port}`,
      { code: 'BROWSER_NOT_REACHABLE' }
    );
    this.name = 'BrowserNotReachableError';
  }
}

class NoTargetsFoundError extends FrameGateError {
  constructor(availableCount = 0) {
    super(
      `No page/iframe targets found in /json/list. ` +
      `Saw ${availableCount} total target(s). Is the GAS app open?`,
      { code: 'NO_TARGETS' }
    );
    this.name = 'NoTargetsFoundError';
    this.availableCount = availableCount;
  }
}

class NoRuntimeContextError extends FrameGateError {
  constructor(scannedCount = 0) {
    super(
      `No runtime-bearing context found after scanning ${scannedCount} context(s). ` +
      `Checked all page/iframe targets. Runtime helpers not detected.`,
      { code: 'NO_RUNTIME_CONTEXT' }
    );
    this.name = 'NoRuntimeContextError';
    this.scannedCount = scannedCount;
  }
}

class NoDomContextError extends FrameGateError {
  constructor(targetId, frameId) {
    super(
      `VALIDATION BLOCKED — RUNTIME FOUND BUT VISIBLE DOM CONTEXT NOT FOUND. ` +
      `Target: ${targetId}, Frame: ${frameId}`,
      { code: 'NO_DOM_CONTEXT', targetId }
    );
    this.name = 'NoDomContextError';
    this.frameId = frameId;
  }
}

class ExpressionBlockedError extends FrameGateError {
  constructor(expression, matchedTokens) {
    super(
      `Expression blocked. Matched forbidden tokens: ${matchedTokens.join(', ')}`,
      { code: 'EXPRESSION_BLOCKED' }
    );
    this.name = 'ExpressionBlockedError';
    this.expression = expression;
    this.matchedTokens = matchedTokens;
  }
}

class EvaluationFailedError extends FrameGateError {
  constructor(expression, exceptionText, contextId) {
    super(
      `Evaluation failed in context ${contextId}: ${exceptionText}`,
      { code: 'EVAL_FAILED', contextId }
    );
    this.name = 'EvaluationFailedError';
    this.expression = expression;
    this.exceptionText = exceptionText;
  }
}

class StaleShellError extends FrameGateError {
  constructor(contextId, targetId) {
    super(
      `Context ${contextId} shows stale loading shell — not valid DOM evidence`,
      { code: 'STALE_SHELL', contextId, targetId }
    );
    this.name = 'StaleShellError';
  }
}

module.exports = {
  FrameGateError,
  BrowserNotReachableError,
  NoTargetsFoundError,
  NoRuntimeContextError,
  NoDomContextError,
  ExpressionBlockedError,
  EvaluationFailedError,
  StaleShellError
};
