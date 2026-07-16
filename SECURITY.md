# Security & Responsible Use

VSF is a security research artifact for studying broken access control (BAC) at scale. It generates HTTP requests designed to *cross* trust boundaries between two accounts, which raises real ethical and legal risks if misused. Before running VSF against any system you do not own, please read the ethics discussion in our [IEEE S&P 2025 paper](./README.md#citation) — it documents the framing, safeguards, and IRB-equivalent review we used for the study this artifact accompanies.

## Reporting a vulnerability in VSF itself

If you find a security issue in this repository (e.g. the request-viewer app, the crawler, the analysis scripts), please **do not** open a public GitHub issue. Instead email:

- `saiid.elhajjchehade (AT) epfl.ch`

## Using VSF against third parties

VSF was designed and evaluated for the study described in our IEEE S&P 2025 paper. Anyone re-running it in the wild is responsible for keeping their experiments ethical and legal. Concretely, before you point VSF at any site you did not build:

1. **Only test targets you are authorized to test.** Written authorization (bug-bounty scope, penetration-testing contract, coordinated study with the site's operator, or a site you operate) is the baseline. A public site being reachable is not authorization.
2. **Use accounts you legitimately own.** VSF's differential design requires two accounts controlled by the researcher on the target site. Do not use accounts that belong to other users; do not sign up under false identity where that violates the ToS.
3. **Keep blast radius small.** Restrict `N_WORKERS`, throttle request rates, and prefer live-swap mode only where you can immediately abort. Never run against production systems whose availability affects users you have not warned.
4. **Do not persist or share other people's data.** VSF filters heuristically, not perfectly. If a probing request unexpectedly returns another user's data, stop, purge the response from your dataset, and report the finding to the site operator.
5. **Follow coordinated disclosure.** If you find a real BAC vulnerability in a third party's system, disclose it privately to the operator with a reasonable remediation window before publishing.
6. **Get ethics-board approval where required.** Academic use will typically require IRB / ethics-committee review. Ours is documented in the paper.

## What is *not* in scope

- We do not maintain VSF for offensive engagements. The tooling is published to make our paper reproducible and to enable further defensive research.

## Prior work

The framework builds on public tooling from CISPA's [login-security-landscape](https://github.com/cispa/login-security-landscape) and a fork of [Playwright](https://github.com/Saiid2001/playwright). Please respect the licenses and disclosure practices of those upstreams as well.
