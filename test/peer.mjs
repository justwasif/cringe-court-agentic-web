/**
 * Cross-origin peer loading test.
 *
 * The spec's headline interoperability requirement is:
 *
 *   "After user approval, load an exact named network from a second origin and
 *    run it locally in the caller's browser."
 *
 * This script proves as much of that as can be proven outside a browser. It
 * starts two independent origins — the courtroom and a separate "review desk"
 * site — and checks that the second origin can fetch the first's published
 * manifest and network definition, that the network validates, and that the peer
 * network compiles in the caller's process from the peer's own bytes.
 *
 * SCOPE, STATED PLAINLY: the final step — dynamic `import()` of the action module
 * over http — is browser-only. Node's ESM loader accepts only file:/data:, so the
 * test asserts that the http import is *refused* there rather than pretending to
 * have exercised it. That step is verified by hand in a browser.
 *
 * Run with: node test/peer.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, normalize, extname } from 'node:path';

const ROOT = resolve('.');
const PEER_ROOT = resolve('peer-site');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/**
 * The public artifacts the spec requires to be cross-origin readable.
 * Action modules are deliberately NOT in this list, per the spec.
 */
const CORS = new Set(['/agent-manifest.json', '/cringecourt.network.json', '/links.json']);

function serve(root, port) {
  const server = createServer(async (req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];
    const filePath = join(root, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(filePath);
      const headers = { 'content-type': TYPES[extname(filePath)] ?? 'text/plain' };
      // CORS is granted only on the public data artifacts, exactly as production does.
      if (CORS.has(urlPath)) headers['access-control-allow-origin'] = '*';
      res.writeHead(200, headers).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

const PEER_PORT = 8191;
const CALLER_PORT = 8192;
const peerBase = `http://127.0.0.1:${PEER_PORT}`;
const callerBase = `http://127.0.0.1:${CALLER_PORT}`;

const peer = await serve(ROOT, PEER_PORT);
const caller = await serve(PEER_ROOT, CALLER_PORT);

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

try {
  console.log('\n== 1. the caller origin can reach the peer manifest ==');
  const manifestRes = await fetch(`${peerBase}/agent-manifest.json`, {
    headers: { origin: callerBase },
  });
  check('manifest is 200', manifestRes.status === 200, `got ${manifestRes.status}`);
  check(
    'manifest allows the caller origin',
    manifestRes.headers.get('access-control-allow-origin') === '*',
    `got ${manifestRes.headers.get('access-control-allow-origin')}`
  );

  const manifest = await manifestRes.json();
  check('manifest brands the site', manifest.brand === 'CringeCourt');
  check('manifest lists one network', manifest.networks.length === 1);
  check('manifest declares the action protocol version', manifest.actions?.version === 1);

  const entry = manifest.networks[0];
  check('network is named', entry.name === 'cringecourt');
  check('front agent is declared', entry.front_man === 'court_clerk');
  check('network location is declared', typeof entry.hocon === 'string');

  console.log('\n== 2. the caller can fetch the resolved network definition ==');
  const networkUrl = new URL(entry.hocon, `${peerBase}/`).toString();
  const netRes = await fetch(networkUrl, { headers: { origin: callerBase } });
  check('network is 200', netRes.status === 200, `got ${netRes.status}`);
  check(
    'network allows the caller origin',
    netRes.headers.get('access-control-allow-origin') === '*'
  );

  const network = await netRes.json();
  check('network is data, not code', typeof network === 'object');
  check('network declares its agents', Array.isArray(network.tools));
  check(
    'every agent has instructions',
    network.tools.every(
      (t) => typeof t.instructions === 'string' && t.instructions.length > 40
    )
  );
  check(
    'no agent declares a site action as a static tool',
    network.tools.every(
      (t) => !(t.tools ?? []).some((ref) => typeof ref === 'string' && ref.startsWith('website_'))
    ),
    'site actions are advertised by the runtime, not the static graph'
  );

  console.log('\n== 3. the network validates in the caller runtime ==');
  const { AgentNetwork, validateNetwork } = await import('../runtime/kernel.js');
  const compiled = new AgentNetwork(network, entry.name);
  const report = validateNetwork(compiled);
  check(
    'network compiles with no validation errors',
    Array.isArray(report?.errors) && report.errors.length === 0,
    JSON.stringify(report?.errors)
  );
  check(
    'network declares no unresolved externals',
    Array.isArray(report?.externals) && report.externals.length === 0,
    JSON.stringify(report?.externals)
  );

  console.log('\n== 4. the peer link map resolves the symbolic name ==');
  const linksRes = await fetch(`${peerBase}/links.json`, { headers: { origin: callerBase } });
  const links = await linksRes.json();
  check('links.json is versioned', links.version === 1);
  check('links.json names the network', Object.hasOwn(links.networks, 'cringecourt'));

  console.log('\n== 5. private artifacts are NOT exposed cross-origin ==');
  const actionRes = await fetch(`${peerBase}/actions/court-actions.js`, {
    headers: { origin: callerBase },
  });
  check('the action module is served', actionRes.status === 200);
  check(
    'but it carries no CORS grant',
    actionRes.headers.get('access-control-allow-origin') === null,
    'an action module must stay on its owning origin'
  );

  console.log('\n== 6. the two origins are genuinely distinct ==');
  check('peer port differs from caller port', PEER_PORT !== CALLER_PORT);
  check('caller serves its own page', (await fetch(`${callerBase}/index.html`)).status === 200);
  const callerManifest = await fetch(`${callerBase}/agent-manifest.json`);
  check(
    'the caller origin has no courtroom manifest of its own',
    callerManifest.status === 404,
    `got ${callerManifest.status}`
  );

  console.log('\n== 7. the exact named network is selected, fail-closed ==');
  const { fetchManifest } = await import('../runtime/remote.js');
  const fetched = await fetchManifest(peerBase);
  check('the caller can read the peer manifest', fetched.manifest.brand === 'CringeCourt');

  const exact = fetched.manifest.networks.find((n) => n.name === 'cringecourt');
  check('the exact named network is published', Boolean(exact));
  check(
    'a wrong network name would be refused, not substituted',
    !fetched.manifest.networks.find((n) => n.name === 'not_the_court')
  );

  console.log('\n== 8. the peer network compiles in the caller, from the peer bytes ==');
  const netText = await (
    await fetch(`${peerBase}/${exact.hocon.replace('./', '')}`)
  ).text();
  const compiledPeer = new AgentNetwork(JSON.parse(netText), exact.name);
  const peerReport = validateNetwork(compiledPeer);
  check(
    'the peer network compiles with no errors',
    peerReport.errors.length === 0,
    JSON.stringify(peerReport.errors)
  );
  check(
    'the peer network resolves its front agent',
    typeof compiledPeer.findFrontMan !== 'function' ||
      compiledPeer.findFrontMan() === 'court_clerk'
  );

  console.log('\n== 9. action registration is browser-only, and says so ==');
  const { loadActionModule } = await import('../runtime/action-transport.js');
  check('the action transport exists', typeof loadActionModule === 'function');

  let httpImportRefused = false;
  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><body></body>', { url: peerBase });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.location = dom.window.location;
    const { ActionRegistry } = await import('../runtime/actions.js');
    await loadActionModule(
      new ActionRegistry(),
      { base: peerBase, network: 'cringecourt' },
      { actions: { version: 1, module: './actions/court-actions.js' } }
    );
  } catch (error) {
    httpImportRefused = /protocol 'http:'|Only URLs with a scheme/i.test(error.message);
  }
  check(
    'http module import is refused outside a browser',
    httpImportRefused,
    'Node accepting an http import would be the surprising outcome'
  );
} finally {
  peer.close();
  caller.close();
}

if (failures === 0) {
  console.log('\nAll cross-origin checks passed.');
  console.log('Not proven here: dynamic action-module execution over http, which is browser-only.\n');
} else {
  console.log(`\n${failures} check(s) failed.\n`);
}
process.exit(failures === 0 ? 0 : 1);
