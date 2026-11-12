/**
 * Tests for the site-action layer.
 *
 * These matter more than they look: the actions are the boundary between an LLM
 * and the game state. Every validation here is a guard against a model writing
 * something the game should not accept.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { ACTIONS, createActionHandlers } = await import('../actions/court-actions.js');
const { host } = await import('../game/host.js');

beforeEach(() => store.clear());

/** Find one handler by name. */
function handler(name, backingHost = host) {
  const found = createActionHandlers(backingHost).find((h) => h.name === name);
  assert.ok(found, `action ${name} must exist`);
  return found;
}

describe('catalogue', () => {
  it('declares four actions', () => {
    assert.deepEqual(
      ACTIONS.map((a) => a.name).sort(),
      ['cast_verdict', 'get_case_state', 'get_tally', 'submit_exhibit']
    );
  });

  it('marks the vote as irreversible so the runtime confirms it', () => {
    const vote = ACTIONS.find((a) => a.name === 'cast_verdict');
    assert.equal(vote.effect, 'irreversible');
  });

  it('marks reads as reads', () => {
    for (const name of ['get_case_state', 'get_tally']) {
      assert.equal(ACTIONS.find((a) => a.name === name).effect, 'read');
    }
  });

  it('gives every action a purpose and both schemas', () => {
    for (const action of ACTIONS) {
      assert.ok(action.purpose.length > 20, `${action.name} needs a real purpose`);
      assert.equal(action.inputSchema.type, 'object');
      assert.ok(action.outputSchema, `${action.name} needs an output schema`);
    }
  });

  it('constrains the verdict enum to exactly two values', () => {
    const vote = ACTIONS.find((a) => a.name === 'cast_verdict');
    assert.deepEqual(vote.inputSchema.properties.verdict.enum, ['GUILTY', 'NOT_COOKED']);
  });

  it('rejects a host that is not an object', () => {
    assert.throws(() => createActionHandlers(null), /host object is required/);
  });
});

describe('get_case_state', () => {
  it('returns the full case for a date', async () => {
    const out = await handler('get_case_state').handler({ date: '2026-11-12' });
    assert.equal(out.date, '2026-11-12');
    assert.equal(out.caseNumber, 20261112);
    assert.ok(out.title.length > 0);
    assert.ok(out.prosecutor.length > 0);
    assert.ok(out.defense.length > 0);
    assert.equal(out.open, true);
    assert.equal(out.total, 0);
  });

  it('defaults to today when no date is given', async () => {
    const out = await handler('get_case_state').handler({});
    assert.match(out.date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('ignores a malformed date rather than failing', async () => {
    const out = await handler('get_case_state').handler({ date: 'not-a-date' });
    assert.match(out.date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('reports a vote once one is cast', async () => {
    await handler('cast_verdict').handler({ date: '2026-11-12', verdict: 'GUILTY' });
    const out = await handler('get_case_state').handler({ date: '2026-11-12' });
    assert.equal(out.guilty, 1);
    assert.equal(out.total, 1);
  });
});

describe('get_tally', () => {
  it('returns the counts without mutating', async () => {
    const before = await handler('get_tally').handler({ date: '2026-11-13' });
    assert.deepEqual([before.guilty, before.notCooked, before.total], [0, 0, 0]);
    const after = await handler('get_tally').handler({ date: '2026-11-13' });
    assert.deepEqual([after.guilty, after.total], [0, 0]);
  });
});

describe('cast_verdict', () => {
  it('records a valid verdict', async () => {
    const out = await handler('cast_verdict').handler({
      date: '2026-11-12',
      verdict: 'GUILTY',
    });
    assert.equal(out.recorded, true);
    assert.equal(out.verdict, 'GUILTY');
    assert.equal(out.total, 1);
  });

  it('rejects an invented verdict string', async () => {
    const out = await handler('cast_verdict').handler({
      date: '2026-11-12',
      verdict: 'ACQUITTED',
    });
    assert.equal(out.recorded, false);
    assert.match(out.reason, /GUILTY or NOT_COOKED/);
  });

  it('rejects a missing verdict', async () => {
    const out = await handler('cast_verdict').handler({ date: '2026-11-12' });
    assert.equal(out.recorded, false);
  });

  it('refuses a second vote and reports why', async () => {
    await handler('cast_verdict').handler({ date: '2026-11-12', verdict: 'GUILTY' });
    const out = await handler('cast_verdict').handler({
      date: '2026-11-12',
      verdict: 'NOT_COOKED',
    });
    assert.equal(out.recorded, false);
    assert.match(out.reason, /already voted/i);
  });
});

describe('submit_exhibit', () => {
  it('accepts a reasonable submission', async () => {
    const out = await handler('submit_exhibit').handler({
      title: 'Brought a thesaurus to a break-up',
      exhibit: 'Used the word "notwithstanding" three times while being dumped.',
      aggravator: 'Had it bookmarked.',
    });
    assert.equal(out.accepted, true);
  });

  it('rejects a title that is too short', async () => {
    const out = await handler('submit_exhibit').handler({
      title: 'hi',
      exhibit: 'This is a long enough exhibit to be considered real content.',
    });
    assert.equal(out.accepted, false);
    assert.match(out.reason, /at least 8 characters/);
  });

  it('rejects an exhibit that is too short', async () => {
    const out = await handler('submit_exhibit').handler({
      title: 'A perfectly fine title',
      exhibit: 'too short',
    });
    assert.equal(out.accepted, false);
    assert.match(out.reason, /at least 20 characters/);
  });

  it('strips control characters and collapses whitespace', async () => {
    const out = await handler('submit_exhibit').handler({
      title: 'Brought\u0000 a\u0007 clipboard',
      exhibit: 'Assigned\n\n\ttasks to people who were eating.',
    });
    assert.equal(out.accepted, true);
    // Read it back through the case state to confirm what was stored.
    const state = await handler('get_case_state').handler({});
    assert.ok(!state.title.includes('\u0000'));
    assert.ok(!state.exhibit.includes('\n'));
  });

  it('truncates an over-long exhibit instead of rejecting it', async () => {
    const long = 'a'.repeat(900);
    const out = await handler('submit_exhibit').handler({
      title: 'An over-long exhibit for testing',
      exhibit: long,
    });
    assert.equal(out.accepted, true);
    const state = await handler('get_case_state').handler({});
    assert.ok(state.exhibit.length <= 400, `exhibit was ${state.exhibit.length}`);
  });

  it('refuses a second exhibit on the same day', async () => {
    await handler('submit_exhibit').handler({
      title: 'The first exhibit of the day',
      exhibit: 'Something that definitely happened to someone.',
    });
    const out = await handler('submit_exhibit').handler({
      title: 'The second exhibit of the day',
      exhibit: 'Something else that also definitely happened.',
    });
    assert.equal(out.accepted, false);
    assert.match(out.reason, /one a day/i);
  });

  it('substitutes the submitted exhibit into the hearing', async () => {
    await handler('submit_exhibit').handler({
      title: 'Tested a smoke alarm with a candle',
      exhibit: 'Wanted to see if it still worked. It did. At 3am.',
      aggravator: 'The neighbours also found out.',
    });
    const state = await handler('get_case_state').handler({});
    assert.equal(state.title, 'Tested a smoke alarm with a candle');
    assert.match(state.exhibit, /3am/);
  });
});

describe('hostile host', () => {
  it('propagates a host error rather than swallowing it', async () => {
    const broken = {
      getCase: () => {
        throw new Error('host exploded');
      },
      getTally: () => ({ tally: { guilty: 0, notCooked: 0, total: 0 }, open: true }),
      submitExhibit: () => ({ accepted: false }),
      castVerdict: () => ({ recorded: false }),
    };
    await assert.rejects(
      () => handler('get_case_state', broken).handler({ date: '2026-11-12' }),
      /host exploded/
    );
  });
});
