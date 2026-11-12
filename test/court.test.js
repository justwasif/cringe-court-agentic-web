/**
 * Tests for the browser-side court logic.
 *
 * These run in Node with a tiny localStorage shim, so the game's rules are
 * verified without a browser. The logic under test is the same module the site
 * loads; nothing is reimplemented for the tests.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

/** Minimal localStorage stand-in. */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const {
  DECISIVE_SHARE,
  QUORUM,
  buildCase,
  caseLabel,
  caseNumberFor,
  closeVoting,
  loadState,
  readSubmitted,
  readTally,
  recordVote,
  resolve,
  submitExhibit,
  utcDate,
} = await import('../game/court.js');

beforeEach(() => store.clear());

describe('case assembly', () => {
  it('is deterministic for a date', () => {
    const a = buildCase('2026-11-12');
    const b = buildCase('2026-11-12');
    assert.deepEqual(a, b);
  });

  it('differs across dates', () => {
    const a = buildCase('2026-11-12');
    const b = buildCase('2026-11-13');
    assert.notEqual(a.title, b.title);
  });

  it('produces a complete hearing', () => {
    const c = buildCase('2026-11-12');
    assert.ok(c.title.length > 0);
    assert.ok(c.exhibit.length > 0);
    assert.ok(c.aggravator.length > 0);
    assert.ok(c.prosecutor.length >= 3);
    assert.ok(c.defense.length >= 3);
  });

  it('grounds both arguments in the same exhibit', () => {
    const c = buildCase('2026-12-25');
    assert.ok(
      c.prosecutor.some((line) => line.includes(c.exhibit)),
      'the prosecution quotes the exhibit'
    );
    assert.ok(
      c.defense.some((line) => line.toLowerCase().includes(c.exhibit.toLowerCase().slice(0, 30))),
      'the defence argues the same exhibit'
    );
  });

  it('never puts a verdict in the arguments', () => {
    for (let day = 1; day <= 28; day++) {
      const date = `2026-11-${String(day).padStart(2, '0')}`;
      const c = buildCase(date);
      const all = [...c.prosecutor, ...c.defense].join(' ').toLowerCase();
      assert.ok(!all.includes('found guilty'), `${date} must not announce a verdict`);
      assert.ok(!all.includes('i rule'), `${date} must not rule`);
    }
  });

  it('formats the case number and label', () => {
    assert.equal(caseNumberFor('2026-11-12'), 20261112);
    assert.equal(caseLabel('2026-11-12'), 'No. 2026-1112');
  });

  it('formats today in UTC', () => {
    assert.match(utcDate(new Date('2026-11-12T23:30:00Z')), /^2026-11-12$/);
  });
});

describe('voting', () => {
  const date = '2026-11-12';

  it('starts empty and open', () => {
    const t = readTally(date);
    assert.deepEqual([t.guilty, t.notCooked, t.total, t.open], [0, 0, 0, true]);
  });

  it('records a guilty vote', () => {
    const r = recordVote(date, 'GUILTY');
    assert.equal(r.ok, true);
    assert.equal(r.tally.guilty, 1);
    assert.equal(r.tally.total, 1);
  });

  it('records a not-cooked vote', () => {
    recordVote(date, 'NOT_COOKED');
    const t = readTally(date);
    assert.equal(t.notCooked, 1);
  });

  it('refuses a second vote from the same browser', () => {
    recordVote(date, 'GUILTY');
    const second = recordVote(date, 'NOT_COOKED');
    assert.equal(second.ok, false);
    assert.match(second.reason, /already voted/i);
    assert.equal(readTally(date).total, 1, 'the second vote must not count');
  });

  it('refuses an unknown verdict', () => {
    const r = recordVote(date, 'MAYBE');
    assert.equal(r.ok, false);
    assert.equal(readTally(date).total, 0);
  });

  it('refuses a vote after closing', () => {
    closeVoting(date);
    const r = recordVote(date, 'GUILTY');
    assert.equal(r.ok, false);
    assert.match(r.reason, /closed/i);
  });

  it('persists across module-level reads', () => {
    recordVote(date, 'GUILTY');
    assert.equal(readTally(date).guilty, 1);
    assert.ok(loadState().cases[date]);
  });
});

describe('resolution', () => {
  const tally = (guilty, notCooked) => ({
    guilty,
    notCooked,
    total: guilty + notCooked,
  });

  it('declares a mistrial below quorum', () => {
    const r = resolve('2026-11-12', tally(QUORUM - 1, 0));
    assert.equal(r.mistrial, true);
    assert.equal(r.verdict, null);
  });

  it('convicts at a decisive share', () => {
    const r = resolve('2026-11-12', tally(18, 2));
    assert.equal(r.mistrial, false);
    assert.equal(r.verdict, 'GUILTY');
  });

  it('acquits at a decisive share', () => {
    const r = resolve('2026-11-12', tally(2, 18));
    assert.equal(r.verdict, 'NOT_COOKED');
  });

  it('is a mistrial on an even split', () => {
    const r = resolve('2026-11-12', tally(10, 10));
    assert.equal(r.mistrial, true);
    assert.equal(r.verdict, null);
  });

  it('treats exactly the threshold as decisive', () => {
    const r = resolve('2026-11-12', tally(55, 45));
    assert.equal(r.mistrial, false);
    assert.equal(r.verdict, 'GUILTY');
  });

  it('does not convict one vote below it', () => {
    const r = resolve('2026-11-12', tally(54, 46));
    assert.equal(r.mistrial, true);
  });

  it('reports the threshold in the mistrial rationale', () => {
    const r = resolve('2026-11-12', tally(10, 10));
    // The rationale renders the threshold as a whole percentage.
    const expected = (DECISIVE_SHARE * 100).toFixed(0);
    assert.ok(
      r.rationale.includes(expected),
      `rationale should mention ${expected}%: ${r.rationale}`
    );
  });
});

describe('submitting an exhibit', () => {
  const date = '2026-11-12';

  it('accepts a valid exhibit', () => {
    const r = submitExhibit({
      title: 'Brought a clipboard to a picnic',
      exhibit: 'Assigned tasks to people who were eating.',
      aggravator: 'There was a colour-coded schedule.',
    });
    assert.equal(r.accepted, true);
    const stored = readSubmitted(date);
    assert.equal(stored.title, 'Brought a clipboard to a picnic');
  });

  it('allows only one exhibit per browser per day', () => {
    submitExhibit({ title: 'First', exhibit: 'Something that happened.', aggravator: '' });
    const second = submitExhibit({
      title: 'Second',
      exhibit: 'Something else that happened.',
      aggravator: '',
    });
    assert.equal(second.accepted, false);
    assert.match(second.reason, /one a day/i);
  });
});
