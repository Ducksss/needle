<!-- Structure follows othneildrew/Best-README-Template. -->
<a id="readme-top"></a>

<!--
Dynamic shields (contributors, stars, issues) need a public repo. These static
shields state facts that hold while the repo is private.
-->
[![Autonomous SG 2026][event-shield]][event-url]
[![Airbus Challenge #1][challenge-shield]][challenge-url]
[![ESA Kelvins CDM data][data-shield]][data-url]
[![Critical recall 0.898 at 2 days][recall-shield]][results-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/Ducksss/needle">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/brand/needle-mark-dark.svg">
      <img src="docs/brand/needle-mark.svg" alt="Needle logo" width="96" height="96">
    </picture>
  </a>

  <h3 align="center">Needle</h3>

  <p align="center">
    Pc-first conjunction triage for satellite operators.
    <br />
    Rank every conjunction message by the decision it needs, then plan the burn.
    <br />
    <a href="contracts/README.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="#usage">View Demo</a>
    &middot;
    <a href="https://github.com/Ducksss/needle/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/Ducksss/needle/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#results">Results</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

[![Needle cover][product-cover]](#about-the-project)

Satellite operators receive conjunction data messages (CDMs) every few hours for every close approach. Most of these alerts never need action, but each one has to be checked. Needle reads the CDM telemetry, computes the collision probability (Pc), and sorts each event into the brief's tiers. It then ranks open events by the decision they need and its deadline, and plans an avoidance burn when Pc reaches the action threshold.

What it adds over a distance alarm:

* **Pc first, distance second.** In the ESA test set, 186 events are Critical by the brief's rules. Only 23 of them reach Pc ≥ 1e-4; the other 163 are flagged by miss distance alone, and two-thirds of those have Pc below 1e-6.
* **A deadline for every decision.** Waiting costs Δv. The cost-of-waiting curve sets the last moment the cheapest burn still fits the Δv budget. Across 119 escalation messages, waiting 24 h raises the required Δv by a median of 1.25×.
* **A burn plan the operator can check.** For each escalation, Needle searches thrust direction and Δv with Clohessy-Wiltshire relative motion. It shows the predicted miss and Pc after the burn, and lists the checks it did not run (drag, J2, execution error, re-screening).
* **A replay over time.** 280 real ESA CDM histories play on a 21-day calendar of 8 h screening runs. Events move through Decide, Watch and Passed instead of being flagged all at once. High-risk events are over-sampled about 7×, and the console says so.

[![Needle console][product-screenshot]](#usage)

| Tier | Rule (from the brief) |
|---|---|
| Safe | Pc < 1e-6 and miss distance > 5 km |
| Elevated | 1e-6 ≤ Pc < 1e-4, or miss distance 1 to 5 km |
| Critical (manoeuvre required) | Pc ≥ 1e-4 (`risk` ≥ -4), or miss distance < 1 km |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Results

The task, as set by the updated brief: predict each event's **final** tier from messages at least 2 days before closest approach, scored on a held-out 20% of train events. The labels come from `challenge1_event_labels.xlsx`. Full method: [`ml/METHODOLOGY.md`](ml/METHODOLOGY.md).

| On 2,389 held-out train events (167 end Critical) | Critical caught | Missed | False alarms | Critical recall | Accuracy |
|---|---|---|---|---|---|
| Persistence: latest tier 2+ days out | 149 | 18 | 25 | 0.892 | 0.947 |
| Needle event model alone | 146 | 21 | 25 | 0.874 | 0.948 |
| **Needle shipped rule: model or persistence** | **150** | **17** | **33** | **0.898** | **0.947** |

About 9 in 10 events that end Critical are already flagged 2 days out. All 18 events that persistence misses turn Critical because their final miss distance drops under 1 km. The model does not beat the baseline on recall; its value is a calibrated probability for every call. On the harder subset, whose final message falls inside the last 2 days, the shipped rule catches 99 of 116 (0.853).

The physics Pc model (encounter plane, full covariance, object sizes) reproduces ESA's own Pc within 0.02 orders of magnitude for 20 of the 23 Pc-confirmed test events.

Files: [`artifacts/test_event_predictions.csv`](artifacts/test_event_predictions.csv) (one row per test event, with probabilities) and [`artifacts/event_metrics.json`](artifacts/event_metrics.json). The earlier per-message scores on test rows are kept in the methodology's appendix; they are not the task's score.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![Python][Python-badge]][Python-url]
* [![scikit-learn][sklearn-badge]][sklearn-url]
* [![pandas][pandas-badge]][pandas-url]
* [![FastAPI][FastAPI-badge]][FastAPI-url]
* [![React][React-badge]][React-url]
* [![TypeScript][TypeScript-badge]][TypeScript-url]
* [![Vite][Vite-badge]][Vite-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

The repo has three segments that meet only through [`contracts/README.md`](contracts/README.md) and the files in [`artifacts/`](artifacts/).

| Folder | What it holds |
|---|---|
| [`ml/`](ml/README.md) | Python package `needle_ml`: physics Pc, burn planner, tier classifier, artifact builders |
| [`api/`](api/README.md) | FastAPI service that serves the artifacts and computes Pc and burn options on demand |
| [`frontend/`](frontend/README.md) | React + TypeScript console: queue, workspace, replay timeline, 24 h warnings, approval modal |
| [`contracts/`](contracts/README.md) | Data shapes and API endpoints every segment codes against |
| [`artifacts/`](artifacts/) | Built JSON and CSV outputs |
| [`docs/brand/`](docs/brand/README.md) | Logo, lockups, cover and brand guide |

### Prerequisites

* Python 3.11 or newer, with [uv](https://docs.astral.sh/uv/)
  ```sh
  brew install uv
  ```
* Node.js 20 or newer, with npm
* The ESA Kelvins Collision Avoidance Challenge CSVs (`train_data.csv`, `test_data.csv`). They are not in this repo.

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/Ducksss/needle.git
   cd needle
   ```
2. Put the ESA CSVs in `data/`, or point at them
   ```sh
   export NEEDLE_DATA_DIR=/path/to/esa-csvs
   ```
3. Rebuild the artifacts (optional; built copies are committed; about 90 s)
   ```sh
   cd ml && uv run needle-ml build
   ```
4. Start the API. Installing `ml/` into it enables the on-demand Pc and burn endpoints.
   ```sh
   cd api && uv pip install -e ../ml && uv run uvicorn needle_api.main:app --reload --port 8000
   ```
5. Start the console
   ```sh
   cd frontend && npm install && npm run sync-data && npm run dev
   ```

Each segment's README lists its full commands and tests.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->
## Usage

**In the console**

1. Press **Play**, or drag the screening-run slider at the bottom. New CDMs arrive every 8 h of replay time.
2. Read the **Next decision** bar: the event with the closest deadline, and the Δv it needs now.
3. Open it in the workspace. Check the message history, where the object passes, and what waiting costs.
4. Pick an option and **Review and approve**. The modal shows the burn plan, the predicted outcome and the gate checks.
5. Hover over any bar, pill, tick or chip to see what it means.

**From the API**

```sh
curl "http://localhost:8000/api/predictions?tier=Critical&limit=5"
curl http://localhost:8000/api/metrics
```

**The final-tier predictions**

`artifacts/test_event_predictions.csv` has one row per test event: its latest tier, P(Safe), P(Elevated), P(Critical), and the predicted final tier. Test has no final outcomes, so these are demo predictions. The scores come from held-out train events.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->
## Roadmap

- [x] Pc model checked against ESA's own Pc
- [x] Burn planner checked against two-body propagation
- [x] Scored per-row tier predictions, independently verified
- [x] Replay console design (A3+) with hover explanations
- [x] Repo scaffold, data contract and brand
- [x] `needle_ml` package with one-command artifact build ([#2](https://github.com/Ducksss/needle/pull/2))
- [x] API service ([#1](https://github.com/Ducksss/needle/pull/1))
- [ ] React console with the Next 24 h warnings view
- [ ] Hosted demo
- [ ] Pc dilution check with a "request tracking" action
- [ ] Wait-or-burn advice from historical downgrade rates
- [ ] Real approach trajectory in place of the illustrative globe

See the [open issues](https://github.com/Ducksss/needle/issues) for proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

1. Read [`AGENTS.md`](AGENTS.md) and [`contracts/README.md`](contracts/README.md)
2. Create a branch (`git checkout -b PinZheng/<topic>`)
3. Stay inside one segment folder; propose contract changes in their own pull request
4. Commit as `<area>(<type>): <short summary>`, for example `frontend(feat): add 24 h warnings panel`
5. Open a pull request using the template, with your validation commands and, for UI changes, screenshots

Never commit the ESA CSVs.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

No license yet. All rights reserved until a `LICENSE` file is added. The ESA dataset has its own terms; this repo does not redistribute it.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

Chai Pin Zheng · [GitHub](https://github.com/Ducksss)

Project Link: [https://github.com/Ducksss/needle](https://github.com/Ducksss/needle)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [ESA Kelvins Collision Avoidance Challenge](https://kelvins.esa.int/collision-avoidance-challenge/) for the CDM dataset
* [Spacecraft Collision Avoidance Challenge: design and results of a machine learning competition](https://arxiv.org/abs/2008.03069) (arXiv:2008.03069)
* NASA Spacecraft Conjunction Assessment and Collision Avoidance Best Practices Handbook (NASA/SP-20205011318), the source of the brief's tier rules
* Autonomous SG 2026, run by Acacia Hackathon Society and NUS Product Club, and Airbus for the challenge
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)
* [Shields.io](https://shields.io)
* [Manrope](https://fonts.google.com/specimen/Manrope) and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[event-shield]: https://img.shields.io/badge/Autonomous_SG-2026-0F172A?style=for-the-badge
[event-url]: https://github.com/Ducksss/needle
[challenge-shield]: https://img.shields.io/badge/Airbus-Challenge_%231-0F766E?style=for-the-badge
[challenge-url]: https://github.com/Ducksss/needle#about-the-project
[data-shield]: https://img.shields.io/badge/data-ESA_Kelvins_CDM-475569?style=for-the-badge
[data-url]: https://kelvins.esa.int/collision-avoidance-challenge/
[recall-shield]: https://img.shields.io/badge/Critical_recall_2_days_out-0.898-F97316?style=for-the-badge
[results-url]: #results
[product-cover]: docs/brand/needle-cover.png
[product-screenshot]: docs/images/console-a3plus.png
[Python-badge]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[Python-url]: https://www.python.org/
[sklearn-badge]: https://img.shields.io/badge/scikit--learn-F7931E?style=for-the-badge&logo=scikitlearn&logoColor=white
[sklearn-url]: https://scikit-learn.org/
[pandas-badge]: https://img.shields.io/badge/pandas-150458?style=for-the-badge&logo=pandas&logoColor=white
[pandas-url]: https://pandas.pydata.org/
[FastAPI-badge]: https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white
[FastAPI-url]: https://fastapi.tiangolo.com/
[React-badge]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[TypeScript-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Vite-badge]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vite.dev/
