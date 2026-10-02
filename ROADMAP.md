# Roadmap

What MCP Tester is building next, in the agreed order. Items 1 to 3 have shipped; the rest are planned, in the order of the table. Items 9 to 14 were added from the audit in the [implementation plan](docs/PLAN.md), which also lists every release's issues ([release train](docs/PLAN.md#d0-release-train)). Each planned item is an epic with its own issues and acceptance criteria; the issues are tracked in the [sebastienrousseau/comprehensive-mcp-tester](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues) fork, and every criterion becomes a regression test before its issue closes (see [`CONTRIBUTING.md`](CONTRIBUTING.md#acceptance-criteria-and-regression-tests)). How each item gets built, the audit behind it, and where to resume are in the [implementation plan](docs/PLAN.md).

Milestone versions below are the fork's plan for when each item lands, one theme per +0.0.1 release; each is a [GitHub milestone](https://github.com/sebastienrousseau/comprehensive-mcp-tester/milestones) with its story and exit criteria. They are targets, not promises. The first release is 0.0.1; the 0.8.0 to 0.10.0 shown for items 1 to 3 are pre-release numbers from before releases started, never tagged.

| # | Item | Status | Epic | Milestone |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Repository and shared core | Shipped | - | 0.8.0 |
| 2 | Both protocol eras: 2026-07-28 stateless and the `initialize` handshake | Shipped | - | 0.9.0 |
| 3 | Authentication | Shipped | - | 0.10.0 |
| 9 | Stabilisation and security: safe proxy, correct client, safe to share, operable | Planned | [#81](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/81) | 0.0.2 to 0.0.5 |
| 4 | Spec compliance check | In progress | [#8](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/8) | 0.0.6 to 0.0.7 |
| 10 | Maintainable client | Planned | - | 0.0.8 |
| 5 | Log-driven hints, flow diagram, replay, cURL, variables, collections | Planned | [#19](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/19) | 0.0.9 to 0.0.11 |
| 11 | Protocol 2026-07-28 completeness | Planned | [#110](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/110) | 0.0.12 |
| 12 | Compliance checks in CI | Planned | [#115](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/115) | 0.0.13 |
| 13 | Trust checks for tool descriptions | Planned | [#116](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/116) | 0.0.14 |
| 6 | Docker image for the local server | Planned | [#23](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/23) | 0.0.15 |
| 14 | Enterprise: managed authorization, corporate proxy, audit log | Planned | - | 0.0.16 |
| 7 | Signed Mac and Windows builds | Planned | [#26](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/26) | 0.0.17 |
| 8 | Agent playground | Planned | [#30](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/30) | 0.0.18 |

Supporting every item, the **acceptance-criteria regression suite** ([#3](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/3), milestone 0.0.1): the traceability check ([#4](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/4)), the mock server's scenario registry ([#5](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/5)), mandatory e2e with JUnit reports ([#6](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/6)) and the version check ([#7](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/7)) are done. The epic stays open until its remaining criteria pass.

---

## 1. Repository and shared core (shipped, 0.8.0)

One codebase served two ways: a Cloudflare Worker and a local Node server. A platform-free proxy core in `src/core/`, thin host adapters, and a UI assembled into one self-contained HTML page. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 2. Both protocol eras (shipped, 0.9.0)

The client speaks spec 2026-07-28, which is stateless: `server/discover`, per-request `_meta`, and the `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name` / `Mcp-Param-*` headers. It falls back to the `initialize` handshake (offering 2025-11-25) when the server answers discover with an HTTP error that is not a recognised modern error (-32020, -32021, -32022). A transport failure does not trigger the fallback. The expected fallback error is logged but not counted as a failure in diagnostics. The mock server serves `/modern` (modern only) and `/dual` (both eras); its other paths stay legacy.

## 3. Authentication (shipped, 0.10.0)

Per spec 2026-07-28, in `src/ui/js/auth.js`:

- 401/403 challenge, then protected resource metadata (header URL, then path-inserted and root well-known), then authorization server metadata (RFC 8414 / OIDC priority order; the issuer must match), then registration, then authorization code with PKCE, the `iss` check and the token, with `resource` on both requests. Each step goes to the trace and the Log.
- Registration priority: an entered client ID (bound to the first issuer it is used with), then CIMD (only on a public HTTPS origin, and only when the authorization server sets `client_id_metadata_document_supported`), then DCR (deprecated; `application_type` is `native` on loopback and `web` otherwise; cached per issuer), then ask the user.
- Pop-up first. If pop-ups are blocked, the page redirects and resumes on `/oauth/callback`; both hosts serve the UI there.
- Manual modes: bearer, API-key header, client credentials (secret via Basic auth unless the authorization server only allows `client_secret_post`).

Not done yet, and planned for 0.0.7 with item 4: refresh-token use ([#44](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/44)) and automatic step-up on 403 `insufficient_scope` ([#45](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/45); today it is detected and shown, and you sign in again by hand). Also not done: `offline_access` and `private_key_jwt`.

## 4. Spec compliance check (in progress)

Rule-based pass / warn / fail checks, keyed to the protocol version the server claims, each citing the spec section it enforces and each with a matching failure mode in the mock server. Examples: `resultType` on every result; `ttlMs` and `cacheScope` on list results; a bogus version answered with 400, -32022 and a `supported` list; an unknown method answered with 404 and -32601; deterministic `tools/list` order; tool schemas that are valid JSON Schema 2020-12 with resolvable `$ref`s; valid `x-mcp-header` annotations; `serverInfo` in the result `_meta`; deprecated features still advertised (Roots, Sampling, Logging, HTTP+SSE).

| Issue | Part | Status |
| :--- | :--- | :--- |
| [#9](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/9) | Platform-free rule engine and catalogue format | Done |
| [#10](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/10) | JSON-RPC, transport and lifecycle rules (legacy and stateless) | Open |
| [#11](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/11) | Capability, tools, resources, prompts and pagination rules | Open |
| [#12](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/12) | Authorization rules built on the OAuth discovery trace | Open |
| [#13](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/13) | Report panel with evidence, cancel, and JSON / Markdown export | Open |

## 5. Log-driven hints and workflow (planned)

Rules first, not AI:

- Legacy servers: 400 "no valid session" suggests initialising again; 404 on a live session suggests reconnecting.
- Modern servers: -32020 shows the mismatched header; -32022 offers the listed versions.
- Both: 406 points at `Accept`; 401 at signing in; -32602 jumps to the field.

Also a connection flow diagram: an inline SVG sequence diagram (discover or initialize, then the auth steps, list and call) in the three diagnostic states, with **Copy as Mermaid** so it pastes into GitHub issues and Markdown, where it renders natively. Mermaid.js is not bundled: it is large, and loading it from a CDN would break offline use inside company networks. Then replay, edit and resend, copy as cURL, `{{variables}}` and collections. It stays MCP-shaped, not a general REST client.

Issues: hints [#14](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/14), flow diagram [#15](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/15), Mermaid export [#16](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/16), replay [#17](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/17), copy as cURL [#18](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/18), variables [#20](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/20), collections [#21](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/21), collection runner [#22](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/22).

Not yet implemented from 2026-07-28: MRTR (`resultType: "input_required"` answered with an `inputResponses` retry), `subscriptions/listen`, per-request `logLevel`, and the tasks extension. They are item 11.

## 6. Docker image for the local server (planned)

A minimal, non-root image of the Node host ([#24](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/24)), built, scanned and published multi-arch to GHCR with an SBOM and provenance ([#25](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/25)). The container binds `0.0.0.0`, so `MCP_TESTER_ALLOWED_HOSTS` matters.

## 7. Signed Mac and Windows builds (planned)

A desktop adapter, preferring Tauri or a small single binary over Electron, decided in an ADR first ([#27](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/27)). Code signing is the real blocker: an Apple Developer ID with notarisation ([#28](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/28)) and a Windows signing certificate ([#29](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/29)).

## 8. Agent playground (planned)

An OpenAI-compatible endpoint (Ollama on port 11434, LM Studio on 1234) acting as an MCP host, framed as a test of tool-description quality with small (around 8B) models. It belongs mainly in the local build. Issues: local model connection [#31](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/31) (needs an ADR), the chat loop [#32](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/32), an approval gate for model-initiated tool calls [#33](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/33), and description evaluation with repeat runs and A/B comparison [#34](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/34).

## 9. Stabilisation and security (planned, 0.0.2 to 0.0.5)

Four releases that make what exists correct, bounded and safe before new features land, from the 2026-09-30 audit ([`docs/PLAN.md`](docs/PLAN.md), Part C): **0.0.2 safe proxy** (streamed and capped responses, SSE answers returned on arrival, safe retries, cancellation, input validation, an explicit target policy and operator configuration), **0.0.3 correct client** (SSE parsing, pagination, capability gating, legacy sessions, a non-overlapping monitor, a fast Log, a version picker), **0.0.4 safe to share** (credentials and headers kept with their server and out of logs, shared security headers, no third-party fonts, pinned tooling) and **0.0.5 operable** (structured logs, `/healthz`, graceful shutdown, clear errors, an operations guide). Epic [#81](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/81).

## 10. Maintainable client (planned, 0.0.8)

The worst complexity offenders refactored ([#106](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/106)), the assembled client linted with `no-undef` and delegated events so the CSP drops `'unsafe-inline'` for scripts ([#107](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/107)), connection state behind named transitions ([#108](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/108)), and coverage that includes the client with a floor ([#109](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/109)).

## 11. Protocol 2026-07-28 completeness (planned, 0.0.12)

MRTR ([#111](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/111)), `subscriptions/listen` ([#112](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/112)), the tasks extension and progress ([#113](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/113)), and resource templates, completion, a raw request console and opt-in client roles ([#114](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/114)). Epic [#110](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/110). stdio stays out of scope unless ADR 0003 is revisited for the local host ([#120](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/120)).

## 12. Compliance checks in CI (planned, 0.0.13)

A headless command and a GitHub Action that run the compliance check with a baseline of expected failures, JUnit output and exit codes for gating ([#115](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/115)).

## 13. Trust checks for tool descriptions (planned, 0.0.14)

Hidden instructions, cross-server shadowing and suspicious Unicode in tool, prompt and resource descriptions, and a warning when a description changes between sessions ([#116](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/116)), mapped to the OWASP MCP Top 10.

## 14. Enterprise (planned, 0.0.16)

Enterprise-managed authorization (ID-JAG) and DPoP, labelled not final in the spec ([#117](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/117)); a corporate HTTP proxy and custom CA for the local server ([#118](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/118)); and an exportable, redacted session audit log ([#119](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/119)).
