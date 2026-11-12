# Architecture — CringeCourt as an open agentic website

Conforms to the *Minimum Viable Specification for a Worldwide Agentic Web*,
**MVP Profile 0.2** (Cognizant AI Lab, 6 November 2026).

---

## 1. Why this shape

The spec's central constraint is that an agent network must be **portable data**
that a browser can execute, not code that a server runs:

> "An implementation MAY use different internal libraries or agent frameworks and
> it conforms when it produces and consumes the same public artifacts and
> observable behaviors."

That constraint decided most of the architecture:

| Constraint | Consequence |
|---|---|
| Network is data, not code | `cringecourt.network.json` holds prompts, schemas and the graph |
| The browser is the container | no application server; static hosting only |
| Inference is pluggable | the visitor's router and key; the site funds nothing |
| Public artifacts are CORS-readable | six files carry `Access-Control-Allow-Origin: *` |
| Actions stay on their origin | `actions/` is *not* CORS-exposed, deliberately |

The outcome is a courtroom that can be forked by copying two JSON files, and
whose agents another site can borrow without cloning a server.

---

## 2. The published artifacts

```
/agent-manifest.json      the index: name, front_man, hocon, actions, linking
/cringecourt.network.json the resolved agent graph (Neuro SAN data model)
/links.json               symbolic peer-name → concrete URL
```

`agent-manifest.json` is the entry point. Its shape follows the reference
bundle's, field for field:

```json
{
  "brand": "CringeCourt",
  "networks": [{ "name": "cringecourt", "front_man": "court_clerk",
                 "hocon": "./cringecourt.network.json", "...": "..." }],
  "llm_router": { "base_url": "...", "byok_router": "..." },
  "peer_policy": { "mode": "open", "deny_origins": [] },
  "actions": { "version": 1, "module": "./actions/court-actions.js",
               "agentTools": ["get_case_state", "submit_exhibit",
                              "cast_verdict", "get_tally"] },
  "linking": { "protocol": "nsdeploy-link/v1", "exports": [...] }
}
```

`actions.version` is `1` because `runtime/action-transport.js` hard-rejects any
other value (`Unsupported action protocol`). This was found by running the
runtime's own validation rather than by reading the docs, and it is the kind of
detail that silently breaks a submission.

---

## 3. The agent graph

Three nodes, one of which is the front agent:

```
                 ┌──────────────┐
   inquiry ─────▶│ court_clerk  │  front agent: convenes, assembles, stops
                 └──────┬───────┘
                        │ calls both, same facts
             ┌──────────┴──────────┐
             ▼                     ▼
      ┌──────────────┐      ┌──────────────┐
      │  prosecutor  │      │   defense    │
      │  Miss Ratio  │      │ Counsel Chaos│
      └──────────────┘      └──────────────┘
```

The clerk's tool list contains **only** `prosecutor` and `defense`. That is
deliberate and was also forced by validation: listing `website_get_case_state` as
a static tool fails with

```
Agent 'court_clerk' references missing tool 'website_get_case_state'.
```

Site actions are advertised by the *runtime* at execution time under a
`website_`-prefixed alias; they must not appear in the static graph. The
declaration that connects them is `actions.agentTools` in the manifest, which is
the right place — the graph stays portable, and the capability binding stays with
the site.

### Why there is no judge agent

The original CringeCourt had a judge persona who was prohibited from hinting at a
verdict, enforced by prompt plus a neutrality check. Here the failure mode is
removed instead of mitigated: the judge's lines are **static text in the case
data**, and no model is ever asked to speak as the judge.

Prompt-level neutrality is a test you can fail. An absent agent is not.

---

## 4. The action boundary

`actions/court-actions.js` exports two things:

- `createActionHandlers(host)` — pure construction, given a host object. This is
  what the tests drive, with no DOM.
- `registerActions(actions)` — the runtime entry point. The runtime imports the
  module on the publishing origin and calls this with a `{ register }` handle.

Four actions, classified by effect:

| Action | Effect | Rationale |
|---|---|---|
| `get_case_state` | `read` | Pure read of case + tally. |
| `get_tally` | `read` | Counts only. |
| `submit_exhibit` | `write` | Mutates the day's case. |
| `cast_verdict` | `irreversible` | A vote cannot be un-cast. |

`irreversible` is what causes the runtime to raise its confirmation dialog before
the call reaches the handler (`reviewActions()` in `action-transport.js`). So the
guarantee "an agent cannot vote for you" is enforced by the transport, not by the
prompt, and it holds even if the model is fully persuaded that it should vote.

### Defence in depth

Every handler validates again, even though the runtime validates against the
JSON Schema first:

- The verdict **enum** is checked in the handler — an invented string like
  `ACQUITTED` returns `recorded: false`, it does not become a vote.
- Text arguments are passed through `clean()`: control characters stripped,
  whitespace collapsed, truncated at a cap (title 90, exhibit 400, aggravator 120).
- Minimum lengths are enforced (title ≥ 8, exhibit ≥ 20) so an agent cannot spend
  the day's single exhibit on "test".
- The host is called through an interface, so a host failure **propagates**. It is
  not swallowed into a success-shaped response; a test asserts this.

---

## 5. Verdict resolution, in code

```
total < 5            → mistrial
guilty ≥ 55%         → GUILTY
not cooked ≥ 55%     → NOT_COOKED
otherwise            → mistrial
```

`resolve()` is pure and synchronous, and returns `verdict: null` for a mistrial
rather than a default value. The earlier Reddit build returned `'NOT_COOKED'` as a
sentinel and needed an `isMistrial()` companion; here the type is honest from the
start, which is the better lesson to carry forward.

---

## 6. Cross-origin composition

The spec's headline check is that a *second origin* can load an exact named
network and run it locally. The mechanism is `Engine.resolveRemote()`:

1. `fetchManifest(origin)` reads the peer's `agent-manifest.json`.
2. The network is selected **by exact name** from the URL's last path segment.
   If it is absent the runtime throws rather than falling back to `networks[0]`:
   *"No published network named 'X' … refusing to run a different network."*
3. Schema validation runs before execution; a structurally invalid network never
   runs.
4. The peer runs with the **caller's** router. A peer can never supply its own
   execution environment or acquire the visitor's key.

`test/peer.mjs` starts two real origins and asserts 30 properties across nine
groups, including that the action module is served **without** a CORS grant.

### What the test does not prove

Stated in the test output, not buried here:

> Not proven here: dynamic action-module execution over http, which is
> browser-only.

The runtime registers actions with a dynamic `import()` of an http(s) URL. Node's
ESM loader accepts only `file:` and `data:`, so outside a browser that import is
refused — and the test asserts the refusal rather than pretending to have run it.
Manifest resolution, exact-name selection, validation, compilation and the CORS
policy *are* proven. The last hop needs a real browser, and is verified by hand.

---

## 7. State

`game/court.js` keeps everything in `localStorage` under one key,
`cringecourt:v1`:

```json
{ "cases": { "2026-11-12": { "guilty": 1, "notCooked": 0,
                             "voters": { "self": "GUILTY" }, "open": true } },
  "submitted": { "2026-11-12": { "title": "...", "exhibit": "..." } } }
```

This is the honest consequence of a static site, and the UI says so: the tally is
*this browser's* ballots. `saveState()` returns `false` on a quota or private-mode
failure and the caller reports it, rather than showing a vote that was never
stored.

One vote per browser per case, enforced by the `voters.self` marker. That is not
a security boundary and is not presented as one.

---

## 8. Deviations from the reference bundle

| Reference | Here | Why |
|---|---|---|
| Tailwind-built `theme.css` | hand-written CSS | no build step; the whole point is static hosting |
| `site.js` calls `boot()` with a mount | same, plus `runtime.actions.register()` | the actions are the substance of this build |
| pizza restaurant network | courtroom network | domain |
| no `version` on actions | `actions.version: 1` | the transport rejects anything else |
| — | judge is not an agent | removes a failure mode rather than testing for it |

## 9. Known limits

- **No global tally.** Static hosting, no backend. A shared count would need an
  HTTP Fetch service.
- **No MCP facade.** `agent_mcp.available` is `false`: a public MCP facade needs
  an application host, and the manifest says so instead of advertising a
  capability that does not exist.
- **No server-side screening.** The Reddit build screens submissions in its
  store; here text is cleaned and capped in the browser, and nothing more.
