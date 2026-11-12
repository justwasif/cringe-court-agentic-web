/**
 * CringeCourt — the page.
 *
 * The agent runtime mounts in #agent. The courtroom UI is plain DOM, deliberately:
 * it shares no state model with the runtime, so the game works fully with no
 * model key, and the agents are an addition rather than a dependency.
 */

import { boot } from './runtime/index.js';
import { createActionHandlers } from './actions/court-actions.js';
import {
  buildCase,
  caseLabel,
  closeVoting,
  currentDate,
  getCase,
  host,
  readTally,
  recordVote,
  resolve,
  utcDate,
} from './game/host.js';

const $ = (selector) => document.querySelector(selector);

/** Render the hearing for a date. */
function render() {
  const date = currentDate();
  const caseData = getCase(date);
  const tally = readTally(date);
  const resolution = resolve(date, tally);

  const root = $('#court');
  if (!root) return;

  const guiltyShare = tally.total === 0 ? 0 : (tally.guilty / tally.total) * 100;
  const notCookedShare = tally.total === 0 ? 0 : (tally.notCooked / tally.total) * 100;
  const hasVoted = Boolean(
    (JSON.parse(localStorage.getItem('cringecourt:v1') || '{}').cases?.[date]?.voters || {})
      .self
  );

  root.innerHTML = `
    <div class="case-no">${caseLabel(date)}</div>
    <h2 class="charge">${escapeHtml(caseData.title)}</h2>
    <p class="exhibit">&ldquo;${escapeHtml(caseData.exhibit)}&rdquo;</p>
    <p class="aggravator">Aggravating factor: ${escapeHtml(caseData.aggravator)}</p>

    <section class="argument">
      <h3 class="speaker prosecutor">Miss Ratio · for the people</h3>
      ${caseData.prosecutor.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
    </section>

    <section class="argument">
      <h3 class="speaker defense">Counsel Chaos · for the defence</h3>
      ${caseData.defense.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
    </section>

    <div class="meter">
      <span style="width:${guiltyShare}%;background:#a33a2c"></span>
      <span style="width:${notCookedShare}%;background:#2c6b6b"></span>
    </div>
    <div class="tally-row">
      <span>Cooked ${guiltyShare.toFixed(0)}%</span>
      <span>${tally.total} vote${tally.total === 1 ? '' : 's'} this browser</span>
      <span>Not cooked ${notCookedShare.toFixed(0)}%</span>
    </div>

    ${
      tally.open && !hasVoted
        ? `<div class="buttons">
             <button class="vote guilty" data-vote="GUILTY">Guilty · bro is cooked</button>
             <button class="vote not" data-vote="NOT_COOKED">Not cooked</button>
           </div>
           <p class="note">A vote cannot be taken back. The court asks once.</p>`
        : hasVoted
          ? `<p class="note">Your verdict is on the record for this case.</p>`
          : `<p class="note">Voting is closed for this case.</p>`
    }

    ${
      tally.total > 0
        ? `<div class="verdict ${resolution.mistrial ? 'mistrial' : resolution.verdict.toLowerCase()}">
             <div class="case-no">${resolution.mistrial ? 'The court cannot agree' : 'The verdict'}</div>
             <p>${escapeHtml(resolution.rationale)}</p>
           </div>`
        : ''
    }
  `;

  root.querySelectorAll('button[data-vote]').forEach((button) => {
    button.addEventListener('click', () => {
      const verdict = button.getAttribute('data-vote');
      const result = recordVote(date, verdict);
      if (!result.ok) {
        // eslint-disable-next-line no-alert
        alert(result.reason);
        return;
      }
      render();
    });
  });
}

/** Escape text before interpolating it into HTML. */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Wire the close-voting control. */
function wireControls() {
  const close = $('#close-voting');
  close?.addEventListener('click', () => {
    closeVoting(currentDate());
    render();
  });
}

/** Mount the agent runtime and register the court's actions. */
async function mountAgents() {
  const status = $('#agent-status');
  try {
    const runtime = await boot('#agent', {
      originUrl: location.origin,
      sandboxWorkerUrl: '/runtime/sandbox-worker.js',
    });

    const handlers = createActionHandlers(host);
    for (const definition of handlers) {
      runtime.actions.register(definition);
    }

    if (status) {
      const count = handlers.length;
      status.textContent = `${count} court actions connected: ${handlers
        .map((h) => h.name)
        .join(', ')}. The agents can read the case and propose a vote — you confirm it.`;
    }
  } catch (error) {
    // The courtroom works without the agent layer. Say so plainly instead of
    // rendering a broken widget.
    console.error('agent runtime failed to mount', error);
    if (status) {
      status.textContent =
        'The agent layer could not start. The courtroom below still works: the agents need a model key to speak, but the case and the ballot do not.';
      status.classList.add('agent-status--error');
    }
  }
}

function main() {
  const date = currentDate();
  const caseData = buildCase(date);

  const header = $('#case-date');
  if (header) header.textContent = caseLabel(date);

  render();
  wireControls();
  void mountAgents();

  // Keep the case number visible in the title for screenshots and demos.
  document.title = `CringeCourt — ${caseLabel(date)}`;
  console.info(`CringeCourt case ${caseData.caseNumber} (${utcDate()})`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
