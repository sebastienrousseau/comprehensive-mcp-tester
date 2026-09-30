# Implementation plan

The working plan behind [`ROADMAP.md`](../ROADMAP.md): where the fork and the upstream contributions stand, what to do when work resumes, a full audit of the code, and the technical plan that follows from it. `ROADMAP.md` stays the single source for *what* ships in which milestone; this page is *how*, and in what order.

Written on 2026-09-30 against `feat/v0.0.1` at `8cf9dc1`. Measurements name the command that produced them; research claims link their source; anything not verified says so.

**Contents**

- [Part A. Resume checklist](#part-a-resume-checklist)
- [Part B. Context and horizon (2026 to 2027)](#part-b-context-and-horizon-2026-to-2027)
- [Part C. Audit](#part-c-audit)
- [Part D. Delivery plan](#part-d-delivery-plan)
- [Part E. Decisions for the owner](#part-e-decisions-for-the-owner)

---

## Part A. Resume checklist

### A.1 State at the pause

**Fork (`sebastienrousseau/comprehensive-mcp-tester`)**

- `feat/v0.0.1` holds every change so far; release pull request [#66](https://github.com/sebastienrousseau/comprehensive-mcp-tester/pull/66) is its only open pull request into `main`, and its CI is green.
- Health: no open Dependabot pull requests or alerts, no code-scanning or secret-scanning alerts, `npm audit` clean for the app and `tools/lint`, `main` CI green.
- Blocking the 0.0.1 tag: the licence ([#51](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/51)), and `npm run version:bump` (the files still say 0.0.0; see R1 in [C.1.4](#c14-branch-analysis-mainfeatv001)).
- Fork-only changes, deliberately not offered upstream: the release pipeline ([#64](https://github.com/sebastienrousseau/comprehensive-mcp-tester/pull/64)), the restart of version numbering at 0.0.1 ([#65](https://github.com/sebastienrousseau/comprehensive-mcp-tester/pull/65)) and the version tools ([#77](https://github.com/sebastienrousseau/comprehensive-mcp-tester/pull/77)). Upstream is still at 0.10.0 with acceptance folders `v0.10.1` and `v0.10.2`.

**Upstream (`mollerade/comprehensive-mcp-tester`)**

Twenty-one open pull requests, each carrying one fork change, all green. They are stacked: each branch contains the ones before it, so they merge in this order and each diff narrows as the earlier ones land.

| Order | PR | Change |
| :---: | :--- | :--- |
| 1 to 10 | [#2](https://github.com/mollerade/comprehensive-mcp-tester/pull/2) to [#11](https://github.com/mollerade/comprehensive-mcp-tester/pull/11) | Schema-name XSS fix, https-only authorization endpoint, connection generation guard, traceability check, mock scenario registry, compliance rule engine, repository layout, Node 22 floor, Makefile, user manual |
| 11 | [#12](https://github.com/mollerade/comprehensive-mcp-tester/pull/12) | Cap the request Log at 1000 entries |
| 12 | [#13](https://github.com/mollerade/comprehensive-mcp-tester/pull/13) | Content-Security-Policy from both hosts |
| 13 | [#14](https://github.com/mollerade/comprehensive-mcp-tester/pull/14) | No client secret across a sign-in redirect |
| 14 | [#15](https://github.com/mollerade/comprehensive-mcp-tester/pull/15) | Scripts run from symlinked paths |
| 15 | [#16](https://github.com/mollerade/comprehensive-mcp-tester/pull/16) | Two CodeQL findings in the tooling |
| 16 | [#17](https://github.com/mollerade/comprehensive-mcp-tester/pull/17) | Manual's Python pins a week back, install retry |
| 17 | [#18](https://github.com/mollerade/comprehensive-mcp-tester/pull/18) | Packaging notes, reproducible-build check |
| 18 | [#22](https://github.com/mollerade/comprehensive-mcp-tester/pull/22) | CodeQL findings in the app and mock server |
| 19 | [#19](https://github.com/mollerade/comprehensive-mcp-tester/pull/19) | Hardened CI, CodeQL, Scorecard, community files, dependency-graph check |
| 20 | [#20](https://github.com/mollerade/comprehensive-mcp-tester/pull/20) | E2E mandatory in CI, JUnit reports |
| 21 | [#21](https://github.com/mollerade/comprehensive-mcp-tester/pull/21) | ESLint gate with a shrinking complexity baseline |

The upstream branches are `upstream/*` in the fork (from #12 on) and are rebuilt from the fork's commits, without the fork-only changes above.

### A.2 When upstream acts

| Upstream does | Then |
| :--- | :--- |
| Merges a prefix of the chain | Nothing to rebase: the later pull requests narrow on their own. Check each remaining one is still mergeable and green. |
| Asks for a change on one pull request | Make it on the fork first (commit on the active `feat/v<next>` branch), then replay it onto that `upstream/*` branch and every later one, force-pushing one branch at a time with a lease on the expected old head and a signature check (`git log --format=%G?`) before each push. Refresh the checksums and test counts in each touched description. |
| Declines a change | Close that pull request with a short note; keep the change in the fork; rebuild the later branches without it. |
| Merges the whole chain | Sync: `git fetch upstream && git merge upstream/main` into a new `feat/v<next>` branch. Expect conflicts only in the fork-only files (version numbers, release pipeline, `docs/releases/`). Then continue with [Part D](#part-d-delivery-plan). |
| Turns the dependency graph on | Nothing: the Dependency review job starts running the review by itself (`scripts/dependency-graph.mjs`). |

After any upstream change, re-run the pull-request description audit against `~/Code/PR-TEMPLATE.md` for every open pull request on both repositories.

### A.3 Human-only blockers

| Blocker | Owner | Unblocks |
| :--- | :--- | :--- |
| Choose a licence ([#51](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/51)); upstream's author must agree | Seb with Christian | The 0.0.1 tag, redistribution, enterprise adoption, Scorecard, REUSE headers |
| Merge release PR #66 and push the signed tag | Seb | The first release |
| Sign-off hook (`~/.dotfiles/.git/enable-signoff.sh`), if still wanted | Seb | `Signed-off-by` on every commit |
| Branch protection and a second reviewer on `main` | Seb | Scorecard 9 or more |
| Dependency graph on the upstream repository | Christian | Dependency review upstream |
| Private disclosure of the security findings in [C.3](#c3-security-hardening-and-compliance), once fixed in the fork | Seb (sends), Claude (prepares) | Upstream users |

### A.4 First session after the pause

1. Hygiene (`~/Code/AGENTS.md` section 0) on the fork: Dependabot, code scanning, secret scanning, `npm audit` for the app and `tools/lint`, `main` CI.
2. Read the upstream pull requests' state; act per [A.2](#a2-when-upstream-acts).
3. If the licence is settled: `npm run version:bump`, merge #66, tag `v0.0.1` through the release preflight (`DEVELOPMENT.md`, Releases).
4. Open `feat/v0.0.2` and start [Milestone 1](#d1-milestone-1-stabilisation-and-security-002).

---

## Part B. Context and horizon (2026 to 2027)

### B.1 Domain

MCP Tester is a browser-based Model Context Protocol client for testing and diagnosing MCP servers over Streamable HTTP. Its audience is developers and platform teams who build or operate MCP servers, including inside company networks (the primary real-world target is the HSBC Developer Portal MCP). Stack: a single self-contained HTML page of ES5 classic scripts; a platform-free proxy core in modern JavaScript; two hosts (a Cloudflare Worker and a local Node 22+ server); zero runtime dependencies; Playwright for end-to-end tests.

### B.2 Where the protocol is going

Spec **2026-07-28** ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)) made MCP stateless and is the baseline for the next two years:

- Sessions and the `initialize` handshake removed; every request carries its protocol version and client capabilities in `_meta`; `server/discover` is mandatory for servers.
- `subscriptions/listen` replaces the GET stream and `resources/subscribe`; no SSE resumability (`Last-Event-ID` removed).
- MRTR: a result with `resultType: "input_required"` is retried with `inputResponses`, replacing server-initiated sampling, elicitation and roots. `resultType` is required on every result.
- Tasks moved to the `io.modelcontextprotocol/tasks` extension; `Mcp-Method` and `Mcp-Name` headers required; `ttlMs` / `cacheScope` required on list results; new error range (-32020 HeaderMismatch, -32021, -32022).
- Authorization: clients must validate RFC 9207 `iss`, bind credentials to their issuer, and prefer CIMD; DCR is deprecated.
- Roots, Sampling, Logging and HTTP+SSE deprecated, with at least 12 months' notice.
- OpenTelemetry trace context (`traceparent`) carried in `_meta`.

Next ([roadmap](https://modelcontextprotocol.io/development/roadmap), "not firm commitments"): server-initiated events and webhooks; an HTTP-native transport including "HTTP over stdio"; agent identity (DPoP, workload identity federation, ID-JAG token exchange); a redesigned `tools/call` result shape and progressive tool discovery; SDKs generated from the spec with the conformance suite as source of truth. Server Cards (`/.well-known/mcp/server-card.json`, [SEP-2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)) are proposed; their final path is unverified. No date for the next spec release is published.

Governance: MCP moved to the Agentic AI Foundation under the Linux Foundation in December 2025 ([announcement](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)). Enterprise-Managed Authorization (EMA, built on the ID-JAG draft) is an official extension ([docs](https://modelcontextprotocol.io/extensions/auth/enterprise-managed-authorization)). Whether DPoP is in the core spec is unverified: SDKs ship it, the roadmap still says "finalize".

### B.3 Competitive baseline

| Tool | Has that MCP Tester lacks | MCP Tester has that it lacks |
| :--- | :--- | :--- |
| [MCP Inspector](https://github.com/modelcontextprotocol/inspector) v2 (official) | stdio; CLI and TUI for CI; MCP Apps rendering; Tasks view; EMA | Zero-install hosted option; no secrets file on disk (Inspector stores plaintext without an OS keychain, per its README); spec-cited compliance checks (planned) |
| [MCPJam Inspector](https://github.com/MCPJam/inspector) | Model-in-the-loop evals across many models; guided OAuth and EMA debugger; desktop apps; GitHub Actions | Edge-hosted, keyless, local-first |
| [Postman](https://learning.postman.com/docs/use/send-requests/protocols/mcp-requests/interact), [Insomnia](https://developer.konghq.com/insomnia/mcp-clients-in-insomnia/) | Collections, workspaces, variables, stdio | Diagnostics timeline, OAuth discovery trace, dual-era fallback |
| [Official conformance suite](https://github.com/modelcontextprotocol/conformance) | Client and server scenarios per spec version, `checks.json`, a GitHub Action with expected-failure baselines | An interactive UI; this is the reference the compliance checker should align with, not compete against |
| [Snyk Agent Scan](https://github.com/snyk/agent-scan), [Cisco mcp-scanner](https://github.com/cisco-ai-defense/mcp-scanner) | Tool-poisoning, rug-pull and shadowing detection | Protocol and auth diagnosis |

Security references for the category: the [OWASP MCP Top 10](https://owasp.org/projects/mcp-top-10) and the [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html). OpenTelemetry's `mcp.*` attributes now live in the [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/mcp/).

### B.4 Best-in-class checklist and where MCP Tester stands

| # | Capability | Today | Planned in |
| :---: | :--- | :--- | :--- |
| 1 | Every spec version, with the fallback visible | Partial (2026-07-28 and 2025-11-25) | M1 (version picker) |
| 2 | 2026-07-28 protocol checks (headers, `resultType`, `ttlMs`, error codes, ordering) | Engine only, one rule | M2 |
| 3 | MRTR (`input_required` / `inputResponses`) | No | M3 |
| 4 | `subscriptions/listen` | No | M3 |
| 5 | Tasks extension viewer; MCP Apps rendering | No | M3 (tasks), later (Apps) |
| 6 | Compliance aligned with the official conformance suite IDs, JUnit / `checks.json` output | No | M2 |
| 7 | Headless CLI and GitHub Action with baselines | No | M3 |
| 8 | Full OAuth debugger: CIMD first, `iss`, issuer binding, refresh, step-up | Most; refresh and step-up open (#44, #45) | M2 |
| 9 | EMA / ID-JAG; DPoP (labelled not final) | No | M4 |
| 10 | Security lint of tool, prompt and resource descriptions; rug-pull hashes | No | M3 |
| 11 | Optional model-in-the-loop evals | No | Roadmap 8 (#30) |
| 12 | Schema quality and result-shape checks | No | M2 |
| 13 | `server/discover`, Server Card and registry `server.json` validation | Discover only | M2 (discover), M3 (cards, `server.json`) |
| 14 | OpenTelemetry: `traceparent` in `_meta`, spans | No | M2 |
| 15 | Replay, cURL / HAR export, collections, variables | No | Roadmap 5 (#19) |
| 16 | stdio through the local host | No (ADR 0003 decided Streamable HTTP only) | Decision E4 |
| 17 | Enterprise deployment: offline, corporate proxy and CA, no plaintext secrets, audit log | Partial | M1, M4 |
| 18 | Signed releases, SLSA provenance, SBOM, checksums | Built (#64), first release pending | 0.0.1 |

---

## Part C. Audit

Severity: Critical / High / Medium / Low. Confidence: H (read and, where marked, reproduced), M, L. IDs are stable; the delivery plan in Part D refers to them.

### C.1 Architecture and feature completeness

#### C.1.1 Protocol and transport

| ID | Finding | Where | Sev / Conf |
| :--- | :--- | :--- | :--- |
| PROTO-1 | The client SSE parser only matches `data:` followed by a space, ignores CRLF, `event:`, `id:` and `retry:`, and joins multi-line data without `\n`. `data:{"id":1}` parses to nothing and shows as an empty success. No test calls it. | `src/ui/js/transport.js:238-254` | High / H (reproduced) |
| PROTO-2 | Only the last SSE message is kept; earlier progress, log and server-request messages never reach the Log, and the response is chosen by position, not by `id`. | `transport.js:143`, `:164` | High / H |
| PROTO-3 | The proxy's timeout covers reading the whole body: a server that sends its response and keeps the stream open is reported as a timeout and the received response discarded, then retried. | `src/core/proxy.js:104-119` | High / H (reproduced: returns after 2002 ms as `timeout` with `timeoutMs: 2000`) |
| PROTO-4 | Retries resend `tools/call` after a timeout, so side effects can repeat. | `proxy.js:99-163` | Medium / H |
| PROTO-5 | Pagination is ignored: `nextCursor` is never followed, so long lists are silently cut short. | `transport.js:392-402` | High / H |
| PROTO-6 | `resources/list` and `prompts/list` are sent whatever the server advertises; the -32601 answers count as failures in Diagnostics. | `transport.js:398` | Medium / H |
| PROTO-7 | Legacy sessions: a 404 on a live session does not re-initialise, Disconnect sends no `DELETE`, and any response's `mcp-session-id` replaces the current one (the Diagnostics `initialize` probe can swap a live session for an uninitialised one). | `transport.js:173-177`, `:379-390`; `diagnostics.js:117-130` | High / H |
| PROTO-8 | No cancellation: no `AbortController` in `proxyFetch`, no `notifications/cancelled`, no Cancel button. | `transport.js:2-36`; `views.js:351-366` | Medium / H |
| PROTO-9 | `negotiate()` has no `.catch` (an exception leaves `state.connecting` true); `pickVersion` accepts any string sorting before 2025-11-25. | `transport.js:277-283`, `:336-342` | Low / H |
| PROTO-10 | A tool result with `isError: true` is shown as a success; `structuredContent` is not checked against `outputSchema`. | `transport.js:149-151` | Medium / H |
| PROTO-11 | An expired access token is still sent (refresh is #44; until then warn instead of attaching it silently). | `auth.js:131-138` | Medium / H |
| PROTO-12 | A malformed `%` escape in any callback parameter aborts sign-in. | `auth.js:96-105` | Low / M |
| PROTO-13 | `suggestValue` ignores `$ref`, `anyOf` / `oneOf` / `allOf` and `exclusiveMinimum`. | `src/ui/js/schema.js:4-38` | Low / H |

#### C.1.2 Architecture

| ID | Finding | Sev / Conf |
| :--- | :--- | :--- |
| ARCH-1 | The client files share one global scope with `no-undef` off (`eslint.config.mjs:50`), bidirectional calls (transport and auth, transport and views) and 46 inline `onclick=` strings calling globals by name. A misspelt cross-file call is caught by nothing but e2e. `servers.js:2` and `theme.js:2` break the "top-level code only in `state.js` and `main.js`" rule. | High / H |
| ARCH-2 | `state`, `diag` and `auth` are one mutable bag written from about eight files; the connection generation guard is the only safety net. | Medium / H |
| ARCH-3 | The compliance engine cannot run where the data is: it is modern JavaScript (the client is ES5), the UI records no exchanges (the Log has no request headers), and the Worker bundles the one-rule catalogue unused. | High / H |
| ARCH-4 | Hosts differ: the Worker has no request-body cap (Node caps 1 MB), no `nosniff`, no `Cache-Control: no-store` on `/proxy`, and no exception handler (a thrown error becomes Cloudflare error 1101). | Medium / H |
| ARCH-5 | `docs/ARCHITECTURE.md` omits `security-headers.js` and understates `scripts/`. | Low / H |

#### C.1.3 Missing capabilities

None of these has code today (searched `src/ui/js` and `src/core`): resource templates and `completion/complete`; `ping`; per-request `logLevel`; `subscriptions/listen` (and the legacy GET stream); `listChanged` handling; progress display; cancellation; MRTR; the tasks extension; opt-in client roles (elicitation, sampling, roots) answered by hand; request headers in the Log; a raw request console for any method; JSON mode for resources and prompts.

#### C.1.4 Branch analysis (`main...feat/v0.0.1`)

About 150 lines change under `src/` (CSP in both hosts, no secret across the redirect, Log cap, callback-parameter whitelist, version label, symlink-safe entry points, `hasOwnProperty` clean-ups); the rest is tooling, CI, docs and tests. `npm test` passes 220/220 and the lint gate reports 44 baselined offenders, none worse.

| ID | Risk | Sev / Conf |
| :--- | :--- | :--- |
| R1 | `CLIENT_INFO.version` and `package.json` say 0.0.0 until `npm run version:bump`; servers see 0.0.0. The release preflight catches a mismatch, but the bump must happen before tagging. | Medium / H |
| R2 | The redirect sign-in now discards the code whenever a client secret was entered, so a confidential client on the redirect path signs in twice (by design; the UI explains it). A secret returned by DCR cannot be re-entered. | Low / H |
| R3 | The Log cap limits the number of entries, not their size (PERF-1, PERF-2). | Low / H |
| R4 | The CSP allows Google Fonts; offline or on a blocking network the fonts fail (#71). | Low / H |

Test adequacy: Node's coverage cannot see `src/ui/js/*` (about 1,900 lines) because the UI suite loads it through `vm.runInContext`; only e2e exercises it. Untested by name: `parseSSE`, `negotiate`, `retryModernError`, `pickVersion`, `collectParamHeaders`, the monitor, `renderLatencyChart`, and the proxy's redirect, bad-header and Worker-exception paths.

#### C.1.5 Complexity backlog (worst first)

From `tools/lint/complexity-baseline.json` (ceilings: cyclomatic 10, cognitive 15, 60 lines per function, 500 per file).

| Offender | Measured | Refactor |
| :--- | :--- | :--- |
| `proxyMcp` (`src/core/proxy.js`) | cyclomatic 39, cognitive 41, 145 lines | `validateTarget`, `buildOutHeaders`, `attemptOnce` returning `{ ok, resp } \| { ok: false, err }`, `successEnvelope` / `failureEnvelope`, a small `runAttempts` loop. PROTO-3, PROTO-4, PERF-3 and the redirect work all land in `attemptOnce`. |
| `renderLog` (`log.js`) | cognitive 50 | `renderLogHeader(e)`, lazy `renderLogBody(e)`, a `TIMING_ROWS` table. |
| `renderLatencyChart` (`diagnostics.js`) | cyclomatic 24, cognitive 41, 83 lines | Pure `chartGeometry(probes, w, h)` (unit-testable), `svgPath`, `svgAxes`. |
| `suggestValue` (`schema.js`) | cyclomatic 32, cognitive 37 | `hintValue(s)`, `SUGGEST_BY_TYPE[t](s, depth)`, `STRING_FORMATS`. |
| `renderAuthModal` and `auth.js` (658 lines) | cyclomatic 32, cognitive 32 | `AUTH_FORMS` map; split `auth.js` into `auth-core.js`, `auth-flows.js`, `auth-view.js` in `ORDER.json`. |
| `hydrateExpanded`, `renderToolDetail` (`views.js`) | cognitive 32 and 27 | One hydrator per field type; `renderParamRow`. |
| `computeStats` (`diagnostics.js`) | cognitive 27 | `percentiles`, `streaks`, `counts`. |
| Host request handlers | Node cyclomatic 20; Worker 15 | A shared route table with `handleProxy`. |

### C.2 Performance, concurrency and resource efficiency

Measured on Node 24.21.0 on a Mac with scripts that import the real modules (kept outside the repository). The browser's DOM parse and layout come on top of the UI figures and were not measured; nothing was tried on an iPad.

| Measurement | Result |
| :--- | :--- |
| `computeStats()`, 500 samples | 0.32 ms |
| `renderDiagnostics()` string, 500 samples | 0.44 ms, 36.6 KB |
| `renderLog()`, 1000 entries of about 1 KB / 10 KB / 100 KB | 10 ms, 3.1 MB / 134 ms, 18 MB / 2,262 ms, 167 MB (heap 1.38 GB) |
| Header-only Log render (lazy stand-in), 1000 entries | 0.16 ms, 299 KB |
| `proxyMcp` plus envelope, 1 / 10 / 50 MB SSE body | 5 / 30 / 181 ms; RSS +8 / +77 / +342 MB |
| Built files | `index.html` 139.6 KB (gzip 36.6); `worker.js` 156.9 KB (gzip 42.8) |

| ID | Finding | Where | Sev / Conf |
| :--- | :--- | :--- | :--- |
| PERF-1 | The Log re-renders every entry with every body pretty-printed on each new entry while the tab is open (two renders per call); it also collapses entries the user expanded. | `log.js:14`, `:26-70`; `views.js:23` | High / H |
| PERF-2 | Log entries have no size budget: 1000 entries of 1 MB keep about 1 GB of objects. | `log.js:3-11` | Medium / H |
| PERF-3 | The proxy buffers the whole origin response with no cap (`await resp.text()`), then serialises an envelope about 24% larger. On Workers a large response can exhaust the isolate. | `proxy.js:117`; hosts | High / H |
| PERF-4 | The monitor starts a probe every interval even while the last is pending; with slow targets probes pile up and can exhaust the browser's HTTP/1.1 connections to the local host (pool stall not reproduced). | `diagnostics.js:106`, `:117-130` | High / M |
| PERF-5 | Hosts never cancel the upstream fetch when the browser goes away. | `node-server.js:135`; `cloudflare.js:47` | Medium / H |
| PERF-6 | Worker CPU grows with response size (about 2.3 ms per MB for the envelope alone); the free plan's per-request CPU limit was not checked. | `proxy.js`; `cloudflare.js` | Medium / M |
| PERF-7 | Diagnostics rebuilds its whole tab on each probe, wiping a half-typed "Slow above" value or an open select. | `diagnostics.js:7` | Medium / H |
| PERF-8 | The Node host re-assembles the page on every GET (1.22 ms, 16 sync reads) and serves it uncompressed. | `node-server.js:107` | Low / H |
| PERF-9 | Google Fonts load through a blocking CSS `@import`, delaying first paint and stalling on networks that block Google. | `src/ui/styles.css:1` | Medium / H |
| PERF-10 | The mock server keeps every call, OAuth request, session, code and token forever. | `tests/fixtures/mock-mcp-server.mjs` | Low / H |

Artifact size is not a problem: the Worker is far below Cloudflare's script-size limits, and minification would break the zero-dependency build for about 10% of raw size. Add a size budget to the build self-check instead (PERF-11).

### C.3 Security, hardening and compliance

The browser holds live credentials for servers inside company networks, and the proxy fetches on its behalf from a public edge or a loopback port. The trust boundaries are: the page (and anything injected into it), `/proxy`, the target servers and authorization servers (untrusted), and the operator's configuration.

**Held privately.** Eight findings (SEC-P1 to SEC-P8) concern the proxy's target policy, the public Worker's default exposure, the reach of the Content-Security-Policy, where custom headers are sent and stored, scheme checks on discovered OAuth endpoints, the local server on a non-loopback address, and log redaction. Four are rated High, and one was reproduced. Their detail is held privately by the maintainer until the fork ships the fixes in Milestone 1; after that they go to upstream through private disclosure, per [`SECURITY.md`](../SECURITY.md), not through this page.

Public findings:

| ID | Finding | Where | Sev / Conf |
| :--- | :--- | :--- | :--- |
| SEC-1 | An invalid header name throws outside the try block: Node answers a generic 500, the Worker an uncaught exception. | `proxy.js:78-79`; `cloudflare.js:25-60` | Medium / H (reproduced) |
| SEC-2 | No response-size cap (PERF-3); the only bound is the timeout, up to 120 s times four attempts. | `proxy.js:117` | Medium / H |
| SEC-3 | The OAuth pop-up keeps an `opener` reference; no `Cross-Origin-Opener-Policy`. | `auth.js:330`, `:524` | Low / M |
| SEC-4 | Security headers differ between hosts (ARCH-4). | `cloudflare.js`; `node-server.js:35-37` | Low / H |
| SEC-5 | Fonts from a third party: every visitor's IP goes to Google, and the CSP carries two external origins (#71). | `styles.css:1`; `security-headers.js:17-18` | Low-Medium / H |
| SEC-6 | `esc()` does not escape `'`. No sink is single-quoted today, so it is latent. | `src/ui/js/escape.js:3` | Low / H |
| SEC-7 | A `null` property schema or a non-array `required` crashes rendering. | `views.js:125`, `:142` | Low / H |
| SEC-8 | The diagnostics export keeps the server URL's query string (which can hold an API key) and one unescaped table cell. | `diagnostics.js:375`, `:402`, `:414` | Low / H |
| SEC-9 | Supply chain: `npm run deploy` runs `npx wrangler` unpinned with deploy credentials; `make lint` runs `npx --yes markdownlint-cli2` unpinned; CI audits only the root lockfile; five workflows keep checkout credentials (`persist-credentials`). | `package.json:27`; `Makefile:69`; `ci.yml:31-32`; workflows | Medium / H |
| SEC-10 | No licence: a compliance blocker for any adopter (#51). | - | High / H |

Confirmed sound: every server-controlled string that reaches `innerHTML` goes through `esc()` (tool, resource and prompt names, descriptions, schemas, errors, trace, Log, diagnostics); OAuth checks `state`, `iss` (before `error`), issuer equality, PKCE S256 and an https-only authorization endpoint; `postMessage` checks origin and source; the code is removed from history. CodeQL's `js/request-forgery` on the proxy is accepted by design, but only with the Milestone 1 compensating controls in place; record the reason in an ADR when they land.

### C.4 Product, developer experience and observability

| ID | Finding | Sev / Conf |
| :--- | :--- | :--- |
| DX-1 | No operational telemetry: the Node host logs only startup and 500s, the Worker nothing; no request ID, no `/healthz`, no metrics, no tracing, no graceful shutdown. | High (for operators) / H |
| DX-2 | `ALLOWED_ORIGINS` holds hostnames, not origins, reads like a CORS setting, and nothing says when the proxy is unrestricted. | Medium / H |
| DX-3 | No operator configuration for timeout and retry ceilings, response cap, rate limit or bind token; `MAX_BODY_BYTES` and `MAX_TIMEOUT_MS` are hard-coded; `mcp-tester` has no `--help`. | Medium / H |
| DX-4 | Error clarity: an HTML answer from `/proxy` (an expired Cloudflare Access session) surfaces as a JSON parse error; the allowlist 403 does not name the variable to set. | Medium / H |
| DX-5 | Docs drift: "since 0.10.0" in the README and `AGENTS.md` under 0.0.x numbering; no threat-model or operator page. | Low / H |
| DX-6 | `make lint` needs `npm ci --prefix tools/lint` first and does not say so; no documented safe shared deployment. | Low / H |

Working well: `make help`, `make check` as the single gate, a clear message when the port is taken, the diagnostics timeline, and the OAuth trace.

---

## Part D. Delivery plan

Each milestone is one `feat/v<version>` branch and one release pull request, per `~/Code/AGENTS.md` section 3. Work lands as commits on that branch. Every item carries acceptance criteria in `docs/acceptance/v<version>/` and a test titled with each criterion's ID, and it passes `make check` and `npm run lint` with no new baseline entries. Fork first; each change then goes upstream through [A.2](#a2-when-upstream-acts).

The milestone numbers below propose moving roadmap items back by one to make room for stabilisation ([decision E3](#part-e-decisions-for-the-owner)). `ROADMAP.md` changes only once that is agreed.

### D.1 Milestone 1: stabilisation and security (0.0.2)

Goal: nothing a user or operator relies on is wrong, unbounded or exposed.

**1a. Proxy rewrite** (SEC-P1, SEC-P2, SEC-P7, PROTO-3, PROTO-4, PERF-3, PERF-5, SEC-1, SEC-2; complexity: `proxyMcp`)

Target design: `proxyMcp` becomes a short pipeline in `src/core/proxy.js`, each step unit-tested (sketch; names are proposals):

```js
export async function proxyMcp(payload, env) {
  const target = validateTarget(payload, env.policy);        // origin allowlist, scheme, IP policy
  if (target.error) return target.error;                      // { status: 400 | 403, json }
  const headers = buildOutHeaders(payload, target);           // RFC 9110 names, no CR/LF/NUL
  if (headers.error) return headers.error;
  const plan = { attempts: isIdempotent(payload) ? payload.retries + 1 : 1, signal: env.signal };
  return runAttempts(plan, (n) => attemptOnce(target, headers, payload, n, env));
}

async function attemptOnce(target, headers, payload, n, env) {
  const res = await fetchWithPolicy(target, headers, env);    // redirect: 'manual', re-checked hops
  const body = await readBounded(res, {                       // streams, stops at the cap or at the
    maxBytes: env.maxResponseBytes,                           // SSE event whose id matches
    sseMatchId: payload.body && payload.body.id,
  });
  return envelope(res, body, n);                              // diag.truncated, diag.redirects
}
```

- `readBounded` reads `res.body.getReader()`, counts bytes, cancels at `maxResponseBytes` (default 8 MB), and for `text/event-stream` returns as soon as an event carries the JSON-RPC response with the request's `id`.
- `isIdempotent`: `server/discover`, `*/list`, `ping`, `resources/read`, `prompts/get`; never `tools/call` after bytes were sent.
- `env.signal`: Node passes a controller aborted on `req.on('close')`; the Worker passes `request.signal` (verify support on workerd first).
- The `/proxy` envelope gains `diag.truncated`, `diag.bodyBytes` and `diag.redirects`. This is a contract change: update both hosts, `docs/ARCHITECTURE.md` and the tests together.
- Worker: a `try` / `catch` around `handleRequest`, and the fail-closed policy from the private findings.

Validation: proxy tests for a 20 MB stream (returns, `truncated`, RSS under about three times the cap), an SSE stream held open (returns in under 200 ms with a 2 s timeout), a redirect out of policy (403, second server not contacted), a bad header name (400), a timed-out `tools/call` (not retried), and a client abort (origin socket closed within 500 ms). A new mock scenario `sse-keepalive`. `proxyMcp` leaves the complexity baseline.

**1b. UI transport correctness** (PROTO-1, PROTO-2, PROTO-5 to PROTO-12, PERF-4, PERF-7)

- A spec-shaped `parseSSE` (CR, LF and CRLF; `data:` with or without a space; comments; multi-line data), returning `{ response, others }` with the response matched by `id`; every message logged.
- `listAll(method)` following `nextCursor` up to a page cap, with a UI note when the cap is hit; lists gated on the advertised capabilities.
- Session hygiene: accept `Mcp-Session-Id` only during connect; re-initialise on 404; `DELETE` on disconnect.
- Cancellation: `AbortController` in `proxyFetch`, a Cancel button, `notifications/cancelled` for in-flight requests.
- Monitor: self-scheduling `setTimeout` after each probe settles; never changes `state.serverUrl` while connected; a `ping` probe option; the Diagnostics controls rendered once and only `#diagBody` re-rendered.
- `isError: true` shown as an error; expired tokens warned about.

Validation: unit tests for each parser case, a two-page list, the capability gate, and session loss; an e2e test against `/hang` with a 5 s interval asserting at most one probe in flight for 30 s; an e2e test that a half-typed "Slow above" value survives two probes.

**1c. Log performance** (PERF-1, PERF-2; complexity: `renderLog`)

Headers only, bodies rendered on first expand, new entries inserted instead of re-rendering, entries keyed by a monotonic `seq`; the newest 50 entries keep full bodies and older ones a 64 KB preview with `truncated: true` (sketch):

```js
function addLog(entry) {
  entry.seq = ++state.logSeq;
  state.log.unshift(entry);
  if (state.log.length > LOG_MAX) state.log.pop();
  trimOldBodies(state.log, 50, 64 * 1024);
  if (state.activeTab !== 'log') return;
  var ct = document.getElementById('logList');
  ct.insertAdjacentHTML('afterbegin', renderLogHeader(entry));
  if (ct.children.length > LOG_MAX) ct.removeChild(ct.lastElementChild);
}
```

Validation: 1000 entries of 100 KB render in under 20 ms and under 1 MB of HTML; an expanded entry stays open after another request; stored bytes stay within the budget.

**1d. Security fixes** (SEC-P3 to SEC-P6, SEC-P8, SEC-3 to SEC-9)

Per the private findings, plus: one `baseHeaders()` in `security-headers.js` used by both hosts (`nosniff`, `Referrer-Policy`, `Cache-Control: no-store` on `/proxy`, a `Permissions-Policy`); `noopener` pop-ups with a `BroadcastChannel` hand-back; `esc` escapes `'`; defensive schema rendering; a redacted export URL; self-hosted WOFF2 subsets or system fonts (closes #71, drops both external CSP origins); `wrangler` pinned as a devDependency; `persist-credentials: false`; `npm audit` for `tools/lint` in CI.

Validation: one test per finding, written to fail first; an e2e test that no request leaves the page's origin; the CSP test updated.

**1e. Operator readiness** (DX-1 to DX-4, SEC-P6)

- `parseConfig(env)` validated at startup and printed as a summary: `MCP_TESTER_ALLOWED_TARGETS` (origin syntax; `ALLOWED_ORIGINS` kept as a deprecated alias for one release), timeout and retry ceilings, `MCP_TESTER_MAX_RESPONSE_BYTES`, `MCP_TESTER_TOKEN`.
- One structured JSON log line per `/proxy` call: `{ ts, reqId, targetOrigin, method, status, errorType, ttfbMs, totalMs, attempts, colo }`, never headers or bodies.
- `GET /healthz` returning `{ ok, version, policy }`; graceful SIGTERM with a drain window; Workers observability enabled in `wrangler.toml`.
- A clear message when `/proxy` answers HTML ("Cloudflare Access session expired?"), and 403s that name the variable to set.
- `docs/OPERATIONS.md`: deployment modes, trust boundaries, what the proxy can reach, log fields and retention.

Validation: host tests for one log line per call with no header values, `/healthz`, SIGTERM closing within the window, and config validation errors.

### D.2 Milestone 2: compliance and refactoring (0.0.3)

Roadmap item 4 (#8), rebuilt on an exchange recorder.

- **Exchange recorder** (ARCH-3): `sendBody` records `{ seq, request: { method, url, headers, body }, response: { status, headers, messages[] }, timing }` once, and the Log, compliance grading, and later replay and cURL (#17, #18) all read it. Request headers become visible in the Log.
- **Where grading runs**: an ADR choosing between an ES5 engine in the client and a `/compliance` endpoint on both hosts. The endpoint keeps the engine modern and testable and works for a future CLI; the client keeps the tool usable without a round trip. Recommendation: the endpoint.
- **Rules** (#10 to #12) keyed to spec sections and, where one exists, to the [official conformance suite](https://github.com/modelcontextprotocol/conformance) scenario ID, so results can be compared with `npx @modelcontextprotocol/conformance` output. Each rule has a mock scenario that breaks it.
- **Report panel** (#13) with evidence, cancel, and JSON, Markdown and JUnit export.
- **OAuth completion**: refresh tokens (#44) and automatic step-up (#45).
- **OpenTelemetry**: `traceparent` in `_meta` on every request (SEP-414), and the host's log line carries the trace ID.
- **Refactors** (C.1.5), worst first: `renderLatencyChart` into pure geometry, `suggestValue`, `auth.js` split, `computeStats`, the host route table. **ARCH-1**: lint the assembled client as one script with `no-undef` on, and move inline handlers to one delegated listener (`data-action`), which also removes `'unsafe-inline'` from `script-src` in favour of a build-time hash.
- **UI coverage**: load each `ORDER.json` file through `vm.Script` with its real filename, or collect Playwright coverage, so `src/ui/js` appears in coverage; then set a coverage floor in CI that may only rise.

Validation: every rule's scenario fails it; the complexity baseline shrinks by at least the five named offenders; coverage reports `src/ui/js`.

### D.3 Milestone 3: differentiating features (0.0.4 onward)

In the order that adds most for users of a testing tool:

1. **Diagnostics and workflow** (roadmap 5, #14 to #22): hints, flow diagram with Mermaid export, replay with diff, cURL and PowerShell export redacted by default, variables, collections, runner. Builds on the exchange recorder.
2. **2026-07-28 completeness**: MRTR (render `input_required`, collect inputs, retry with `inputResponses`); `subscriptions/listen` with per-type opt-in and `subscriptionId` tracking; a tasks-extension viewer (`tasks/get`, `tasks/update`); progress and `listChanged`; resource templates and completion; a raw request console; opt-in client roles answered by hand.
3. **Headless CLI and GitHub Action**: `mcp-tester check <url> --spec-version 2026-07-28 --junit out.xml --baseline expected.json`, reusing the core and the compliance endpoint, exit codes for CI gating. Zero runtime dependencies stays the rule for the app; the CLI may need an ADR if it wants any.
4. **Tool-description security lint**: flag hidden instructions, cross-server shadowing and suspicious Unicode in names and descriptions; pin a hash of each description per server and warn when it changes between sessions (rug-pull detection), mapped to the OWASP MCP Top 10.
5. **Discovery validation**: Server Card and registry `server.json` against their schemas, once the Server Card path is final.
6. **Docker image** (roadmap 6, #23 to #25): non-root, read-only file system, `HEALTHCHECK` on `/healthz`, `MCP_TESTER_TOKEN` required when bound to `0.0.0.0`, multi-arch on GHCR with an SBOM and provenance.

### D.4 Milestone 4: enterprise and platform

- EMA / ID-JAG sign-in, and DPoP labelled as not yet final in the spec.
- Corporate HTTP proxy and custom CA support in the Node host.
- An exportable, redacted session audit log.
- Signed desktop builds (roadmap 7, #26) and the agent playground (roadmap 8, #30), unchanged in scope.
- stdio through the local host, if decision E4 reopens ADR 0003.

### D.5 Standing validation for every milestone

- `make check`, `npm run lint` (baseline only shrinks), `make docs`, pre-commit, actionlint; CodeQL clean; the release preflight and the post-publish audit for each tag.
- Every acceptance criterion traced to a test that was seen to fail first.
- Pull-request descriptions audited against `~/Code/PR-TEMPLATE.md` on both repositories.

---

## Part E. Decisions for the owner

| # | Decision | Recommendation |
| :---: | :--- | :--- |
| E1 | Licence (#51), with upstream's author | Needed before anything ships; everything else in A.3 waits on it. |
| E2 | Commercial intent: whether this stays a community tool, or becomes the open core of something (for example a hosted compliance service, the CI Action, enterprise auth and audit logs). The pillars for investment and returns are not defined. | Decide before Milestone 3; it changes whether items 3 to 5 of D.3 and all of D.4 are built open or kept behind an interface. Nothing in Milestones 1 and 2 depends on it. |
| E3 | Insert stabilisation as 0.0.2 and move roadmap items 4 to 8 back one milestone | Yes: the compliance report needs the exchange recorder and the proxy fixes, and the security items should not wait. |
| E4 | stdio support, which ADR 0003 ruled out for a hosted tool | Revisit only for the local host, and only after the CLI exists. |
| E5 | Fonts (#71): self-host or use system fonts | System fonts: removes the only third-party request and a CSP exception. |
| E6 | Where compliance grading runs (D.2) | A `/compliance` endpoint on both hosts. |
