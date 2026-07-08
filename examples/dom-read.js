const { GasRemoteDebugClient } = require('../src/index');

async function main() {
  const client = await GasRemoteDebugClient.connect({
    runtimeHelpers: ['app', 'MY_APP_API'],
    domMarkers: {
      selectors: ['body', '#content', '#main'],
      textStrings: ['Dashboard']
    }
  });

  const pair = client.pair;
  console.log(`Connected in ${pair.mode} mode`);
  console.log('');

  try {
    const bodyText = await client.evalDomJson(`JSON.stringify({
      title: document.title,
      bodyLength: document.body?.innerText?.length || 0,
      bodyPreview: document.body?.innerText?.trim()?.substring(0, 500) || ''
    })`);
    console.log('DOM Content:');
    console.log(`  Title:       ${bodyText.title}`);
    console.log(`  Body length: ${bodyText.bodyLength}`);
    console.log(`  Preview:     ${bodyText.bodyPreview}`);
  } catch (err) {
    console.error(`DOM read failed: ${err.message}`);
  }

  try {
    const count = await client.evalDom('document.querySelectorAll("table").length');
    console.log(`Table count: ${count}`);
  } catch (err) {
    console.error(`Table count failed: ${err.message}`);
  }

  client.disconnect();
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
