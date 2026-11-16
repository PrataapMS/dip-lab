/**
 * Plain-English glossary. Each card: what it means, why it matters, and a small example.
 * `<Term id="…">` in the UI opens these; a test checks every id used exists.
 */

export interface GlossaryEntry {
  id: string;
  term: string;
  /** One line: what it is. */
  short: string;
  /** Why it matters to you as an investor. */
  why: string;
  example?: string;
  /** A lesson that goes deeper. */
  lesson?: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: 'stock',
    term: 'Stock',
    short: 'A small piece of ownership in a company.',
    why: 'When the company grows its profits, its stock usually becomes worth more. When it struggles, the stock falls.',
    example: 'Owning 1 share of a company with 1 billion shares means you own one billionth of it.',
    lesson: 'what-is-a-stock',
  },
  {
    id: 'share',
    term: 'Share',
    short: 'One unit of a stock or fund.',
    why: 'Prices are quoted per share, so a $500 stock is not "more expensive" than a $50 one; it is just cut into fewer pieces.',
    example: '10 shares at $50 cost $500.',
    lesson: 'what-is-a-stock',
  },
  {
    id: 'fractional-share',
    term: 'Fractional share',
    short: 'Part of one share, so you can invest an exact dollar amount.',
    why: 'You can spread $1,000 across many companies even when one share costs more than that.',
    example: '$100 of a $400 stock buys 0.25 shares.',
  },
  {
    id: 'etf',
    term: 'ETF (fund)',
    short: 'A fund that holds many stocks and trades like one stock.',
    why: 'One purchase spreads your money across dozens or hundreds of companies, so one bad company hurts much less.',
    example: 'SPY holds the 500 largest US companies.',
    lesson: 'index-funds',
  },
  {
    id: 'index',
    term: 'Index',
    short: 'A list of stocks whose combined price tracks a slice of the market.',
    why: 'Indexes are the yardstick: "the market went up 1%" means an index did.',
    example: 'The S&P 500 index follows 500 large US companies.',
    lesson: 'index-funds',
  },
  {
    id: 'spy',
    term: 'SPY',
    short: 'The best-known fund that tracks the S&P 500 index.',
    why: 'Dip Lab scores every run against simply buying SPY and holding it. Beating that is harder than it sounds.',
    lesson: 'index-funds',
  },
  {
    id: 'sector',
    term: 'Sector',
    short: 'A group of companies in the same line of business.',
    why: 'Stocks in one sector often move together, so owning ten tech stocks is less spread out than it looks.',
    example: 'Energy, Financials, Health Care, Information Technology.',
    lesson: 'diversification',
  },
  {
    id: 'market-order',
    term: 'Market order',
    short: 'Buy or sell right now at the current price.',
    why: 'It always fills, but you pay the spread, and if the market is closed it fills at the next open, which can gap.',
    lesson: 'orders',
  },
  {
    id: 'limit-order',
    term: 'Limit order',
    short: 'Buy only at your price or lower, or sell only at your price or higher.',
    why: 'You control the price, but if the market never reaches it, nothing happens.',
    example: 'A limit buy at $95 on a $100 stock waits for a dip to $95.',
    lesson: 'orders',
  },
  {
    id: 'stop-loss',
    term: 'Stop-loss',
    short: 'Sell automatically if the price falls to a level you set.',
    why: 'It caps a loss without watching the screen. It does not lock a price: if the stock gaps below your stop overnight, you get the gap price.',
    example: 'Stop at $90 on a $100 stock: if it opens at $84, you sell near $84.',
    lesson: 'orders',
  },
  {
    id: 'time-in-force',
    term: 'Today / until cancelled',
    short: 'How long an order waits: until today’s close, or until it fills or you cancel it.',
    why: 'A forgotten "until cancelled" order can fill weeks later, when you no longer want it.',
    lesson: 'orders',
  },
  {
    id: 'bid-ask',
    term: 'Bid and ask',
    short: 'The best price buyers will pay (bid) and the best price sellers will take (ask).',
    why: 'You buy at the ask and sell at the bid, so a round trip always costs the gap between them.',
    lesson: 'costs',
  },
  {
    id: 'spread',
    term: 'Spread',
    short: 'The gap between the bid and the ask: a small cost on every trade.',
    why: 'It is tiny per trade but adds up when you trade often, and it widens when markets panic.',
    example: 'Bid $99.98, ask $100.02: a $0.04 spread.',
    lesson: 'costs',
  },
  {
    id: 'commission',
    term: 'Commission',
    short: 'A flat fee per trade, if your broker charges one.',
    why: 'A $5 fee on a $100 trade is 5% gone before the price moves at all.',
    lesson: 'costs',
  },
  {
    id: 'fill',
    term: 'Fill',
    short: 'When your order actually trades, at a price and size.',
    why: 'Placing an order is a request. Only a fill changes what you own.',
    lesson: 'orders',
  },
  {
    id: 'slippage',
    term: 'Slippage',
    short: 'Getting a worse price than you expected.',
    why: 'Stops filled after a gap are the classic case: the order did its job, at a worse price.',
    lesson: 'earnings-and-gaps',
  },
  {
    id: 'gap',
    term: 'Gap',
    short: 'A jump between one day’s close and the next day’s open.',
    why: 'News often lands overnight. Prices skip straight past levels, and orders fill at the new price.',
    example: 'Closed at $100, earnings beat, opens at $108.',
    lesson: 'earnings-and-gaps',
  },
  {
    id: 'cost-basis',
    term: 'Cost basis (avg cost)',
    short: 'What you paid for the shares you hold, fees and spread included, per share.',
    why: 'Your profit or loss is measured against it.',
    example: '2 shares bought at $10 and $14: average cost $12.',
  },
  {
    id: 'unrealised',
    term: 'Unrealised P&L',
    short: 'Profit or loss on shares you still hold, at today’s price.',
    why: 'It is only on paper and can change tomorrow. It becomes realised when you sell.',
  },
  {
    id: 'realised',
    term: 'Realised P&L',
    short: 'Profit or loss locked in by selling.',
    why: 'Once realised, a later price move no longer changes it, for better or worse.',
  },
  {
    id: 'account-value',
    term: 'Account value (equity)',
    short: 'Cash plus everything you hold at today’s prices, minus anything borrowed.',
    why: 'It is the number that matters: what you would have if you sold everything now.',
  },
  {
    id: 'total-return',
    term: 'Total return',
    short: 'How much your account grew or shrank since the start, in percent.',
    why: 'Dip Lab compares it with SPY over the same days.',
  },
  {
    id: 'dividend',
    term: 'Dividend',
    short: 'Cash a company pays its shareholders, usually every quarter.',
    why: 'Over decades, reinvested dividends are a large part of what stocks return.',
    example: 'A $100 stock with a 2% yield pays about $0.50 a share each quarter.',
    lesson: 'dividends',
  },
  {
    id: 'ex-dividend',
    term: 'Ex-dividend date',
    short: 'You must own the stock before this day to get the next dividend.',
    why: 'On that morning the price drops by about the dividend, so buying the day before is not free money.',
    lesson: 'dividends',
  },
  {
    id: 'yield',
    term: 'Dividend yield',
    short: 'A year of dividends as a percent of the price.',
    why: 'A very high yield can mean the price fell because the market expects a cut.',
    lesson: 'dividends',
  },
  {
    id: 'earnings',
    term: 'Earnings report',
    short: 'A company’s quarterly results: sales, profit and what it expects next.',
    why: 'Prices often jump or drop the morning after, sometimes by 10% or more.',
    lesson: 'earnings-and-gaps',
  },
  {
    id: 'beat-miss',
    term: 'Beat / miss',
    short: 'Whether results came in above (beat) or below (miss) what analysts expected.',
    why: 'Expectations are already in the price, so a beat can still fall if the outlook disappoints.',
    lesson: 'earnings-and-gaps',
  },
  {
    id: 'volatility',
    term: 'Volatility',
    short: 'How much a price swings, measured over a year.',
    why: 'High volatility means bigger gains and bigger losses, and more chance of selling at a bad moment.',
    example: '15% is calm for the whole market; 60% is a wild single stock.',
    lesson: 'risk-and-drawdowns',
  },
  {
    id: 'beta',
    term: 'Beta',
    short: 'How much a stock tends to move when the whole market moves.',
    why: 'A beta of 2 means roughly double the market’s moves, both up and down.',
    lesson: 'risk-and-drawdowns',
  },
  {
    id: 'drawdown',
    term: 'Drawdown',
    short: 'A fall from a peak, in percent.',
    why: 'A 50% drop needs a 100% gain to get back. The worst drawdown shows how rough the ride was.',
    example: '$10,000 → $8,000 is a 20% drawdown.',
    lesson: 'risk-and-drawdowns',
  },
  {
    id: 'diversification',
    term: 'Diversification',
    short: 'Spreading money across many companies and sectors.',
    why: 'One bad company can’t sink you. It is the only free lunch in investing.',
    lesson: 'diversification',
  },
  {
    id: 'concentration',
    term: 'Concentration',
    short: 'A large share of your account in one stock.',
    why: 'It can win big, but one bad report can wipe out months of gains. The grade caps all-in bets.',
    lesson: 'diversification',
  },
  {
    id: 'buy-and-hold',
    term: 'Buy and hold',
    short: 'Buy a broad fund and keep it, whatever the market does.',
    why: 'Over long periods it beats most active traders, mostly because it avoids costs and panic.',
    lesson: 'time-in-the-market',
  },
  {
    id: 'benchmark',
    term: 'Benchmark',
    short: 'What you compare your results with.',
    why: 'Making 8% sounds great until the market made 15%. Dip Lab’s benchmark is buy-and-hold SPY.',
    lesson: 'index-funds',
  },
  {
    id: 'bull-market',
    term: 'Bull market',
    short: 'A long stretch of rising prices.',
    why: 'Almost everything goes up, which makes it easy to mistake luck for skill.',
  },
  {
    id: 'bear-market',
    term: 'Bear market',
    short: 'A fall of 20% or more from a peak.',
    why: 'Bear markets have sharp rallies that fool people into thinking the bottom is in.',
    lesson: 'time-in-the-market',
  },
  {
    id: 'crash',
    term: 'Crash',
    short: 'A sudden, steep fall across the market.',
    why: 'Crashes are when people sell at the bottom. Historically, the best days often come right after the worst.',
    lesson: 'time-in-the-market',
  },
  {
    id: 'margin',
    term: 'Margin',
    short: 'Borrowing from your broker to buy more than your cash allows.',
    why: 'Up to 2x the gains, and 2x the losses, plus interest. A 50% fall can wipe you out.',
    lesson: 'margin',
  },
  {
    id: 'buying-power',
    term: 'Buying power',
    short: 'How much more you can buy right now, borrowing included.',
    why: 'Using all of it leaves no room if prices drop.',
    lesson: 'margin',
  },
  {
    id: 'margin-call',
    term: 'Margin call',
    short: 'Your broker’s demand to add money or sell, when your equity falls under 30% of what you hold.',
    why: 'If you don’t, the broker sells for you, usually at a bad price.',
    lesson: 'margin',
  },
  {
    id: 'margin-interest',
    term: 'Margin interest',
    short: 'Interest you pay every day on borrowed money.',
    why: 'At 8% a year, a borrowed position has to beat 8% just to break even on the loan.',
    lesson: 'margin',
  },
  {
    id: 'short-selling',
    term: 'Short selling',
    short: 'Borrowing shares, selling them, and buying them back later to return them.',
    why: 'You profit if the price falls. If it rises, your loss has no ceiling.',
    lesson: 'short-selling',
  },
  {
    id: 'short-squeeze',
    term: 'Short squeeze',
    short: 'A rising price forces short sellers to buy back, which pushes the price up further.',
    why: 'It can turn a small loss into a huge one in days.',
    lesson: 'short-selling',
  },
  {
    id: 'borrow-fee',
    term: 'Borrow fee',
    short: 'What you pay each day to borrow shares you sold short.',
    why: 'Popular shorts are "hard to borrow" and can cost 30% a year or more.',
    lesson: 'short-selling',
  },
  {
    id: 'win-rate',
    term: 'Win rate',
    short: 'The share of your sales that made money.',
    why: 'A high win rate means little if the losses are much bigger than the wins.',
  },
  {
    id: 'grade',
    term: 'Run grade',
    short: 'A to F from return vs SPY (40), worst drop vs SPY’s (30) and discipline (30).',
    why: 'It rewards good process. An all-in bet that got lucky still can’t score an A.',
  },
  {
    id: 'risk-check',
    term: 'Risk check',
    short: 'A 5-step meter: how much of your account goes into this one name, weighted by how much it swings.',
    why: 'It teaches position size. Nothing stops you; it just tells you how big the bet is.',
    lesson: 'diversification',
  },
];

const BY_ID = new Map(GLOSSARY.map((g) => [g.id, g]));

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id);
}

/** Cards whose term or text matches a search, best (term) matches first. */
export function searchGlossary(q: string): GlossaryEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return [...GLOSSARY];
  const inTerm = GLOSSARY.filter((g) => g.term.toLowerCase().includes(s));
  const inText = GLOSSARY.filter((g) => !inTerm.includes(g) && `${g.short} ${g.why}`.toLowerCase().includes(s));
  return [...inTerm, ...inText];
}
