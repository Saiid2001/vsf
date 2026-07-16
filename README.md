# 403 Forbidden? Ethically Evaluating Broken Access Control in the Wild

This repository contains the research artifact for our paper
[*403 Forbidden? Ethically Evaluating Broken Access Control in the Wild*](https://saidhajjchehade.com/publications) (IEEE S&P 2025).

## Goal

Testing API endpoints of live websites for broken access control (BAC) vulnerabilities has an ethical hazard: mutating parameters at random can expose the private resources of uninvolved users. VSF (Variable Swapping Framework) sidesteps this by running a *differential* experiment -- we control two accounts on the same site and swap parameters between them, so any unauthorized access only ever reveals data belonging to the researchers.

## Code Organization

- [`framework/`](./framework/) — Docker containers that run the VSF crawlers, request mirrors, and swap workers.
- [`request-viewer/`](./request-viewer/) — Local Next.js web app for reviewing swap candidates and results ([docs](./docs/ANALYSIS.md)).
- [`stats/`](./stats/) — Scripts that produce the tables and figures in the paper ([docs](./stats/README.md)).
- [`docs/`](./docs/) — Setup and workflow documentation.

## High-Level Overview

Running VSF against a site consists of four steps:

1. **Account creation.** Two accounts are created on the target site through the [Account Framework](https://github.com/cispa/login-security-landscape) (bundled as a submodule).
2. **Mirrored visit.** Both accounts visit the site in lockstep using our modified [Playwright fork](https://github.com/Saiid2001/playwright) — one browser leads, the other follows — and every request/response pair is recorded. Setup: [`docs/MIRRORING.md`](./docs/MIRRORING.md).
3. **Probing.** A separate VSF container generates *swapped* requests (parameters from account A replayed with account B's credentials) and dispatches them via an HTTP worker.
4. **Analysis.** VSF pre-filters swap candidates; the remaining candidates are inspected manually in the [Request Viewer](./request-viewer/). Setup: [`docs/ANALYSIS.md`](./docs/ANALYSIS.md).

## Setup

```bash
git clone --recurse-submodules https://github.com/Saiid2001/vsf
cd vsf/framework
python3 create_secrets.py       # generate random DB / VNC passwords
docker compose up --build -d
```

Then follow the per-step instructions in [`docs/`](./docs/).

### Playwright fork

VSF depends on a fork of Playwright ([`Saiid2001/playwright`](https://github.com/Saiid2001/playwright)) that adds the *leader/follower* transport used during mirrored visits — the leader browser broadcasts user actions and the follower replays them in a second session. The fork is vendored as the `framework/playwright` submodule; when clean upstream Playwright is used, mirrored recording will not work.

## Responsible Use

VSF is a security research tool. Please read [`SECURITY.md`](./SECURITY.md) before running it against any site you do not own — it covers target selection, authorization, and responsible disclosure.

## Contact

For questions about the tools or the paper, open an issue or email `saiid.elhajjchehade (AT) epfl.ch`.

## Citation

```bibtex
@inproceedings{saiid2025EthicBAC,
  author    = {El Hajj Chehade, Saiid and Hantke, Florian and Stock, Ben},
  booktitle = {IEEE Symposium on Security and Privacy},
  title     = {{403 Forbidden? Ethically Evaluating Broken Access Control in the Wild}},
  year      = {2025},
}
```

A machine-readable version is available in [`CITATION.cff`](./CITATION.cff).

## License

MIT — see [`LICENSE`](./LICENSE).
