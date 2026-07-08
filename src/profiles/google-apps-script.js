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

module.exports = { profile };
