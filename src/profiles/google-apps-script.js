const genericGasProfile = require('./generic-gas');

const profile = {
  name: 'google-apps-script',
  description: 'Google Apps Script web app defaults',

  targetFilter: {
    titleContains: 'userCodeAppPanel'
  },

  runtimeHelpers: [
    'google',
    'google.script'
  ],

  domMarkers: {
    selectors: [
      '#:0',
      'body'
    ],
    textStrings: [],
    loadingPatterns: [
      '^\\s*Loading\\.\\.\\.{0,3}\\s*$'
    ]
  },

  helpText: `Google Apps Script Profile

Targets the userCodeAppPanel iframe where GAS web app runtime lives.
Probes for google and google.script globals.
Supports the default (\`:0\`) DOM context for visible UI inspection.
`
};

function buildProbeExpression(globals) {
  return genericGasProfile.buildProbeExpression(globals || profile.runtimeHelpers);
}

function contextPredicate(probe, context, options = {}) {
  const globals = options.globals || profile.runtimeHelpers;
  return genericGasProfile.contextPredicate(probe, context, { globals });
}

function summarizeRuntimeState(probe, context) {
  return genericGasProfile.summarizeRuntimeState(probe, context);
}

module.exports = {
  profile,
  name: profile.name,
  description: profile.description,
  targetFilter: profile.targetFilter,
  runtimeHelpers: profile.runtimeHelpers,
  domMarkers: profile.domMarkers,
  helpText: profile.helpText,
  buildProbeExpression,
  contextPredicate,
  summarizeRuntimeState,
  targetSelector(info, options = {}) {
    return genericGasProfile.targetSelector(info, {
      ...options,
      targetUrlIncludes: options.targetUrlIncludes || 'userCodeAppPanel'
    });
  }
};
