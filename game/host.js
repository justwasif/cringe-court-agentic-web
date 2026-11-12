/**
 * The host object that site actions are bound to.
 *
 * `createActionHandlers()` in `actions/court-actions.js` takes this and returns
 * registrations. Keeping the two apart means the action layer is testable
 * without a DOM, and the game logic is testable without the action layer.
 */

import {
  buildCase,
  closeVoting,
  readSubmitted,
  readTally,
  recordVote,
  resolve,
  submitExhibit,
  utcDate,
  caseLabel,
} from './court.js';

/** Optional date override, set from the URL for demos (?date=2026-11-12). */
function dateFromUrl() {
  const param = new URLSearchParams(location.search).get('date');
  return param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : null;
}

/** The date the site is currently showing. */
export function currentDate() {
  return dateFromUrl() ?? utcDate();
}

/**
 * Read the full case state for a date.
 *
 * A submitted exhibit, if one exists for this browser, overrides the derived
 * case — that is what makes `submit_exhibit` a real capability rather than a
 * write to nowhere.
 */
export function getCase(date) {
  const submitted = readSubmitted(date);
  const base = buildCase(date);
  const caseData = submitted
    ? {
        ...base,
        title: submitted.title,
        exhibit: submitted.exhibit,
        aggravator: submitted.aggravator || 'Nothing further. That was enough.',
      }
    : base;

  const tally = readTally(date);
  return {
    ...caseData,
    open: tally.open,
    tally: { guilty: tally.guilty, notCooked: tally.notCooked, total: tally.total },
  };
}

/** Read the tally for a date. */
export function getTally(date) {
  return { tally: readTally(date), open: readTally(date).open };
}

/** The host object passed to createActionHandlers. */
export const host = {
  getCase,
  getTally,
  submitExhibit,
  castVerdict({ date, verdict }) {
    const result = recordVote(date, verdict);
    if (!result.ok) {
      return { recorded: false, total: result.tally.total, reason: result.reason };
    }
    return { recorded: true, total: result.tally.total, reason: '' };
  },
};

export {
  buildCase,
  caseLabel,
  closeVoting,
  readTally,
  recordVote,
  resolve,
  submitExhibit,
  utcDate,
};
