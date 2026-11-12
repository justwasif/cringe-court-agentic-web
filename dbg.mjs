import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync('index.html','utf8');
const dom = new JSDOM(html, { url:'http://127.0.0.1:8134/', pretendToBeVisual:true });
const w = dom.window;
globalThis.window = w;
globalThis.document = w.document;
globalThis.localStorage = w.localStorage;
globalThis.location = w.location;
globalThis.HTMLElement = w.HTMLElement;
globalThis.Element = w.Element;
globalThis.Node = w.Node;
globalThis.CustomEvent = w.CustomEvent;
globalThis.Event = w.Event;
globalThis.HTMLDialogElement = w.HTMLDialogElement;
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;

process.on('unhandledRejection', e => console.log('UNHANDLED:', e?.message||e));
process.on('uncaughtException', e => console.log('UNCAUGHT:', e?.message||e));

try {
  await import('./game/app.js');
  await new Promise(r=>setTimeout(r,900));
  const court = w.document.querySelector('#court');
  console.log('--- after import ---');
  console.log('#court children:', court?.children.length ?? 'no element');
  console.log('text len:', (court?.textContent||'').trim().length);
  console.log('first 150:', (court?.textContent||'').trim().slice(0,150).replace(/\s+/g,' '));
  console.log('agent-status:', (w.document.querySelector('#agent-status')?.textContent||'').slice(0,120));
} catch (e) {
  console.log('IMPORT THREW:', e.message);
  console.log(e.stack?.split('\n').slice(0,5).join('\n'));
}
