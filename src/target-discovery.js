'use strict';

const { httpGetJson } = require('./cdp-client');

const CDP_VERSION_URL = 'http://127.0.0.1:9222/json/version';
const CDP_LIST_URL = 'http://127.0.0.1:9222/json/list';

function summarizeTarget(target) {
  return {
    id: target.id,
    type: target.type,
    title: target.title,
    url: target.url,
    webSocketDebuggerUrl: target.webSocketDebuggerUrl || ''
  };
}

function matchesTarget(target, targetUrlIncludes) {
  if (!target || !target.webSocketDebuggerUrl || !target.url) {
    return false;
  }
  if (!targetUrlIncludes) {
    return true;
  }
  return target.url.indexOf(targetUrlIncludes) !== -1;
}

async function discoverTargets() {
  const version = await httpGetJson(CDP_VERSION_URL);
  const targets = await httpGetJson(CDP_LIST_URL);
  return { version, targets };
}

function filterTargets(targets, targetUrlIncludes) {
  return targets.filter((target) => matchesTarget(target, targetUrlIncludes));
}

module.exports = {
  CDP_LIST_URL,
  CDP_VERSION_URL,
  discoverTargets,
  filterTargets,
  matchesTarget,
  summarizeTarget
};