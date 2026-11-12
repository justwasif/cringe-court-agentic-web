# CringeCourt — an open agentic courtroom

A public courtroom where two AI counsel argue a submitted moment of cringe and a
human jury decides. Built as an **open agentic website**: the court's agents are
published as plain JSON, they run in *your* browser against *your* model key, and
another agent site can load them and hold a hearing in its own page.

**There is no agent server.** The network is data, the runtime is JavaScript, and
the model is yours.

---

## What makes this an agentic website, not a chatbot

Four things, and they are the reason this is not a wrapper around an API:

1. **A published agent network as data.** [`cringecourt.network.json`](cringecourt.network.json)
   declares three agents — a court clerk, a prosecutor and a defence counsel —
   with their instructions, invocation schemas and down-chain links. No code, no
   server, no prompt hidden in a bundle.
2. **A browser runtime that executes it.** The network is loaded, validated and
   run by the browser. The visitor supplies the model and the key; the site never
   pays for inference and never sees the key.
3. **Site actions that connect agents to the page.** Four registered capabilities
   ([`actions/court-actions.js`](actions/court-actions.js)) let an agent read the
   real case and propose a real vote. This is the difference between talking about
   a game and playing it.
4. **Cross-origin composition.** A second origin can load `cringecourt` by name
   and run it locally, with consent. Proven in [`test/peer.mjs`](test/peer.mjs).

---

## The courtroom

One case a day, derived deterministically from the UTC date, so every visitor on
the same day sees the same hearing with no server and no database.

| Agent | Role | Voice |
|---|---|---|
| `court_clerk` | Front agent. Convenes the hearing, assembles the transcript. | Neutral. Never argues, never decides. |
| `prosecutor` | Miss Ratio, for the people. | Razor-observant, sarcastic, dramatic. |
| `defense` | Counsel Chaos, for the defence. | Charismatic, warm, unexpectedly persuasive. |

Ask the clerk to *"hear today's case"* and it calls both counsel with the same
facts and returns the transcript. Ask it to decide and it refuses — the verdict
belongs to the jury.

## The four site actions

| Action | Effect | Why |
|---|---|---|
| `get_case_state` | read | The charge, the exhibit, both arguments, the tally. |
| `get_tally` | read | Vote counts, without changing anything. |
| `submit_exhibit` | write | Submit a new moment of cringe for the court to hear. |
| `cast_verdict` | **irreversible** | Cast the human's vote. Requires explicit confirmation. |

The `cast_verdict` action is marked irreversible on purpose. The runtime, not the
model, is what forces a confirmation dialog, so an agent cannot vote on a
person's behalf by talking persuasively.

---

## The invariant: the judge never decides

Ported from the original CringeCourt, and load-bearing here too:

> Model output never decides a verdict, and the judge agent never predicts one.

In practice:

- The **judge's lines are fixed text**. There is no judge agent in the published
  network at all — the clerk reads the charge to the jury from the case data. A
  model that slips a verdict hint into the judge's mouth is not a risk that needs
  testing; the mouth is not connected to a model.
- The **verdict is computed by code** from the tally, with a quorum and a
  decisive-share threshold. Not by an LLM.
- Argument text is **validated against a speaker allow-list** with a length cap,
  and misattributed lines are dropped rather than reassigned.

## The rules make it a game, not a poll

A side needs **55%** of the vote to win, and a case needs **5 votes** before any
verdict counts. Below either threshold the court enters a **mistrial**: nobody
scores, and the incident stays permanently in question.

Both thresholds are constants with a test on each boundary, including the exact
case (55 of 100 is decisive; 54 is not).

---

## Running it

```bash
npm install
npm start          # http://127.0.0.1:8080
npm test           # 46 unit tests
node test/peer.mjs # 30 cross-origin checks
```

No build step. No bundler. The files are served as they are, because the point of
the spec is that ordinary web hosting is sufficient.

To hold a hearing you need a model key: open the chat, expand **BYOK / router
settings**, and enter an OpenAI-compatible base URL, a model id and your key. The
courtroom itself works with no key at all — only the conversation needs one.

## Deploying

Any static host. The only requirements are the CORS headers in
[`_headers`](_headers) on the six public artifacts, and the CSP for
`/runtime/sandbox-worker.js`. Apache can use `.htaccess` instead.

```
agent-manifest.json          Access-Control-Allow-Origin: *
cringecourt.network.json     Access-Control-Allow-Origin: *
links.json                   Access-Control-Allow-Origin: *
agent-mcp.json               Access-Control-Allow-Origin: *
/.well-known/nsdeploy.json   Access-Control-Allow-Origin: *
/runtime/sandbox-worker.js   Content-Security-Policy: default-src 'none'; ...
```

Action modules are deliberately **not** CORS-exposed: they execute only on their
owning origin, per the spec.

---

## Layout

```
agent-manifest.json        the site's public index: network, front agent, actions
cringecourt.network.json   the agent graph, as data (Neuro SAN model)
links.json                 symbolic peer-name resolution
_headers                   the CORS/CSP contract, as production sets it
index.html                 the page
theme.css                  the visual system
actions/
  court-actions.js         the four capabilities + registerActions() entry point
game/
  court.js                 case assembly, voting, resolution (pure, no DOM)
  host.js                  binds actions to the game's state
  app.js                   the page's UI
runtime/                   the reference browser runtime (Apache-2.0, vendored)
test/
  court.test.js            23 tests over case logic
  actions.test.js          23 tests over the action boundary
  peer.mjs                 30 cross-origin interoperability checks
peer-site/                 a second origin, for the cross-origin test
serve.mjs                  a local static server with production's CORS policy
```

## What is real here, and what is not

Stated on the page itself, not just in this README:

- **Real:** the network is published as data and runs in the browser. The site
  actions are registered capabilities that read and write page state. The key is
  the visitor's.
- **Real:** cross-origin loading of the published network by name, with consent.
- **Not real:** the tally is **this browser's** ballots. A static site has no
  shared backend, so there is no global vote count, and the UI says "this browser"
  for exactly that reason.
- **Not real:** the verdict. This is a comedy show about a fictional incident. It
  is not legal advice and no verdict has ever been enforced.

## Attribution

The browser runtime under `runtime/` is the reference implementation from
Cognizant AI Lab's [agentic-web](https://github.com/cognizant-ai-labs/agentic-web)
repository, Apache-2.0, vendored unmodified. The agents, the case logic and the
site actions are this project's work. The CringeCourt characters
(Miss Ratio, Counsel Chaos) come from [CringeCourt](https://github.com/my-Tea/cringe-court-).
