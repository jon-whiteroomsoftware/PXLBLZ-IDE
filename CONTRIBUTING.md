# Contributing to PXLBLZ-IDE

PXLBLZ-IDE 2.0 is under active development on `main`. Bug reports and focused
changes are welcome.

## Local development

Use a Node.js version accepted by the `engines` field in `package.json`, then:

```bash
npm install
npm run dev
```

The Vite development server runs at `http://localhost:5174/PXLBLZ-IDE/` and
serves everything from one process: the public surfaces (Gallery, pattern
pages, in-app docs) plus the `/api/*` Worker and a local D1 database via the
Cloudflare Vite plugin. Studio and Shows need that local database migrated
and provisioned; without it, "Open in Studio" reports "Studio access
unavailable". Set up the full runtime with:

```bash
cp -n .dev.vars.example .dev.vars
npm run dev:main
```

`cp -n` keeps an existing `.dev.vars` untouched. `dev:main` applies
migrations, provisions local synthetic sign-in identities, and starts the
single-process server on `5174` when it is not already running. OAuth
credentials in `.dev.vars` are only needed to test real GitHub or
Google sign-in; see
[Cloudflare Operations](docs/reference/Cloudflare%20Operations.md) and
[`docs/agents/dev-runtime.md`](docs/agents/dev-runtime.md).

## Verification

Run the relevant checks before submitting a change:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

The pre-commit and pre-push hooks run the repository's required gates.

## Project documentation

- Read [`CONTEXT.md`](CONTEXT.md) for the project's domain language.
- Read the [PXLBLZ Technical Reference](docs/reference/PXLBLZ%20Technical%20Reference.md)
  for current architecture and implementation decisions.
- Read [Cloudflare Operations](docs/reference/Cloudflare%20Operations.md) for the
  authenticated local runtime, OAuth, D1 migrations, analytics, deployment,
  production verification, backups, and restores.
