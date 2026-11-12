/**
 * CringeCourt site actions.
 *
 * These are the capabilities the court owns and explicitly registers with the
 * browser runtime. They are the difference between an agentic website and a
 * chatbot on a web page: the agents can read the real case and write a real vote
 * through the same functions the UI uses.
 *
 * Design rules, in order of importance:
 *
 * 1. **The verdict is a human capability, not an agent capability.** `cast_verdict`
 *    requires explicit user confirmation in the runtime's dialog. An agent can
 *    *propose* a vote; a person must confirm it. This is enforced by the
 *    confirmation gate, not by trust.
 * 2. **Reads are free, writes are gated.** `get_case_state` and `get_tally` are
 *    pure reads. `submit_exhibit` and `cast_verdict` mutate state and are marked
 *    as such so the runtime treats them accordingly.
 * 3. **Every action validates its own arguments.** The runtime validates against
 *    the JSON Schema, but the handler validates again, because a schema mismatch
 *    must never reach the game state.
 *
 * The runtime calls these via the bridge in `runtime/action-transport.js`.
 */

/**
 * The action catalogue.
 *
 * `effect` tells the runtime whether a call is reversible. Writes are marked
 * `irreversible` where undoing them is not possible (a cast vote cannot be
 * un-cast), which is what causes the runtime to require confirmation.
 */
export const ACTIONS = [
  {
    name: 'get_case_state',
    purpose:
      "Read today's case: the charge, the exhibit, both counsel's arguments, the current tally, and whether voting is open.",
    effect: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description:
            "Optional ISO date (YYYY-MM-DD). Defaults to today's docket in UTC.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        caseNumber: { type: 'number' },
        title: { type: 'string' },
        exhibit: { type: 'string' },
        aggravator: { type: 'string' },
        prosecutor: { type: 'string' },
        defense: { type: 'string' },
        open: { type: 'boolean' },
        guilty: { type: 'number' },
        notCooked: { type: 'number' },
        total: { type: 'number' },
      },
    },
  },
  {
    name: 'get_tally',
    purpose:
      'Read the current vote counts for a case, without changing anything.',
    effect: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional ISO date. Defaults to today.' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        guilty: { type: 'number' },
        notCooked: { type: 'number' },
        total: { type: 'number' },
        open: { type: 'boolean' },
      },
    },
  },
  {
    name: 'submit_exhibit',
    purpose:
      'Submit a new moment of cringe as a case for the court to hear. This becomes the exhibit that both counsel argue.',
    effect: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'One short line naming the incident, under 90 characters.',
        },
        exhibit: {
          type: 'string',
          description:
            'What actually happened, in the filer\'s words. Under 400 characters. Facts only.',
        },
        aggravator: {
          type: 'string',
          description: 'One line naming the detail that makes it worse. Under 120 characters.',
        },
      },
      required: ['title', 'exhibit'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        accepted: { type: 'boolean' },
        date: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  },
  {
    name: 'cast_verdict',
    purpose:
      "Cast the human's verdict on a case: GUILTY (bro is cooked) or NOT_COOKED. Requires explicit user confirmation, because a vote cannot be taken back.",
    effect: 'irreversible',
    inputSchema: {
      type: 'object',
      properties: {
        verdict: {
          type: 'string',
          enum: ['GUILTY', 'NOT_COOKED'],
          description: 'The verdict the human is choosing.',
        },
        date: { type: 'string', description: 'Optional ISO date. Defaults to today.' },
      },
      required: ['verdict'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        recorded: { type: 'boolean' },
        verdict: { type: 'string' },
        total: { type: 'number' },
        reason: { type: 'string' },
      },
    },
  },
];

/** Limits, enforced in the handler as well as the schema. */
const LIMITS = {
  title: 90,
  exhibit: 400,
  aggravator: 120,
};

/** Today's date in UTC, as YYYY-MM-DD. */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** Is this a plausible ISO date? */
function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Clamp a string and strip control characters.
 *
 * Kept deliberately conservative: submitted text is shown back to the filer and
 * read by a model, so newlines collapse and anything non-printable is removed.
 */
function clean(value, limit) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/**
 * Register the court's actions against a host-provided registry.
 *
 * @param {object} host - the site's action host: { getCase, getTally, submitExhibit, castVerdict }
 * @returns {Array} registrations in the shape the runtime expects
 */
export function createActionHandlers(host) {
  if (!host || typeof host !== 'object') {
    throw new Error('createActionHandlers: a host object is required');
  }

  return ACTIONS.map((action) => ({
    name: action.name,
    purpose: action.purpose,
    effect: action.effect,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
    handler: async (args) => {
      // The runtime validates against inputSchema; we validate again because a
      // schema bug must not be able to corrupt game state.
      const input = args && typeof args === 'object' ? args : {};

      switch (action.name) {
        case 'get_case_state': {
          const date = isDate(input.date) ? input.date : todayUtc();
          const state = await host.getCase(date);
          if (!state) {
            return { error: `No case is on the docket for ${date}.` };
          }
          return {
            date: state.date,
            caseNumber: state.caseNumber,
            title: state.title,
            exhibit: state.exhibit,
            aggravator: state.aggravator,
            prosecutor: state.prosecutor,
            defense: state.defense,
            open: state.open,
            guilty: state.tally.guilty,
            notCooked: state.tally.notCooked,
            total: state.tally.total,
          };
        }

        case 'get_tally': {
          const date = isDate(input.date) ? input.date : todayUtc();
          const tally = await host.getTally(date);
          return {
            date,
            guilty: tally.tally.guilty,
            notCooked: tally.tally.notCooked,
            total: tally.tally.total,
            open: tally.open,
          };
        }

        case 'submit_exhibit': {
          const title = clean(input.title, LIMITS.title);
          const exhibit = clean(input.exhibit, LIMITS.exhibit);
          const aggravator = clean(input.aggravator, LIMITS.aggravator);

          if (title.length < 8) {
            return { accepted: false, date: '', reason: 'A charge needs a title of at least 8 characters.' };
          }
          if (exhibit.length < 20) {
            return {
              accepted: false,
              date: '',
              reason: 'An exhibit needs at least 20 characters of what actually happened.',
            };
          }

          const result = await host.submitExhibit({ title, exhibit, aggravator });
          return {
            accepted: result.accepted,
            date: result.date,
            reason: result.reason ?? '',
          };
        }

        case 'cast_verdict': {
          const verdict = input.verdict;
          if (verdict !== 'GUILTY' && verdict !== 'NOT_COOKED') {
            return {
              recorded: false,
              verdict: '',
              total: 0,
              reason: 'A verdict must be GUILTY or NOT_COOKED.',
            };
          }
          const date = isDate(input.date) ? input.date : todayUtc();
          const result = await host.castVerdict({ date, verdict });
          return {
            recorded: result.recorded,
            verdict,
            total: result.total,
            reason: result.reason ?? '',
          };
        }

        default:
          return { error: `Unknown action: ${action.name}` };
      }
    },
  }));
}

export default { ACTIONS, createActionHandlers };

/**
 * Runtime entry point.
 *
 * The runtime imports this module on the publishing origin and calls
 * `registerActions(actions)` with a `{ register }` handle (see
 * `runtime/action-transport.js`). This is what makes the site's capabilities
 * discoverable to an agent, rather than merely described in prose.
 *
 * The host is resolved lazily from `game/host.js` so that this module stays
 * importable in a test environment with no DOM.
 */
export async function registerActions(actions) {
  if (!actions || typeof actions.register !== 'function') {
    throw new Error('registerActions: the runtime must supply a register handle');
  }

  const { host } = await import('../game/host.js');
  for (const definition of createActionHandlers(host)) {
    await actions.register(definition);
  }
}
