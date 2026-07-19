'use strict';

function addWsListener(ws, eventName, handler) {
  if (ws && typeof ws.addEventListener === 'function') {
    ws.addEventListener(eventName, handler);
    return;
  }
  if (ws && typeof ws.on === 'function') {
    ws.on(eventName, handler);
    return;
  }
  throw new Error('Unsupported WebSocket implementation: missing addEventListener() and on()');
}

function getMessageData(rawOrEvent) {
  if (rawOrEvent && typeof rawOrEvent === 'object' && 'data' in rawOrEvent) {
    return rawOrEvent.data;
  }
  return rawOrEvent;
}

module.exports = {
  addWsListener,
  getMessageData
};
