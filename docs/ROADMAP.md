# Dip Lab roadmap

Dip Lab is an offline, installable web game that teaches how the US stock market works. You get
virtual cash, pick a market scenario, trade on a simulated clock you can speed up, and finish
with a debrief that compares you with simply buying the index. Every scenario can be replayed
with exactly the same market, so only your decisions change.

Prices are simulated. Nothing here is investment advice.

## Goals

- Works with no network after the first load, and installs like an app.
- A beginner can be trading within a minute: one-tap defaults, plain words, tooltips on every term.
- Covers bull runs, crashes, rebounds, bubbles, rate shocks, sideways markets and earnings surprises.
- Honest feedback: every run is scored against buy-and-hold.

## Features (first release)

| Area | What you get |
| --- | --- |
| Stocks | ~550 well-known US stocks plus major index and sector ETFs; search, sector filter, top movers, watchlist |
| Orders | Market, limit and stop-loss; buy by shares or dollars; fractional shares; plain-English preview |
| Account | Starting cash from $1k to $1M; optional fees, spreads, dividends, margin and short selling |
| Clock | Market hours with weekends and holidays skipped; play, pause, step a day, adjustable speed |
| News | Scenario headlines, quarterly earnings beats and misses, company news |
| Portfolio | Cash, holdings, profit and loss, sector mix, your equity curve vs the index |
| Learning | Guided first trade, glossary, end-of-day summary, debrief with lessons, challenges |
| Saves | Autosave, save slots, export and import, replay with the same market |

## Game features

- XP, levels and ranks, earned from finished runs, quests and lessons.
- Run grade (A to F) that rewards good process, not lucky all-in bets.
- Daily quests, streaks and badges.
- Replay a moment: jump back to the day of a mistake and try again.
- Risk check on every order.

## Scenarios

| Scenario | What it teaches |
| --- | --- |
| First steps | Orders, charts, profit and loss |
| The long bull | Compounding, buy-and-hold, regular investing |
| Dot-com bubble | Valuation, hype, concentration |
| 2008 financial crisis | Crashes, diversification, panic selling |
| COVID crash and rebound | How fast crashes happen, selling at the bottom |
| 2022 rate shock | Growth vs value, interest rates, bear-market rallies |
| Meme squeeze | Hype, short squeezes, extreme volatility |
| Sideways chop | Overtrading and fees |
| Earnings season | Price gaps, beats vs misses, slippage |
| Custom | Free exploration |

Historical scenarios are simulated to follow the rough shape of each period; they do not use
real price data.

## Phases

| Phase | Delivers | Status |
| --- | --- | --- |
| 0 | Project setup, app shell, seeded random market paths | Done |
| 1 | Simulated market engine: market moods, sectors, intraday prices, trading calendar, stock list | Done |
| 2 | Core trading screens: market, stock, order sheet, portfolio | Done |
| 3 | All scenarios, news and events, dividends, end-of-run debrief | Next |
| 4 | Tutorial, glossary, lessons, challenges, XP and badges, margin and shorts | Planned |
| 5 | Offline polish, install prompt, saves, settings, performance | Planned |

## Later ideas

Companies that failed, an auto-invest mode, basic options, stock splits and IPOs, strategy bots
to race against.
