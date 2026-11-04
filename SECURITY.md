# Security Policy

## Supported versions

FlyWallets is under active development. Security fixes are applied to the `main` branch only.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub security advisories:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** (or open
   <https://github.com/andreagalassi-dev/FlyWallets-website/security/advisories/new>).
3. Describe the issue, the affected component (backend, frontend, database schema), the steps to reproduce and the potential impact.

You can expect an acknowledgement within a few days. Once a fix is available we will coordinate disclosure with you.

## Scope notes

- Never include real credentials, tokens or personal financial data in a report.
- If you accidentally exposed a secret (JWT secrets, database password, SMTP/AI API key) in a fork or commit, rotate it immediately.
- Known limitations are listed in the [Security notes](README.md#security-notes) and [Roadmap and known limits](README.md#roadmap-and-known-limits) sections of the README (for example: Row-Level Security is only enforced when `DATABASE_APP_URL` points to the restricted role, and rate limits are kept in process memory). Reports about documented limitations are still welcome if you can show a concrete exploit.
