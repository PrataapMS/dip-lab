<div align="center">

<img src="docs/assets/banner.png" alt="Dip Lab: trade the 2008 crash, the COVID rebound and the dot-com bubble with virtual cash, then replay the same market and do it better" width="100%">

### Learn how the stock market works by living through its best and worst days.

[![Play now](https://img.shields.io/badge/%E2%96%B6%20play%20now-prataapms.github.io%2Fdip--lab-c6ff3d?style=for-the-badge&labelColor=0b0d14)](https://prataapms.github.io/dip-lab/)
[![Take the tour](https://img.shields.io/badge/%E2%9C%A8%20take%20the%20tour-landing%20page-a08bff?style=for-the-badge&labelColor=0b0d14)](https://prataapms.github.io/dip-lab/welcome/)

[![CI](https://github.com/PrataapMS/dip-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/PrataapMS/dip-lab/actions/workflows/ci.yml)
[![Pages](https://github.com/PrataapMS/dip-lab/actions/workflows/deploy.yml/badge.svg)](https://github.com/PrataapMS/dip-lab/actions/workflows/deploy.yml)
![Version](https://img.shields.io/github/package-json/v/PrataapMS/dip-lab?color=a08bff&labelColor=0b0d14)
![PWA](https://img.shields.io/badge/PWA-offline%20%2B%20installable-5A0FC8?logo=pwa&logoColor=white&labelColor=0b0d14)
![No sign-up](https://img.shields.io/badge/accounts-none%20needed-c6ff3d?labelColor=0b0d14)
![No tracking](https://img.shields.io/badge/tracking-none-c6ff3d?labelColor=0b0d14)
[![License: GPL v3+](https://img.shields.io/badge/license-GPL--3.0--or--later-blue?labelColor=0b0d14)](LICENSE)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Preact](https://img.shields.io/badge/Preact-673AB8?logo=preact&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)

[Play](https://prataapms.github.io/dip-lab/) ·
[Tour](https://prataapms.github.io/dip-lab/welcome/) ·
[Screens](#screens) ·
[Features](#features) ·
[Scenarios](#scenarios) ·
[Install](#install-it-like-an-app) ·
[FAQ](#faq) ·
[Develop](#run-it-locally) ·
[Roadmap](docs/ROADMAP.md) ·
[License](#license)

</div>

> [!IMPORTANT]
> Every price in Dip Lab is **simulated**. Historical scenarios follow the rough shape of each
> period but use no real price data. Nothing here is investment advice.

## Why Dip Lab?

Reading about a crash is not the same as sitting through one with your money on the line.
Dip Lab hands you virtual cash, drops you into a market (a calm quarter, the 2008 crisis, the
COVID crash, a meme-stock squeeze, ...) and lets you trade about 550 well-known US stocks and
ETFs on a clock you can speed up or pause.

When the run ends you get an honest debrief: **did you beat simply buying the index and doing
nothing?** Then comes the twist. Hit **Replay** and you get *exactly the same market* again,
same prices, same headlines, same earnings surprises. The only thing that changes is you.

New here? The [**landing page**](https://prataapms.github.io/dip-lab/welcome/) has a playable
30-second demo and a step-by-step guide to your first trade.

- **No sign-up, no ads, no tracking.** Everything runs in your browser.
- **Works offline.** After the first visit it needs no network at all.
- **Trading in under a minute.** One-tap amounts, plain-English orders ("Buy $500 of AAPL").
- **Graded on process, not luck.** An all-in bet that happens to pay off still gets marked down.

## Screens

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/assets/home.png" alt="Home: level and XP, the run in progress with a Resume button, daily quests and badges" width="260"><br><b>Home</b><br><sub>Your run, quests, streak and badges</sub></td>
    <td align="center" width="33%"><img src="docs/assets/pick-run.png" alt="Pick your run: scenario cards with difficulty and boss runs" width="260"><br><b>Pick your run</b><br><sub>Nine scenarios plus a custom market</sub></td>
    <td align="center" width="33%"><img src="docs/assets/market.png" alt="Market screen with speed controls, the next event, index tiles, sector chips and an editable watchlist" width="260"><br><b>Market</b><br><sub>Live clock, next event, indexes, watchlist</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/stock.png" alt="Stock screen for AAPL with a watchlist star, intraday chart, upcoming earnings and dividend tags" width="260"><br><b>Stock</b><br><sub>Intraday chart, events, quick facts</sub></td>
    <td align="center"><img src="docs/assets/order.png" alt="Order sheet: buy $500 of AAPL with preview and risk check" width="260"><br><b>Order sheet</b><br><sub>Plain-English preview and risk check</sub></td>
    <td align="center"><img src="docs/assets/portfolio.png" alt="Portfolio: account value, return, dividends and a you-vs-SPY chart" width="260"><br><b>Portfolio</b><br><sub>Your equity curve vs the index</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/debrief.png" alt="Run complete: grade A, +54.2% vs +12.4% for buy and hold SPY" width="260"><br><b>Debrief</b><br><sub>Grade, stats and replay</sub></td>
    <td align="center"><img src="docs/assets/settings.png" alt="Settings: player name, day length, pause at each close and sound" width="260"><br><b>Settings</b><br><sub>Clock, sound, saves and backups</sub></td>
    <td></td>
  </tr>
</table>

## How a run works

```mermaid
flowchart LR
    A["Pick a scenario<br/>and starting cash"] --> B["Trade on a<br/>simulated clock"]
    B --> C["Earnings, news<br/>and dividends hit"]
    C --> B
    B --> D["Debrief:<br/>you vs buy-and-hold SPY"]
    D -->|"Replay: same seed,<br/>same market"| B
    D -->|New run| A
```

1. **Pick your run.** Choose a scenario, starting cash ($1k to $1M) and fees, or build a custom market.
2. **Trade.** Market hours tick by in 5-minute bars. Play, pause, skip to the close, jump to the next event, or change speed (1x to 8x, or as slow as real time).
3. **React.** Earnings beats and misses, company news and scenario headlines move prices; dividends land in your cash.
4. **Get graded.** See your return next to buy-and-hold SPY (with dividends), your worst drop, costs and the moments worth learning from.
5. **Replay.** Same seed, same market. Try the plan you wish you'd had.

## Features

| Area | What you get |
| --- | --- |
| **Stocks** | ~550 S&P 500 and popular Nasdaq names, plus index and sector ETFs (SPY, QQQ, DIA, IWM, ...). Search, sector filter, top movers, and a watchlist you edit (star any stock). |
| **Orders** | Market, limit and stop orders. Buy by dollars or shares, fractional shares, day or until-cancelled. "Explain like I'm new" on every order type. |
| **Realistic fills** | Bid/ask spread, optional commission ($0, $1 or $5 a trade), overnight gaps, stops that slip through gaps. |
| **Risk check** | Every order shows how much of your account it puts at risk before you confirm. |
| **Clock** | Real NYSE calendar with weekends and holidays skipped. Play, pause, skip to the close, 1x to 8x, 5 minutes a day or real time. **Next event** plays ahead to the close before the next earnings report, ex-dividend date or headline for what you hold or watch. |
| **Events** | Quarterly earnings with beats and misses, company news, scenario headlines, quarterly dividends with ex-dates. |
| **Margin and shorts** | Borrow up to 2x with interest and margin calls, and sell short with borrow fees (unlocked as you level up). |
| **Day summary** | At each close: you vs SPY, best and worst holding, the day's headline. |
| **Portfolio** | Account value, cash, profit and loss, dividends received, and your equity curve against SPY. |
| **Debrief** | A to F grade, return vs SPY, worst drawdown, win rate, costs paid, best and worst positions, flagged moments, and the XP and badges the run earned. |
| **Replay** | Rerun any market with the same seed, or jump back to the close before a flagged moment and try again. |
| **Learn** | A guided first trade, glossary cards on every term, 12 short lessons and 8 fixed-market challenges. |
| **Rewards** | XP, levels and ranks, daily quests, streaks and 24 badges. XP rewards good process, not lucky bets. |
| **Saves** | Runs save themselves in 3 slots and reopen where you left off. Export a run, or back up everything to a file and import it on another device. |
| **Settings** | Player name, default speed, pause at each close, sound, storage used, reset progress. |
| **Offline app** | Installable PWA. Fonts and data ship inside the app; no network calls at runtime. |

See the full [roadmap](docs/ROADMAP.md).

## Scenarios

| Scenario | Period | Difficulty | What it teaches |
| --- | --- | :---: | --- |
| First steps | Made-up, 3 months | ■□□□□ | Orders, charts, profit and loss |
| The long bull | 2010 to 2019 | ■□□□□ | Compounding, buy-and-hold, regular investing |
| Sideways chop | Made-up, 1 year | ■■□□□ | Overtrading and fees |
| Earnings season | Made-up, 3 months | ■■□□□ | Price gaps, beats vs misses, slippage |
| COVID crash and rebound | Feb to Dec 2020 | ■■■□□ | How fast crashes happen, selling at the bottom |
| 2022 rate shock | Jan to Dec 2022 | ■■■□□ | Growth vs value, interest rates, bear-market rallies |
| Dot-com bubble 💀 | Jan 1998 to Oct 2002 | ■■■■□ | Valuation, hype, concentration |
| 2008 financial crisis 💀 | Oct 2007 to Mar 2009 | ■■■■□ | Crashes, diversification, panic selling |
| Meme squeeze 💀 | Made-up, 6 weeks | ■■■■■ | Hype, short squeezes, extreme volatility |
| Custom | Any start from 1998 to 2024, up to 3 years | your call | Free exploration: pick the mood, length and seed |

💀 = boss run. Historical scenarios pass through the real period's major turning points (for
example the March 2020 low) while every individual price path is simulated.

## How you're graded

Your grade is about **how** you invested, not only how much you made.

| Part | Weight | What counts |
| --- | :---: | --- |
| Performance | 40% | Your return compared with buy-and-hold SPY over the same days |
| Risk | 30% | Your worst drawdown compared with the market's |
| Discipline | 30% | Fees and spreads paid, panic-selling near lows, concentration |

Putting 50% or more of your account into one stock caps your grade, and so does sitting mostly
in cash. Lucky all-in bets don't get an A.

## Install it like an app

Dip Lab is a Progressive Web App: open it once and it keeps working offline.

| Device | How |
| --- | --- |
| **iPhone / iPad** | Open the [game](https://prataapms.github.io/dip-lab/) in Safari, tap **Share**, then **Add to Home Screen**. |
| **Android** | Open it in Chrome, tap the **⋮** menu, then **Install app** (or **Add to Home screen**). |
| **Desktop** | In Chrome or Edge, click the install icon at the right of the address bar. |

## FAQ

<details>
<summary><b>Is this real market data?</b></summary>

No. Every price is generated by a simulation engine. Historical scenarios are shaped to follow
the rough path of the real period (how far and how fast the market fell, when it bottomed) but
individual stock prices, earnings results and news are simulated.
</details>

<details>
<summary><b>Is this investment advice?</b></summary>

No. Dip Lab is a learning game. It teaches how markets and orders behave, not what to buy.
</details>

<details>
<summary><b>Do I need an account or an internet connection?</b></summary>

No account, ever. You need a connection only for the first visit; after that the whole app,
including all stock data, is cached on your device.
</details>

<details>
<summary><b>Where is my data stored?</b></summary>

On your device only (in the browser's storage). Nothing is sent anywhere. Runs save themselves
into 3 slots as you play; Settings can export a run or back up everything to a file, which you
can import on another device.
</details>

<details>
<summary><b>Why does replay give me exactly the same market?</b></summary>

Every run is built from a seed. The same seed and options always produce the same prices,
headlines and earnings results, so you can compare two strategies fairly or send a seed to a
friend and race them on the same market.
</details>

<details>
<summary><b>Are the companies and tickers real?</b></summary>

The list of ~550 companies is based on well-known US stocks and ETFs, with approximate sectors,
volatility and dividend yields, and was last checked in November 2026. A few companies that were
bought out since then (such as Electronic Arts) stay in, because every scenario ends before they
left the market. Each company only appears in scenarios that start after it listed. The Meme
squeeze scenario adds a fictional company.
</details>

## Run it locally

Requires **Node 20+**.

```bash
git clone https://github.com/PrataapMS/dip-lab.git
cd dip-lab
npm ci
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm test` | Run the Vitest suite once (`npm run test:watch` to watch) |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run build` | Production build into `dist/`, including the service worker |
| `npm run build:site` | Add the landing page (`site/`) to the build at `dist/welcome/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint and check formatting with [Biome](https://biomejs.dev) (`npm run format` fixes formatting) |
| `npm run test:coverage` | Run the tests with a coverage report |
| `npm run check:dist` | Check the build's PWA files and size budget |
| `npm run test:e2e` | Play a first trade in Chrome against the build, then reload offline (needs `npm i --no-save playwright-core@1.59.1` and a prior `npm run build`) |

CI runs on pushes to `main` and on pull requests: lint, typecheck, tests with coverage, build,
size budget, then the end-to-end smoke test.

### How it's built

```mermaid
flowchart LR
    UI["UI (Preact)<br/>screens, charts, order sheet"] -- "play, pause, speed,<br/>place order" --> W["Web Worker"]
    W -- "prices, fills,<br/>news, summaries" --> UI
    W --> E["Engine (pure TypeScript)<br/>seeded RNG, market regimes,<br/>sectors, intraday bars,<br/>orders, account, debrief"]
```

- **Engine** (`src/engine/`): pure, deterministic TypeScript with no DOM access. All randomness
  flows from one seed, so every run is reproducible and covered by tests.
- **Worker** (`src/worker/`): runs the engine off the main thread so the UI stays smooth at 8x.
- **UI** (`src/ui/`): Preact screens with a hash router; renders state and sends commands.
- **Data** (`src/data/universe.json`): the stock and ETF universe, bundled and precached.

```
src/
├── engine/    market simulation, calendar, orders, account, events, debrief, saves
├── worker/    Web Worker that hosts the engine and writes saves
├── game/      XP, levels, quests, badges, settings, watchlist
├── learn/     glossary, lessons, challenges
├── storage/   IndexedDB, save slots, export files
├── ui/        screens, charts, order sheet, formatting helpers
├── data/      stock and ETF universe
└── styles/    design tokens and global styles
```

### Releases

- **GitHub Pages:** serves the app at `/dip-lab/` and the landing page at `/dip-lab/welcome/`;
  deploys automatically when the major version in `package.json` goes up on
  `main` (for example `0.x` to `1.0.0`) and CI has passed, or manually from the Actions tab.
  Each deploy is tagged `vX.Y.Z` with a GitHub Release.
- **Netlify:** manual only. Run **Deploy to Netlify** from the Actions tab and pick `preview`
  or `production`. It needs the repository secrets `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`;
  build settings live in `netlify.toml`.

## Roadmap

| Phase | Delivers | Status |
| --- | --- | :---: |
| 0 | Project setup, app shell, seeded market paths | ✅ |
| 1 | Market engine: moods, sectors, intraday prices, trading calendar, stock list | ✅ |
| 2 | Trading screens: market, stock, order sheet, portfolio | ✅ |
| 3 | All scenarios, news and events, dividends, debrief and grades | ✅ |
| 4 | Tutorial, glossary, lessons, challenges, XP and badges, margin and shorts | ✅ |
| 5 | Saves, settings, install prompt, offline polish, performance | ✅ |
| 6 | Release 1.0: editable watchlist, next event, error screen, accessibility | ✅ |

Details in [docs/ROADMAP.md](docs/ROADMAP.md). Ideas and bug reports are welcome in
[Issues](https://github.com/PrataapMS/dip-lab/issues).

## License

Dip Lab is free software: you can redistribute it and/or modify it under the terms of the
[GNU General Public License](LICENSE) as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version.

It is distributed in the hope that it will be useful, but **without any warranty**; without
even the implied warranty of merchantability or fitness for a particular purpose. See the
[LICENSE](LICENSE) file for details.

Copyright © 2026 [PrataapMS](https://github.com/PrataapMS).

### Third-party components

| Component | License |
| --- | --- |
| [Preact](https://github.com/preactjs/preact) | MIT |
| [Space Grotesk](https://github.com/floriankarsten/space-grotesk), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), [Silkscreen](https://github.com/googlefonts/silkscreen) (via Fontsource) | SIL Open Font License 1.1 |

<div align="center">
<sub>Prices are simulated. Nothing here is investment advice.</sub>
</div>
