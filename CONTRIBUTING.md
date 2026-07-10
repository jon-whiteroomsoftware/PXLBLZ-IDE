# Contributing to PXLBLZ-IDE

PXLBLZ-IDE 2.0 is under active development on `main`. Bug reports and focused
changes are welcome.

## Local development

Use a Node.js version accepted by the `engines` field in `package.json`, then:

```bash
npm install
npm run dev
```

The Vite development server runs at `http://localhost:5174/`.

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
