import { type Anchor, bridgeThrough } from './bridge';
import { type IsoDate, toDayNumber, tradingDaysBetween, tradingDaysFrom } from './calendar';
import { SECTOR_VOL, type Sector, sectorShocks, SECTORS } from './factors';
import { generateMarketDays, type Regime, REFERENCE_MARKET_VOL, REGIME_PARAMS, volatilityPath } from './regimes';
import { childSeed, createRng, normal } from './rng';
import { TRADING_DAYS_PER_YEAR } from './synthetic';

/**
 * Scenarios are defined by the rough *shape* of a period (how far the market fell, how
 * long it took, how it recovered), not by copied prices. Between waypoints the market is
 * random, so every seed gives a different market with the same story.
 */
export interface ShapePoint {
  /** Waypoint date. Snaps to the last trading day on or before it. */
  date: IsoDate;
  /** Market return since the close before the first day, e.g. -0.34 for -34%. */
  ret: number;
  /** Mood for the stretch that ends here. Default: picked from how steep it is. */
  regime?: Regime;
}

export interface SectorPoint {
  date: IsoDate;
  /** Sector's extra log return over the market since the start. */
  excess: number;
}

/** A made-up stock that only exists in one scenario (e.g. a meme squeeze). */
export interface SpecialStock {
  ticker: string;
  name: string;
  sector: Sector;
  /** Annual volatility of its noise between waypoints. */
  vol: number;
  startPrice: number;
  /** Return since the start at each waypoint; the last one must be the end date. */
  path: { date: IsoDate; ret: number }[];
}

/** A generic news line for a key day of the scenario (no real names or events). */
export interface ScenarioHeadline {
  /** Snaps to the last trading day on or before it. */
  date: IsoDate;
  text: string;
  tone: 'up' | 'down' | 'flat';
  /** Shown before the open (the intro) or at the close (default: the day's story). */
  at?: 'open' | 'close';
  /** Set when the headline is about one stock. */
  ticker?: string;
}

/** How much company news a run has: none (no earnings either), normal or twice as much. */
export type NewsLevel = 'off' | 'normal' | 'busy';

export interface ScenarioDef {
  id: string;
  name: string;
  teaches: string;
  /** 1 (easy) to 5 (boss run). */
  difficulty: number;
  /** True when the scenario is made up rather than shaped on a real period. */
  fictional: boolean;
  start: IsoDate;
  end: IsoDate;
  /** Market waypoints. Empty means a free-running market (Custom). */
  market: ShapePoint[];
  sectors?: Partial<Record<Sector, SectorPoint[]>>;
  special?: SpecialStock[];
  /** Multiplies market volatility, e.g. for a choppy sideways year. Default 1. */
  volScale?: number;
  /** Starting mood for a free-running market. */
  startRegime?: Regime;
  headlines?: ScenarioHeadline[];
  /** Default 'normal'. */
  news?: NewsLevel;
  /** Multiplies the size of earnings moves. Default 1. */
  earningsScale?: number;
}

const DT = 1 / TRADING_DAYS_PER_YEAR;
/** How quickly the market drifts back toward its scenario shape between waypoints. */
export const MARKET_REVERSION_DAYS = 10;

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 'first-steps',
    name: 'First steps',
    teaches: 'Orders, charts, profit and loss',
    difficulty: 1,
    fictional: true,
    start: '2024-01-02',
    end: '2024-03-28',
    headlines: [
      { date: '2024-01-02', text: 'New year, calm markets: stocks drift quietly', tone: 'flat', at: 'open' },
      { date: '2024-03-28', text: 'Steady quarter ends with stocks modestly higher', tone: 'up' },
    ],
    market: [{ date: '2024-03-28', ret: 0.04, regime: 'calm' }],
  },
  {
    id: 'long-bull',
    name: 'The long bull',
    teaches: 'Compounding, buy-and-hold, regular investing',
    difficulty: 1,
    fictional: false,
    start: '2010-01-04',
    end: '2019-12-31',
    headlines: [
      { date: '2010-01-04', text: 'Recovery year begins: investors cautiously return to stocks', tone: 'flat', at: 'open' },
      { date: '2010-04-23', text: 'Stocks extend their rally as the recovery takes hold', tone: 'up' },
      { date: '2010-07-02', text: 'Debt worries abroad send stocks sharply lower', tone: 'down' },
      { date: '2011-04-29', text: 'Stocks hit post-crisis highs as profits recover', tone: 'up' },
      { date: '2011-10-03', text: 'Government credit worries trigger a sharp slide', tone: 'down' },
      { date: '2012-12-31', text: 'Stocks end the year higher despite a budget standoff', tone: 'up' },
      { date: '2013-12-31', text: 'Best year for stocks in more than a decade', tone: 'up' },
      { date: '2014-12-31', text: 'Bull market rolls on as record highs keep coming', tone: 'up' },
      { date: '2015-05-21', text: 'Stocks edge to new records as growth holds up', tone: 'up' },
      { date: '2016-02-11', text: 'Oil slump and growth fears drag stocks into a correction', tone: 'down' },
      { date: '2016-12-30', text: 'Stocks rally to records after a surprise election result', tone: 'up' },
      { date: '2018-01-26', text: 'Euphoria: stocks post their longest winning streak in years', tone: 'up' },
      { date: '2018-02-08', text: 'Volatility spike: stocks drop 10% in two weeks', tone: 'down' },
      { date: '2018-09-20', text: 'Calm returns and stocks set new highs', tone: 'up' },
      { date: '2018-12-24', text: 'Rate fears and trade tensions: worst December in decades', tone: 'down' },
      { date: '2019-12-31', text: 'Decade ends with stocks near record highs', tone: 'up' },
    ],
    market: [
      { date: '2010-04-23', ret: 0.09 },
      { date: '2010-07-02', ret: -0.08 },
      { date: '2011-04-29', ret: 0.22 },
      { date: '2011-10-03', ret: -0.01 },
      { date: '2012-12-31', ret: 0.28 },
      { date: '2013-12-31', ret: 0.66 },
      { date: '2014-12-31', ret: 0.85 },
      { date: '2015-05-21', ret: 0.91 },
      { date: '2016-02-11', ret: 0.64 },
      { date: '2016-12-30', ret: 1.01 },
      { date: '2018-01-26', ret: 1.58 },
      { date: '2018-02-08', ret: 1.31 },
      { date: '2018-09-20', ret: 1.63 },
      { date: '2018-12-24', ret: 1.11 },
      { date: '2019-12-31', ret: 1.9 },
    ],
  },
  {
    id: 'dot-com',
    name: 'Dot-com bubble',
    teaches: 'Valuation, hype, concentration',
    difficulty: 4,
    fictional: false,
    start: '1998-01-02',
    end: '2002-10-09',
    headlines: [
      { date: '1998-01-02', text: 'Internet stocks are the talk of the town', tone: 'flat', at: 'open' },
      { date: '1998-07-17', text: 'Stocks hit records as tech shares soar', tone: 'up' },
      { date: '1998-10-08', text: 'A hedge fund collapse and a currency crisis abroad spark a selloff', tone: 'down' },
      { date: '1999-12-31', text: 'Tech mania: dot-com shares end the decade at dizzying highs', tone: 'up' },
      { date: '2000-03-24', text: 'Market peaks as tech valuations reach record levels', tone: 'up' },
      { date: '2001-04-04', text: 'Dot-com bust: tech stocks have lost more than half their value', tone: 'down' },
      { date: '2001-05-21', text: 'Rate cuts spark a powerful bear-market rally', tone: 'up' },
      { date: '2001-09-21', text: 'Shock events and recession fears send stocks tumbling', tone: 'down' },
      { date: '2002-01-04', text: 'Stocks rebound as the worst seems over', tone: 'up' },
      { date: '2002-10-09', text: 'Accounting scandals deepen the bear market; tech nearly 80% off its peak', tone: 'down' },
    ],
    market: [
      { date: '1998-07-17', ret: 0.22 },
      { date: '1998-10-08', ret: -0.01 },
      { date: '1999-12-31', ret: 0.51 },
      { date: '2000-03-24', ret: 0.57 },
      { date: '2001-04-04', ret: 0.14 },
      { date: '2001-05-21', ret: 0.35 },
      { date: '2001-09-21', ret: 0 },
      { date: '2002-01-04', ret: 0.21 },
      { date: '2002-10-09', ret: -0.2 },
    ],
    sectors: {
      // Tech runs far ahead of the market, then gives it all back (~-78% from the top).
      'Information Technology': [
        { date: '1999-12-31', excess: 0.54 },
        { date: '2000-03-24', excess: 0.7 },
        { date: '2001-04-04', excess: -0.09 },
        { date: '2002-10-09', excess: -0.12 },
      ],
      'Communication Services': [
        { date: '2000-03-24', excess: 0.4 },
        { date: '2002-10-09', excess: -0.3 },
      ],
    },
  },
  {
    id: 'gfc-2008',
    name: '2008 financial crisis',
    teaches: 'Crashes, diversification, panic selling',
    difficulty: 4,
    fictional: false,
    start: '2007-10-10',
    end: '2009-03-09',
    headlines: [
      { date: '2007-10-10', text: 'Stocks near record highs, but cracks are showing in housing', tone: 'flat', at: 'open' },
      { date: '2007-11-26', text: 'Mortgage losses spread as banks write down billions', tone: 'down' },
      { date: '2007-12-10', text: 'Central bank rate cut sparks a relief rally', tone: 'up' },
      { date: '2008-03-10', text: 'Credit fears deepen as a big investment bank wobbles', tone: 'down' },
      { date: '2008-05-19', text: 'Rescue deal calms markets and stocks bounce', tone: 'up' },
      { date: '2008-07-15', text: 'Mortgage lenders under pressure; bank stocks slide', tone: 'down' },
      { date: '2008-08-28', text: 'Oil prices ease and stocks steady', tone: 'up' },
      { date: '2008-10-10', text: 'Panic week: a major bank fails and stocks crash', tone: 'down' },
      { date: '2008-11-04', text: 'Government bailouts spark a violent rally', tone: 'up' },
      { date: '2008-11-20', text: 'Stocks hit new lows as the recession deepens', tone: 'down' },
      { date: '2009-01-06', text: 'Stimulus hopes lift stocks off the lows', tone: 'up' },
      { date: '2009-03-09', text: 'Stocks down more than half from the peak. Is this the bottom?', tone: 'down' },
    ],
    market: [
      { date: '2007-11-26', ret: -0.1 },
      { date: '2007-12-10', ret: -0.03 },
      { date: '2008-03-10', ret: -0.19 },
      { date: '2008-05-19', ret: -0.09 },
      { date: '2008-07-15', ret: -0.22 },
      { date: '2008-08-28', ret: -0.17 },
      { date: '2008-10-10', ret: -0.43 },
      { date: '2008-11-04', ret: -0.36 },
      { date: '2008-11-20', ret: -0.52 },
      { date: '2009-01-06', ret: -0.4 },
      { date: '2009-03-09', ret: -0.57 },
    ],
    sectors: {
      Financials: [
        { date: '2008-07-15', excess: -0.4 },
        { date: '2009-03-09', excess: -0.75 },
      ],
      Energy: [
        { date: '2008-07-15', excess: 0.4 },
        { date: '2009-03-09', excess: 0.3 },
      ],
      'Consumer Staples': [{ date: '2009-03-09', excess: 0.35 }],
    },
  },
  {
    id: 'covid-2020',
    name: 'COVID crash and rebound',
    teaches: 'How fast crashes happen, selling at the bottom',
    difficulty: 3,
    fictional: false,
    start: '2020-02-20',
    end: '2020-12-31',
    headlines: [
      { date: '2020-02-20', text: 'Stocks at record highs as a new virus spreads abroad', tone: 'flat', at: 'open' },
      { date: '2020-03-23', text: 'Pandemic panic: the fastest crash on record', tone: 'down' },
      { date: '2020-03-26', text: 'Huge stimulus package sparks a record rally', tone: 'up' },
      { date: '2020-04-01', text: 'Lockdowns spread and stocks slip again', tone: 'down' },
      { date: '2020-04-29', text: 'Rebound continues as the central bank vows unlimited support', tone: 'up' },
      { date: '2020-05-13', text: 'Warnings of a long recovery weigh on stocks', tone: 'down' },
      { date: '2020-06-08', text: 'Reopening hopes: stocks erase most of the crash', tone: 'up' },
      { date: '2020-06-11', text: 'Second-wave fears trigger a sharp one-day drop', tone: 'down' },
      { date: '2020-09-02', text: 'Tech-led rally pushes stocks to new records', tone: 'up' },
      { date: '2020-09-23', text: 'Tech stocks stumble and the market slips into a correction', tone: 'down' },
      { date: '2020-10-12', text: 'Stimulus talks lift stocks again', tone: 'up' },
      { date: '2020-10-30', text: 'Cases surge and stocks have their worst week in months', tone: 'down' },
      { date: '2020-12-31', text: 'Vaccine news caps a remarkable comeback year', tone: 'up' },
    ],
    market: [
      { date: '2020-03-23', ret: -0.34, regime: 'crash' },
      { date: '2020-03-26', ret: -0.22 },
      { date: '2020-04-01', ret: -0.27 },
      { date: '2020-04-29', ret: -0.13 },
      { date: '2020-05-13', ret: -0.17 },
      { date: '2020-06-08', ret: -0.05 },
      { date: '2020-06-11', ret: -0.11 },
      { date: '2020-09-02', ret: 0.06 },
      { date: '2020-09-23', ret: -0.04 },
      { date: '2020-10-12', ret: 0.04 },
      { date: '2020-10-30', ret: -0.03 },
      { date: '2020-12-31', ret: 0.11 },
    ],
    sectors: {
      Energy: [
        { date: '2020-03-23', excess: -0.38 },
        { date: '2020-12-31', excess: -0.53 },
      ],
      'Information Technology': [{ date: '2020-12-31', excess: 0.23 }],
      'Consumer Discretionary': [{ date: '2020-12-31', excess: 0.15 }],
    },
  },
  {
    id: 'rate-shock-2022',
    name: '2022 rate shock',
    teaches: 'Growth vs value, interest rates, bear-market rallies',
    difficulty: 3,
    fictional: false,
    start: '2022-01-03',
    end: '2022-12-30',
    headlines: [
      { date: '2022-01-03', text: 'Inflation at multi-decade highs; markets expect rate hikes', tone: 'flat', at: 'open' },
      { date: '2022-01-27', text: 'Rate-hike fears hit growth stocks hard', tone: 'down' },
      { date: '2022-02-02', text: 'Bargain hunters lift stocks off the lows', tone: 'up' },
      { date: '2022-03-08', text: 'Conflict abroad sends oil soaring and stocks lower', tone: 'down' },
      { date: '2022-03-29', text: 'First rate hike done: stocks stage a relief rally', tone: 'up' },
      { date: '2022-05-20', text: 'Stocks flirt with a bear market as inflation stays hot', tone: 'down' },
      { date: '2022-05-31', text: 'Short-lived bounce as investors hunt for a bottom', tone: 'up' },
      { date: '2022-06-16', text: 'Biggest rate hike in decades; stocks hit new lows', tone: 'down' },
      { date: '2022-08-16', text: 'Bear-market rally: hopes of slower hikes lift stocks', tone: 'up' },
      { date: '2022-10-12', text: 'Inflation surprise sends stocks to the low of the year', tone: 'down' },
      { date: '2022-11-30', text: 'Cooler inflation data sparks a big rally', tone: 'up' },
      { date: '2022-12-30', text: 'Worst year for stocks since the financial crisis', tone: 'down' },
    ],
    market: [
      { date: '2022-01-27', ret: -0.09 },
      { date: '2022-02-02', ret: -0.04 },
      { date: '2022-03-08', ret: -0.125 },
      { date: '2022-03-29', ret: -0.03 },
      { date: '2022-05-20', ret: -0.18 },
      { date: '2022-05-31', ret: -0.13 },
      { date: '2022-06-16', ret: -0.23 },
      { date: '2022-08-16', ret: -0.1 },
      { date: '2022-10-12', ret: -0.25 },
      { date: '2022-11-30', ret: -0.14 },
      { date: '2022-12-30', ret: -0.19 },
    ],
    sectors: {
      Energy: [
        { date: '2022-06-08', excess: 0.6 },
        { date: '2022-12-30', excess: 0.67 },
      ],
      'Information Technology': [{ date: '2022-12-30', excess: -0.11 }],
      'Communication Services': [{ date: '2022-12-30', excess: -0.26 }],
      'Consumer Discretionary': [{ date: '2022-12-30', excess: -0.25 }],
      Utilities: [{ date: '2022-12-30', excess: 0.2 }],
    },
  },
  {
    id: 'meme-squeeze',
    name: 'Meme squeeze',
    teaches: 'Hype, short squeezes, extreme volatility',
    difficulty: 5,
    fictional: true,
    start: '2023-01-03',
    end: '2023-02-14',
    headlines: [
      { date: '2023-01-03', text: 'Quiet start to the year; one beaten-down retailer has a cult following', tone: 'flat', at: 'open' },
      { date: '2023-01-17', text: 'Online forums pile into MOONR; heavily shorted shares jump', tone: 'up', ticker: 'MOONR' },
      { date: '2023-01-24', text: 'MOONR short squeeze: shares more than triple', tone: 'up', ticker: 'MOONR' },
      { date: '2023-01-27', text: 'MOONR mania: shares up over 1,000% in weeks', tone: 'up', ticker: 'MOONR' },
      { date: '2023-01-31', text: 'Brokers limit MOONR trading; shares crash from the peak', tone: 'down', ticker: 'MOONR' },
      { date: '2023-02-06', text: 'MOONR keeps sliding as the hype fades', tone: 'down', ticker: 'MOONR' },
      { date: '2023-02-14', text: 'MOONR settles far below its peak, still above where it started', tone: 'down', ticker: 'MOONR' },
      { date: '2023-02-14', text: 'The broader market barely noticed the frenzy', tone: 'up' },
    ],
    market: [{ date: '2023-02-14', ret: 0.01, regime: 'calm' }],
    special: [
      {
        ticker: 'MOONR',
        name: 'Moonrock Retail (fictional)',
        sector: 'Consumer Discretionary',
        vol: 1.5,
        startPrice: 18,
        path: [
          { date: '2023-01-17', ret: 0.6 },
          { date: '2023-01-24', ret: 2.5 },
          { date: '2023-01-27', ret: 13 },
          { date: '2023-01-31', ret: 5 },
          { date: '2023-02-06', ret: 2.5 },
          { date: '2023-02-14', ret: 1.5 },
        ],
      },
    ],
  },
  {
    id: 'sideways-chop',
    name: 'Sideways chop',
    teaches: 'Overtrading and fees',
    difficulty: 2,
    fictional: true,
    start: '2015-01-02',
    end: '2015-12-31',
    headlines: [
      { date: '2015-01-02', text: 'Strategists expect a flat year as stocks go nowhere fast', tone: 'flat', at: 'open' },
      { date: '2015-03-27', text: 'Stocks grind higher in a choppy quarter', tone: 'up' },
      { date: '2015-07-08', text: 'Growth worries erase the gains of the year', tone: 'down' },
      { date: '2015-10-02', text: 'Sharp swings, little progress: stocks rebound again', tone: 'up' },
      { date: '2015-12-31', text: 'The year ends almost exactly where it started', tone: 'down' },
    ],
    volScale: 1.4,
    market: [
      { date: '2015-03-27', ret: 0.05, regime: 'calm' },
      { date: '2015-07-08', ret: -0.05, regime: 'calm' },
      { date: '2015-10-02', ret: 0.03, regime: 'calm' },
      { date: '2015-12-31', ret: 0, regime: 'calm' },
    ],
  },
  {
    id: 'earnings-season',
    name: 'Earnings season',
    teaches: 'Price gaps, beats vs misses, slippage',
    difficulty: 2,
    fictional: true,
    start: '2024-04-01',
    end: '2024-06-28',
    headlines: [
      { date: '2024-04-01', text: 'Earnings season begins: hundreds of companies report in the coming weeks', tone: 'flat', at: 'open' },
      { date: '2024-06-28', text: 'Quarter ends with stocks modestly higher after a busy earnings season', tone: 'up' },
    ],
    earningsScale: 1.5,
    market: [{ date: '2024-06-28', ret: 0.03, regime: 'calm' }],
  },
];

export function getScenario(id: string): ScenarioDef {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario: ${id}`);
  return s;
}

export interface CustomOptions {
  start: IsoDate;
  days: number;
  startRegime?: Regime;
  volScale?: number;
}

/** Free-running market: no waypoints, the regime chain decides what happens. */
export function customScenario(opts: CustomOptions): ScenarioDef {
  const dates = tradingDaysFrom(opts.start, opts.days);
  return {
    id: 'custom',
    name: 'Custom',
    teaches: 'Free exploration',
    difficulty: 2,
    fictional: true,
    start: dates[0] ?? opts.start,
    end: dates[dates.length - 1] ?? opts.start,
    market: [],
    startRegime: opts.startRegime ?? 'calm',
    volScale: opts.volScale ?? 1,
  };
}

/** Mood implied by how steep a stretch is (annualised log return). */
export function regimeForSlope(annualLogReturn: number): Regime {
  if (annualLogReturn < -1.5) return 'crash';
  if (annualLogReturn < -0.15) return 'bear';
  if (annualLogReturn > 0.35) return 'bull';
  return 'calm';
}

/** Position in a path of closes (0 = before the first day) for a waypoint date. */
function anchorIndex(dates: readonly IsoDate[], date: IsoDate): number {
  const target = toDayNumber(date);
  let idx = -1;
  for (let i = 0; i < dates.length; i++) {
    if (toDayNumber(dates[i] ?? '') <= target) idx = i;
    else break;
  }
  if (idx < 0) throw new Error(`Waypoint ${date} is before the scenario starts`);
  return idx + 1;
}

function toAnchors(dates: readonly IsoDate[], points: readonly { date: IsoDate; value: number }[]): Anchor[] {
  const anchors: Anchor[] = [{ at: 0, value: 0 }];
  for (const p of points) {
    const at = anchorIndex(dates, p.date);
    const prev = anchors[anchors.length - 1];
    if (prev && at <= prev.at) throw new Error(`Waypoint ${p.date} is out of order`);
    anchors.push({ at, value: p.value });
  }
  const last = anchors[anchors.length - 1];
  // Without a final waypoint the stretch after the last one is flat on average.
  if (last && last.at < dates.length) anchors.push({ at: dates.length, value: last.value });
  return anchors;
}

export interface ScenarioMarket {
  dates: IsoDate[];
  regimes: Regime[];
  /** Annualised market volatility per day. */
  vols: number[];
  /** Daily log return of the market factor. */
  returns: number[];
  /** Daily log return of each sector factor (on top of the market). */
  sectors: Record<Sector, number[]>;
}

function diffs(path: Float64Array): number[] {
  const out: number[] = [];
  for (let i = 1; i < path.length; i++) out.push((path[i] ?? 0) - (path[i - 1] ?? 0));
  return out;
}

/** Market and sector factors for a scenario. Same scenario + seed = same market. */
export function buildScenarioMarket(def: ScenarioDef, seed: number): ScenarioMarket {
  const dates = tradingDaysBetween(def.start, def.end);
  const n = dates.length;
  const scale = def.volScale ?? 1;
  let regimes: Regime[];
  let vols: number[];
  let returns: number[];

  if (def.market.length === 0) {
    const free = generateMarketDays({ seed, days: n, start: def.startRegime ?? 'calm' });
    regimes = free.regimes;
    vols = free.vols;
    returns = free.returns;
  } else {
    const anchors = toAnchors(
      dates,
      def.market.map((p) => ({ date: p.date, value: Math.log(1 + p.ret) })),
    );
    regimes = new Array<Regime>(n);
    for (let s = 0; s + 1 < anchors.length; s++) {
      const a = anchors[s];
      const b = anchors[s + 1];
      if (!a || !b) continue;
      const slope = ((b.value - a.value) / (b.at - a.at)) * TRADING_DAYS_PER_YEAR;
      const regime = def.market[s]?.regime ?? regimeForSlope(slope);
      for (let t = a.at; t < b.at; t++) regimes[t] = regime;
    }
    const base = regimes.map((r) => REGIME_PARAMS[r].annualVol * scale);
    const path = volatilityPath(createRng(childSeed(seed, 'market')), base);
    vols = path.vols;
    const variances = vols.map((v) => v * v * DT);
    returns = diffs(bridgeThrough(path.shocks, variances, anchors, MARKET_REVERSION_DAYS));
  }

  const sectors = {} as Record<Sector, number[]>;
  for (const sector of SECTORS) {
    const shocks = sectorShocks(seed, sector, vols);
    const points = def.sectors?.[sector];
    if (!points || points.length === 0) {
      sectors[sector] = shocks;
      continue;
    }
    const variances = vols.map((v) => (SECTOR_VOL * (v / REFERENCE_MARKET_VOL)) ** 2 * DT);
    const anchors = toAnchors(
      dates,
      points.map((p) => ({ date: p.date, value: p.excess })),
    );
    sectors[sector] = diffs(bridgeThrough(shocks, variances, anchors, MARKET_REVERSION_DAYS));
  }

  return { dates, regimes, vols, returns, sectors };
}

/** Closes for a scenario-only stock that follows its own waypoints. */
export function buildSpecialPath(special: SpecialStock, dates: readonly IsoDate[], seed: number): Float64Array {
  const rand = createRng(childSeed(seed, `special:${special.ticker}`));
  const sd = special.vol * Math.sqrt(DT);
  const shocks = dates.map(() => sd * normal(rand));
  const variances = shocks.map(() => sd * sd);
  const anchors = toAnchors(
    dates,
    special.path.map((p) => ({ date: p.date, value: Math.log(1 + p.ret) })),
  );
  const log = bridgeThrough(shocks, variances, anchors);
  return log.map((x) => special.startPrice * Math.exp(x));
}
