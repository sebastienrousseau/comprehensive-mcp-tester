# Packaging MCP Tester

For anyone repackaging MCP Tester: a distribution, an internal software catalogue, or a platform team preparing it for a company network. Everything here is checked against the repository; where something is not settled yet, it says so.

## Before you start: there is no licence yet

The project has no licence ([#51](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/51)), so the code is "all rights reserved" by its author and cannot be redistributed. Packaging for your own evaluation is fine; publishing a package is not, until the author chooses a licence.

## What there is to package

MCP Tester ships in two shapes from one codebase ([architecture](ARCHITECTURE.md)):

| Shape | Files | Needs at runtime |
| :--- | :--- | :--- |
| Cloudflare Worker | `worker.js` (dashboard paste) or `worker.mjs` (Wrangler), from a [release](https://github.com/sebastienrousseau/comprehensive-mcp-tester/releases) or `make build` | Cloudflare Workers; nothing else |
| Local server | `src/` and `package.json`, installed by `make install`; the UI is assembled from `src/ui/` at request time | Node.js 22 or later; nothing else |

`index.html` is the same UI as a single static file, useful for inspection; on its own it cannot reach MCP servers, because the page talks to them through its host's `/proxy`.

## Toolchain

Node.js 22 or later. The floor is the oldest Node.js LTS line still in maintenance, and rises only in a release that says so in the changelog ([policy](POLICIES.md#minimum-toolchain)). No distribution's packaged Node.js is claimed or tested.

## Dependencies

- **Runtime: none.** The local server uses Node's standard library only, and the Worker bundles contain no third-party code. Each release's CycloneDX SBOM lists zero components for that reason.
- **Development: Playwright only**, for the end-to-end tests, pinned in `package-lock.json`. Nothing else is installed by `npm ci`.
- **Documentation: MkDocs**, installed with pip and pinned by hash in `docs/manual/requirements.txt`, only to build the manual. A package never needs it.

## Building offline

`make build` (or `npm run build`) needs Node.js and nothing else: no network, no `npm install`. It writes `dist/index.html`, `dist/worker.js` and `dist/worker.mjs`, and checks its own output before writing.

**The build is reproducible.** The same commit produces byte-identical files on Linux and macOS, with Node 22 and 24, from any directory; CI rebuilds from a fresh export on every push and fails if the files differ. This covers the three built files. The SBOM does not qualify: `npm sbom` gives each document a new serial number.

## Installing the local server

```sh
make install PREFIX=/usr DESTDIR="$pkgdir"   # usual staged-install variables
```

| Variable | Default | What goes there |
| :--- | :--- | :--- |
| `PREFIX` | `/usr/local` | Base of the installed paths |
| `BINDIR` | `$(PREFIX)/bin` | `mcp-tester`, a small shell wrapper that runs `node` on the installed server |
| `LIBDIR` | `$(PREFIX)/lib/mcp-tester` | `src/` and `package.json` |
| `DESTDIR` | empty | Staging root; the wrapper still points at `PREFIX`, not at the staging directory |

The server reads `PORT`, `HOST`, `ALLOWED_ORIGINS` and `MCP_TESTER_ALLOWED_HOSTS` ([configuration](../README.md#configuration)). It binds `127.0.0.1` by default. A package that binds another address, such as a container, must set `MCP_TESTER_ALLOWED_HOSTS` to the hostnames it is served under, because the server rejects unknown `Host` headers to block DNS rebinding.

## Testing offline

With no dependencies installed, `node --test` runs every suite except the browser end-to-end tests, which skip with a message; nothing needs the network. To run those too, install Playwright (`npm ci`) and point `PW_CHROMIUM_PATH` at a Chromium build, or run `npx playwright install chromium`.

## Verifying what you package

Each release is published from a signed tag by `.github/workflows/release.yml`, and carries `SHA256SUMS`, a CycloneDX SBOM, and Sigstore-signed build provenance for every file:

```sh
sha256sum --check SHA256SUMS
gh attestation verify worker.js --repo sebastienrousseau/comprehensive-mcp-tester
```

The tag's signature is verified by GitHub against the maintainer's registered SSH signing key and shown as **Verified** on the tag; the release workflow refuses to publish a tag GitHub does not verify.

## Not provided

- **Container image:** planned as roadmap item 6 ([#23](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/23)): a minimal, non-root image of the local server ([#24](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/24)), published multi-arch to GHCR with an SBOM and provenance ([#25](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/25)).
- **Native desktop builds:** roadmap item 7 ([#26](https://github.com/sebastienrousseau/comprehensive-mcp-tester/issues/26)).
- **deb, rpm, AUR, Homebrew and Nix packages:** not planned. The product is a web page plus a small Node server run from a checkout, a Worker or `make install`; revisit alongside the desktop builds.
- **A C library interface:** not applicable; this is an application, not a library.
