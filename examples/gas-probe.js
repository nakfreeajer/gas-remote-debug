const { GasRemoteDebugClient } = require('../src/index');

async function main() {
  const client = await GasRemoteDebugClient.connect({
    runtimeHelpers: ['MY_APP_API', 'app'],
    domMarkers: {
      selectors: ['#app', '#main', '#content'],
      textStrings: ['Dashboard', 'Loading']
    }
  });

  const pair = client.pair;
  console.log('Frame-Pair Gate Result:');
  console.log(`  Mode:            ${pair.mode}`);
  console.log(`  Runtime Context: ${pair.runtimeContextId}`);
  console.log(`  DOM Context:     ${pair.domContextId}`);
  console.log(`  Target URL:      ${pair.targetUrl ? pair.targetUrl.substring(0, 100) : 'unknown'}`);
  console.log('');

  if (pair.runtime) {
    console.log('Runtime helpers found:');
    for (const [name, found] of Object.entries(pair.runtime.helpers || {})) {
      if (found) console.log(`  - ${name}`);
    }
    console.log('');
  }

  try {
    const title = await client.evalDom('document.title');
    console.log(`Document title: ${title}`);
  } catch (err) {
    console.error(`DOM eval failed: ${err.message}`);
  }

  client.disconnect();
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
