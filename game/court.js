/**
 * CringeCourt case logic, running entirely in the browser.
 *
 * This module has no dependencies and no network calls. The case is a pure
 * function of the date, exactly as in the Reddit build, so every visitor on the
 * same day sees the same hearing without a server.
 *
 * Votes live in localStorage. That is a deliberate trade-off, and it is stated
 * plainly in the UI rather than hidden: a static site has no shared backend, so
 * a tally here counts *this browser's* ballots. The point of this build is the
 * agent interoperability, not a global leaderboard.
 */

const CHARGES = [
  {
    title: 'Sent a three-paragraph text to a first date',
    exhibit:
      'He messaged at 2:14am asking whether they had "considered the long-term trajectory of this."',
    aggravator: 'He used the word "trajectory" twice.',
  },
  {
    title: 'Replied "you too" to a waiter who said "enjoy your meal"',
    exhibit: 'Then, after a four-second pause, added "and also to your family."',
    aggravator: 'The waiter had already walked away.',
  },
  {
    title: 'Brought a printed résumé to a coffee shop meeting',
    exhibit:
      'Two pages, single-sided, with a section headed "Relevant Beverage Experience."',
    aggravator: 'It was laminated.',
  },
  {
    title: 'Posted a gym selfie captioned "no excuses"',
    exhibit:
      'The photo was taken in a mirror at a hotel buffet, holding a plate of pastries.',
    aggravator: 'The gym was visible only as a reflection in the sneeze guard.',
  },
  {
    title: 'Called their own birthday "a networking opportunity"',
    exhibit:
      'Sent a calendar invite with an agenda, a 15-minute "wins share", and a hard stop.',
    aggravator: 'The agenda had a slide deck attached.',
  },
  {
    title: 'Argued with a self-checkout machine for six minutes',
    exhibit: 'Demanded to speak to a manager, then realised the manager was the machine.',
    aggravator: 'Two people filmed it. Both posted.',
  },
  {
    title: 'Used "per my last email" in a first email',
    exhibit: 'The "last email" was a calendar notification sent by an automated system.',
    aggravator: "They CC'd their own mother.",
  },
  {
    title: 'Wore a blazer to a beach bonfire',
    exhibit:
      'Explained it was "a dinner situation" while holding a burnt marshmallow on a stick.',
    aggravator: 'The blazer was linen. The bonfire was real.',
  },
  {
    title: 'Started a group chat to announce they were leaving a group chat',
    exhibit:
      'The announcement was eleven messages long and included a table of contents.',
    aggravator: 'Three people replied "who are you".',
  },
  {
    title: 'Reviewed a restaurant they had never visited',
    exhibit: 'Two stars. Reason given: "the concept." They lived 400 miles away.',
    aggravator: 'The review was longer than the menu.',
  },
  {
    title: "Corrected a tour guide about the tour guide's own city",
    exhibit:
      'Cited a blog post. The blog post was about a different city with the same street name.',
    aggravator: 'Continued after being shown the map.',
  },
  {
    title: 'Sent a voice note that was mostly breathing',
    exhibit: 'Four minutes and six seconds, of which eleven seconds contained words.',
    aggravator: 'Sent a follow-up voice note apologising for the first one.',
  },
  {
    title: 'Described a two-hour walk as "a hike"',
    exhibit: 'Posted eleven photos, including one of a bench captioned "summit".',
    aggravator: 'The bench was outside a supermarket.',
  },
  {
    title: 'Brought their own hot sauce to a wedding',
    exhibit:
      'Produced it from an inside pocket during the speeches, with a small bow.',
    aggravator: 'It was in a labelled, reusable bottle.',
  },
  {
    title: 'Asked a librarian to "keep it down"',
    exhibit:
      'The librarian had said one sentence, at a normal volume, about a book return.',
    aggravator: 'It was their own book return.',
  },
  {
    title: 'Set a calendar reminder titled "be spontaneous"',
    exhibit: 'Recurring, weekly, with a 30-minute buffer and a preparatory checklist.',
    aggravator: 'They snoozed it.',
  },
  {
    title: 'Told a barber "I trust you" and then supervised',
    exhibit:
      'Maintained unbroken eye contact with the scissors via the mirror for 25 minutes.',
    aggravator: 'Brought a reference photo. Of themselves. From 2019.',
  },
  {
    title: 'Brought a spreadsheet to a group holiday planning dinner',
    exhibit:
      'Had already allocated rooms, weighted by "morning energy", before anyone arrived.',
    aggravator: 'One column was headed "risk".',
  },
  {
    title: 'Answered "how are you" with a status report',
    exhibit: 'Included a blocker, a next step, and an offer to "take this offline."',
    aggravator: 'It was a wedding.',
  },
  {
    title: 'Left a five-star review that was actually a complaint',
    exhibit: 'Five stars, then nine paragraphs, then "would not return."',
    aggravator: 'The owner replied with a single question mark.',
  },
  {
    title: 'Named their sourdough starter',
    exhibit:
      'The name was a pun on a philosopher. They explained the pun unprompted, twice.',
    aggravator: 'The starter died and got an obituary post.',
  },
  {
    title: 'Ran to catch a bus that was not moving',
    exhibit: 'Sprinted 40 metres, arrived, and read the "not in service" display.',
    aggravator: 'Then stood there for two minutes to seem unbothered.',
  },
  {
    title: 'Introduced themselves to a neighbour of six years',
    exhibit: 'Full handshake, full name, and "we should really do this more often."',
    aggravator: 'The neighbour had a key to their flat.',
  },
  {
    title: 'Brought a laptop to a wedding reception',
    exhibit:
      'Opened it during the first dance, angled away from the table, "just checking something."',
    aggravator: 'The screen was visible. It was a spreadsheet.',
  },
  {
    title: 'Asked for a doggy bag at a buffet',
    exhibit:
      'Was told it was not that kind of establishment. Asked for "a container, then."',
    aggravator: 'Produced their own container.',
  },
  {
    title: 'Sent a "quick question" that required a research project',
    exhibit: 'Six bullet points, two attachments, and a deadline of "end of day."',
    aggravator: 'It was a Saturday.',
  },
  {
    title: 'Explained a joke immediately after telling it',
    exhibit:
      'The explanation was longer than the joke and included the word "subtext."',
    aggravator: 'Then asked if it landed.',
  },
  {
    title: 'Clapped when the plane landed',
    exhibit:
      'Loudly, alone, and then looked around as if to lead a round of applause.',
    aggravator: 'It was a smooth landing.',
  },
  {
    title: 'Took a "quick call" during a funeral',
    exhibit:
      'Whispered "I have to take this", then negotiated a contract in the vestibule.',
    aggravator: 'The contract was for a gym membership.',
  },
  {
    title: "Corrected someone's pronunciation of their own name",
    exhibit:
      'Twice. The second time with a phonetic breakdown written on a napkin.',
    aggravator: 'The name was "David".',
  },
  {
    title: 'Arrived an hour early and complained about the wait',
    exhibit:
      'Had been told 7pm. Arrived at 6pm. Asked at 6:40 whether the table was "being held hostage."',
    aggravator: 'The restaurant opened at 6:45.',
  },
  {
    title: 'Used "circle back" in a eulogy',
    exhibit:
      'Followed by "let\'s take the learnings" and a pause for laughter that did not come.',
    aggravator: 'Then offered to "park that."',
  },
  {
    title: 'Replied to a wedding invitation with a calendar conflict',
    exhibit:
      'Attached a screenshot of a recurring "focus time" block as the reason.',
    aggravator: 'The block was their own.',
  },
];

const PROSECUTION_OPENERS = [
  'The record will show that my client is not the problem here. The record is.',
  'Your honour, I have read the exhibit. I would like to enter into evidence my own need for a moment.',
  'Some cases require nuance. This one requires a chair and a glass of water.',
  'I do not relish this. I do, however, have a slide prepared.',
  'The defence will call this "a misunderstanding." I will call it a pattern with a witness.',
];

const DEFENSE_OPENERS = [
  'My client acted. That is not a crime. That is a Tuesday.',
  'I will concede one thing: the timing. The rest is a matter of framing.',
  'If intent were a defence, we would not be here. Luckily, it is.',
  'Your honour, every person in this room has done worse and simply not been posted about.',
  'The prosecution has described the act. I intend to describe the human being.',
];

const PROSECUTION_CLOSERS = [
  'That is not confidence. That is a person performing confidence for an audience of one.',
  'You cannot laminate a feeling, your honour. And yet.',
  'The exhibit speaks for itself. It has been speaking for six screens.',
  'I ask only that you imagine being on the other end of that notification.',
  'This is not a mistake. A mistake ends. This had a follow-up.',
];

const DEFENSE_CLOSERS = [
  'Read it again, slowly. What you will find is somebody trying very hard in the wrong direction.',
  'If earnestness is cringe, then we are all cooked. I ask you to consider the precedent.',
  'My client did not hurt anyone. My client mildly inconvenienced a waiter.',
  'There is a version of this person who is beloved at parties. I have met him. Briefly.',
  'The prosecution has shown you a moment. I am showing you a life.',
];

function hashDate(date) {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(list, seed, salt = 0) {
  return list[(seed + Math.imul(salt + 1, 2654435761)) % list.length];
}

export function utcDate(at = new Date()) {
  return at.toISOString().slice(0, 10);
}

export function caseNumberFor(date) {
  return Number(date.replaceAll('-', ''));
}

export function caseLabel(date) {
  const [year, month, day] = date.split('-');
  return `No. ${year}-${month}${day}`;
}

/** Build the hearing for a date. Pure. */
export function buildCase(date) {
  const seed = hashDate(date);
  const charge = CHARGES[seed % CHARGES.length];

  return {
    date,
    caseNumber: caseNumberFor(date),
    title: charge.title,
    exhibit: charge.exhibit,
    aggravator: charge.aggravator,
    prosecutor: [
      pick(PROSECUTION_OPENERS, seed, 1),
      charge.exhibit,
      `And then — ${charge.aggravator.toLowerCase()}`,
      pick(PROSECUTION_CLOSERS, seed, 2),
    ],
    defense: [
      pick(DEFENSE_OPENERS, seed, 3),
      `Consider what my client was actually doing: ${charge.exhibit
        .toLowerCase()
        .replace(/\.$/, '')}.`,
      'There is a difference between a bad decision and a bad person. The prosecution has declined to make it.',
      pick(DEFENSE_CLOSERS, seed, 4),
    ],
  };
}

const STORE_KEY = 'cringecourt:v1';

/** Read the whole persisted state. */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { cases: {}, submitted: {} };
    const parsed = JSON.parse(raw);
    return {
      cases: parsed.cases && typeof parsed.cases === 'object' ? parsed.cases : {},
      submitted: parsed.submitted && typeof parsed.submitted === 'object' ? parsed.submitted : {},
    };
  } catch {
    return { cases: {}, submitted: {} };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    return true;
  } catch {
    // Quota or private mode. The UI reports this rather than pretending it saved.
    return false;
  }
}

/** Read the tally and open flag for a date. */
export function readTally(date) {
  const state = loadState();
  const entry = state.cases[date];
  if (!entry) return { guilty: 0, notCooked: 0, total: 0, open: true };
  return {
    guilty: entry.guilty ?? 0,
    notCooked: entry.notCooked ?? 0,
    total: (entry.guilty ?? 0) + (entry.notCooked ?? 0),
    open: entry.open !== false,
  };
}

/** Record a vote. Returns the new tally. */
export function recordVote(date, verdict) {
  const state = loadState();
  const entry = state.cases[date] ?? { guilty: 0, notCooked: 0, open: true };

  if (entry.open === false) {
    return { ok: false, reason: 'Voting is closed for this case.', tally: readTally(date) };
  }

  const voters = entry.voters ?? {};
  // One ballot per browser. This is a static site, so this is the only
  // enforcement available, and the UI says so rather than implying otherwise.
  if (voters.self) {
    return { ok: false, reason: 'This browser has already voted on this case.', tally: readTally(date) };
  }

  if (verdict === 'GUILTY') entry.guilty = (entry.guilty ?? 0) + 1;
  else if (verdict === 'NOT_COOKED') entry.notCooked = (entry.notCooked ?? 0) + 1;
  else return { ok: false, reason: 'Unknown verdict.', tally: readTally(date) };

  entry.voters = { ...voters, self: verdict };
  entry.open = entry.open !== false;
  state.cases[date] = entry;

  if (!saveState(state)) {
    return { ok: false, reason: 'Could not save the vote in this browser.', tally: readTally(date) };
  }

  return { ok: true, tally: readTally(date) };
}

/** Close voting on a date. */
export function closeVoting(date) {
  const state = loadState();
  const entry = state.cases[date] ?? { guilty: 0, notCooked: 0 };
  entry.open = false;
  state.cases[date] = entry;
  saveState(state);
}

/** Resolve a case from its tally. Mirrors the Reddit build exactly. */
export const QUORUM = 5;
export const DECISIVE_SHARE = 0.55;

export function resolve(date, tally) {
  const total = tally.total;
  const guiltyShare = total === 0 ? 0 : (tally.guilty / total) * 100;
  const notCookedShare = total === 0 ? 0 : (tally.notCooked / total) * 100;

  if (total < QUORUM) {
    return {
      mistrial: true,
      verdict: null,
      rationale: `The jury did not reach quorum — ${total} of ${QUORUM} votes. The court declines to convict on a sample this small.`,
    };
  }
  if (guiltyShare >= DECISIVE_SHARE * 100) {
    return {
      mistrial: false,
      verdict: 'GUILTY',
      rationale: `Guilty, ${guiltyShare.toFixed(0)}% to ${notCookedShare.toFixed(0)}%. Bro is cooked.`,
    };
  }
  if (notCookedShare >= DECISIVE_SHARE * 100) {
    return {
      mistrial: false,
      verdict: 'NOT_COOKED',
      rationale: `Not cooked, ${notCookedShare.toFixed(0)}% to ${guiltyShare.toFixed(0)}%. The jury declined to punish effort.`,
    };
  }
  return {
    mistrial: true,
    verdict: null,
    rationale: `A split jury — ${guiltyShare.toFixed(0)}% guilty, ${notCookedShare.toFixed(0)}% not cooked. Neither side cleared ${(DECISIVE_SHARE * 100).toFixed(0)}%, so the court enters a mistrial.`,
  };
}

/** Submit a new exhibit as an ad-hoc case. */
export function submitExhibit({ title, exhibit, aggravator }) {
  const date = utcDate();
  const state = loadState();
  if (state.submitted[date]) {
    return {
      accepted: false,
      date,
      reason: 'This browser already submitted an exhibit today. The court hears one a day.',
    };
  }
  state.submitted[date] = { title, exhibit, aggravator };
  if (!saveState(state)) {
    return { accepted: false, date, reason: 'Could not save the exhibit in this browser.' };
  }
  return { accepted: true, date, reason: '' };
}

/** Read a submitted exhibit for a date, if any. */
export function readSubmitted(date) {
  const state = loadState();
  return state.submitted[date] ?? null;
}
