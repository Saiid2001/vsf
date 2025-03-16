# 403 Forbidden? Ethically Evaluating Broken Access Control in the Wild

This repository contains the code of our paper "403 Forbidden? Ethically Evaluating Broken Access Control in the Wild" IEEE S&P 2025.

> [!NOTE]
> This is a work in progress. The instructions below are not yet complete. TODO: Update instructions, clean up code, and add more documentation.


## Goal
The goal of this project is testing API endpoints for live websites to find broken access control vulnerabilities. Varying the parameters randomly might expose unauthorized resources of random internet users, which is an ethical violation of their privacy. So, we design a differential experiment by controlling two accounts and trying to access the resources of one account using the other account's credentials.

## Code Organization
The code is organized as follows:
- [`/framework`](./framework/): Contains the code to deploy the Variable Swapping Framework (VSF) Docker containers.
- [`/request-viewer`](./request-viewer/): A simple local web application interface to view and analyze the requests and responses collected by the VSF.
- [`/stats`](./stats/): Contains the code to generate statistics from the collected data that appear in the paper.
- [`/docs`](./docs/): Contains the documentation of the project, instructions to set up the VSF, and the analysis tool.

## High-Level Overview
Testing websites with the VSF consists of the following high-level steps:

1. **Creating user accounts**: We create two user accounts for each website. For this, we repurpose the [Account Framework](https://github.com/cispa/login-security-landscape).
<!-- You can find the instructions [here](docs/REGISTRATION.md). -->

2. **Mirrored website Visit**: We visit each website with both account, perform the same actions, and record the request/response pairs. We modify [Playwright](https://github.com/Saiid2001/playwright) to be able to transmit actions between two browsers (a leader and a follower).
You can find the instructions [here](docs/MIRRORING.md).

3. **Generating & Sending Probing Requests**: A separate VSF container automatically generates probing requests by swapping the parameters of the requests collected in the previous step. An HTTP worker sends these requests to the website.

3. **Analyzing candidates**: We analyze the request/response pairs to find candidates that might be used to access unauthorized resources. VSF pre-filters the candidates and then we manually inspect the remaining candidates with a [Request Viewer](./request-viewer/) local web-app.
We offer a graphical interface for manual inspection of the swap candidates. You can find the instructions to set it up [here](docs/ANALYSIS.md).

## Setup
Run `git clone https://github.com/Saiid2001/ethic-bac --recurse-submodules`, then follow the instructions in the respective subproject folders.

## Contact

If there are questions about our tools or paper, please either file an issue or contact `saiid.elhajjchehade (AT) epfl.ch`

## Research Paper

<!-- The paper is available at the IEEE Computer Society Digital Library.  -->
You can cite our work with the following BibTeX entry:

```bibtex
@inproceedings{saiid2025EthicBAC,
 author = {El Hajj Chehade, Saiid and Hantke, Florian and Stock, Ben},
 booktitle = {IEEE Symposium on Security and Privacy},
 title = {{403 Forbidden? Ethically Evaluating Broken Access Control in the Wild}},
 year = {2024},
}
```
