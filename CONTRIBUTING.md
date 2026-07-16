# Contributing to VSF

Thanks for your interest in VSF. This is primarily a research artifact accompanying an IEEE S&P 2025 paper, so we prioritise contributions that preserve reproducibility of the published results. Bug fixes, documentation improvements, and portability patches are especially welcome; large feature additions may be redirected to a fork.

Before contributing anything that involves running VSF against a third-party site, please read [`SECURITY.md`](./SECURITY.md).

## Filing issues

- **Bugs.** Include the subproject (`framework`, `request-viewer`, `stats`), your OS, Docker / Node / Python versions, and the minimum steps to reproduce. Redact target-site names if the bug involves real traffic.
- **Security-sensitive issues.** Do *not* open a public issue -- see [`SECURITY.md`](./SECURITY.md) for the private reporting channel.
- **Questions.** Open a discussion or email the contact listed in the root README rather than filing an issue.

## Pull requests

1. Fork the repo and create a feature branch off `main`.
2. Keep changes focused. One PR per logical change.
3. Match existing style. TypeScript is linted with `next lint` / ESLint in `request-viewer` and the crawler; Python code should stay compatible with 3.10.
4. If you touch the crawler or analysis scripts, verify a small end-to-end run still succeeds — the existing test scripts under `framework/crawler/` (`npm run test:http-browser`, `npm run test:req-template`) are a good smoke check.
5. Update the relevant `README.md` / `docs/` file when behavior changes.
6. Sign off your commits (`git commit -s`) so we can accept them under the DCO.

## Submodules

`framework/playwright` and `framework/AccountFramework` are git submodules. Changes to those repositories should be proposed against the respective upstreams first; then update the submodule pointer here in a separate PR.

## Code of conduct

By participating, you agree to abide by the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md).
