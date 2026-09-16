# Browser authentication isolation

The in-app browser connected successfully and advertised viewport/visibility browser capabilities plus page-assets/WebMCP tab capabilities. It exposed no supported separate-context or synthetic-session-cookie ingress. Navigation to the isolated issue runtime inherited an existing signed-in account whose user was absent from that isolated D1 database. The first settings persistence attempt produced:

```
D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)
```

The observed error originated at `src/cloudflare/settings.ts:31`, called by the settings PUT handler. That interrupted navigation is not acceptance evidence. No account cookies/session stores were inspected or changed, no read-only evaluation was used to mutate authentication, and the diagnostic tab was closed.

The coordinator authorized repository Playwright verification in a separate synthetic context. It exercises the same actual issue Worker, D1 store, native route, history and renderer; browser-context isolation differs from the connected in-app browser. Only the named synthetic thirty-second fixture is seeded. Existing user cookies and stable main runtime remain unchanged.

The committed source diagnostic completed all eight durable edits/history writes, provider reload, native artifact qualification and cold reopen. Fast and Precise two-frame Stage captures at23000ms had no failures. At1024 and390 widths the explicit scope→time keyboard path succeeded, controls had no horizontal overflow and browser error lists were empty. Final committed captures must bind the final rebased code/metadata identity; this diagnostic is adjacent evidence only.
