/**
 * Short lessons for the Learn tab: a few cards each, then one question. Finishing one (the
 * question answered right) pays XP the first time and counts toward quests and the streak.
 * Plain words, no advice: everything is about how markets work, shown in simulated markets.
 */

export interface LessonCheck {
  question: string;
  options: string[];
  /** Index of the right option. */
  answer: number;
  /** Shown after answering. */
  explain: string;
}

export interface Lesson {
  id: string;
  title: string;
  cards: string[];
  check: LessonCheck;
  /** A scenario to try it in. */
  tryIt?: string;
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'what-is-a-stock',
    title: 'What a stock is',
    cards: [
      'A stock is a slice of a company. Buy one share and you own a tiny part of its future profits.',
      'Prices move because buyers and sellers keep changing their minds about what those profits will be. News, earnings and the mood of the whole market all push on it.',
      'A share price alone says nothing about value. A $500 share is not expensive and a $5 share is not cheap; it depends on how many shares there are and what the company earns.',
    ],
    check: {
      question: 'What do you own when you buy a share?',
      options: [
        'A loan to the company',
        'A small part of the company',
        'A promise of a fixed return',
      ],
      answer: 1,
      explain: 'A share is part-ownership. Nothing is promised: the price can rise or fall.',
    },
    tryIt: 'first-steps',
  },
  {
    id: 'orders',
    title: 'Market, limit and stop orders',
    cards: [
      'A market order trades right now at the current price. It always fills, and you pay the spread.',
      'A limit order names your price: buy at that price or lower, sell at that price or higher. If the market never gets there, nothing happens.',
      'A stop-loss sells automatically if the price falls to your level. It limits a loss, but it is not a guaranteed price: if the stock opens far below your stop, you sell near that open.',
      'Orders placed while the market is closed wait for the next open, and the open can be far from the last close.',
    ],
    check: {
      question:
        'Your stop-loss is at $90. Bad news overnight, and the stock opens at $82. Where do you sell?',
      options: ['Exactly $90', 'Near $82', 'Nothing happens'],
      answer: 1,
      explain:
        'The stop triggers at the open, and the best price then is around $82. That gap is called slippage.',
    },
    tryIt: 'earnings-season',
  },
  {
    id: 'costs',
    title: 'Spreads and fees',
    cards: [
      'Every stock has two prices: the bid (what buyers pay) and the ask (what sellers want). You buy at the ask and sell at the bid.',
      'The gap is the spread. On a big fund it is a hundredth of a percent; on a jumpy small stock, much more, and spreads widen in a panic.',
      'Some brokers also charge a commission per trade. Both costs are small once and large when you trade every day.',
    ],
    check: {
      question: 'You buy and then sell a stock straight away, with no price change. What happens?',
      options: ['You break even', 'You lose the spread (and any fees)', 'You make the spread'],
      answer: 1,
      explain: 'You bought at the ask and sold at the bid. The round trip cost you the spread.',
    },
    tryIt: 'sideways-chop',
  },
  {
    id: 'index-funds',
    title: 'Index funds and SPY',
    cards: [
      'An index tracks a slice of the market. The S&P 500 follows 500 of the largest US companies.',
      'A fund like SPY holds all of them, so one purchase spreads your money across the whole index.',
      'Most professional stock pickers fail to beat their index over long periods, mainly because of costs and mistakes. That is why Dip Lab scores you against buy-and-hold SPY.',
    ],
    check: {
      question: 'Why is buy-and-hold SPY a tough benchmark?',
      options: [
        'It can never fall',
        'It is cheap, spread out and never panics',
        'It only holds winners',
      ],
      answer: 1,
      explain:
        'SPY can fall a lot. It is hard to beat because it costs almost nothing and never sells at the bottom.',
    },
    tryIt: 'long-bull',
  },
  {
    id: 'diversification',
    title: 'Diversification',
    cards: [
      'Any single company can have a terrible year: a failed product, a lawsuit, a bad earnings report.',
      'Owning many companies in different sectors means one disaster is a small dent, not a crater.',
      'Ten tech stocks are not ten bets; they tend to move together. Spread across sectors, or use a fund.',
      'The run grade caps all-in bets: one stock over 50% of your account means the best grade is a B, whatever happens.',
    ],
    check: {
      question: 'Which is more spread out?',
      options: ['Ten large tech stocks', 'One broad index fund', 'Your single favourite stock'],
      answer: 1,
      explain: 'A broad fund holds hundreds of companies across every sector.',
    },
    tryIt: 'dot-com',
  },
  {
    id: 'risk-and-drawdowns',
    title: 'Volatility and drawdowns',
    cards: [
      'Volatility is how much a price swings. High-volatility stocks can double, or halve.',
      'A drawdown is a fall from a peak. The maths is unkind: a 50% fall needs a 100% gain to get back.',
      'Big drawdowns are when people give up and sell. Keeping them smaller makes it easier to stay invested.',
    ],
    check: {
      question: 'Your account falls 50%. What gain gets it back to where it was?',
      options: ['50%', '75%', '100%'],
      answer: 2,
      explain: '$10,000 → $5,000. Getting back to $10,000 means doubling $5,000: a 100% gain.',
    },
    tryIt: 'covid-2020',
  },
  {
    id: 'earnings-and-gaps',
    title: 'Earnings and gaps',
    cards: [
      'Every quarter, companies report sales and profits, usually before the open or after the close.',
      'Prices react at the next open, often with a gap: the price jumps straight past everything in between.',
      'What matters is the result against expectations. A company can beat estimates and still fall if the outlook disappoints.',
    ],
    check: {
      question: 'A company beats its earnings estimates. What happens to the stock?',
      options: ['It always rises', 'It can rise or fall', 'It doesn’t move'],
      answer: 1,
      explain:
        'Expectations were already in the price. Guidance and surprises in the details move it too.',
    },
    tryIt: 'earnings-season',
  },
  {
    id: 'dividends',
    title: 'Dividends and compounding',
    cards: [
      'Many companies pay part of their profit as cash every quarter: the dividend.',
      'To get it you must own the stock before the ex-dividend date. That morning the price drops by about the dividend, so there is no free money in buying the day before.',
      'Reinvested over decades, dividends are a big part of what stocks return. Dip Lab’s SPY benchmark includes them.',
    ],
    check: {
      question: 'What happens to the price on the ex-dividend date?',
      options: ['It rises by the dividend', 'It drops by about the dividend', 'Nothing'],
      answer: 1,
      explain: 'The cash leaves the company, so its shares are worth that much less.',
    },
    tryIt: 'long-bull',
  },
  {
    id: 'time-in-the-market',
    title: 'Panic selling and time in the market',
    cards: [
      'Crashes feel like they will never end. That is exactly when people sell, often near the bottom.',
      'Some of the best days in market history came within weeks of the worst ones. Missing a few of them hurts long-term returns badly.',
      'Bear markets also have sharp rallies that fade. Nobody rings a bell at the bottom.',
      'The debrief flags "sold near the low" moments, and "replay day N" lets you try that day again.',
    ],
    check: {
      question: 'Why does selling in a crash often hurt?',
      options: [
        'Fees are higher in crashes',
        'You lock in the loss and often miss the rebound',
        'It is against the rules',
      ],
      answer: 1,
      explain:
        'Selling makes the loss permanent, and rebounds tend to come fast and without warning.',
    },
    tryIt: 'covid-2020',
  },
  {
    id: 'survivorship-bias',
    title: 'Survivorship bias',
    cards: [
      'Today’s list of big companies only includes the ones that survived. The ones that went bust quietly dropped off.',
      'Looking back, it is easy to say "just buy the big names". Back then, some of the big names were the ones about to fail.',
      'Dip Lab’s stock list is today’s list, so its past markets flatter stock pickers a little. Keep that in mind when a strategy looks easy.',
    ],
    check: {
      question: 'Why do past results from today’s company list look too good?',
      options: [
        'Prices were lower then',
        'Companies that failed are missing from it',
        'Dividends were higher',
      ],
      answer: 1,
      explain:
        'Only survivors are on today’s list, so the failures that would have hurt are left out.',
    },
  },
  {
    id: 'margin',
    title: 'Margin: borrowing to invest',
    cards: [
      'With margin, your broker lends you money to buy more: up to twice your own cash.',
      'Gains and losses are both doubled, and you pay interest every day on the loan.',
      'If your equity falls under 30% of what you hold, the broker makes a margin call. Fix it by the next close, or it sells for you, usually at a bad price.',
      'A 50% fall at 2x wipes out everything you put in.',
    ],
    check: {
      question:
        'You hold $20,000 of stock with $10,000 of your own money. The stock falls 25%. What is your equity now?',
      options: ['$7,500', '$5,000', '$10,000'],
      answer: 1,
      explain:
        'Holdings are worth $15,000, you still owe $10,000: $5,000 left. A 25% fall cost you half your money.',
    },
    tryIt: 'covid-2020',
  },
  {
    id: 'short-selling',
    title: 'Short selling',
    cards: [
      'Shorting means borrowing shares, selling them now, and buying them back later to return them.',
      'If the price falls, you buy back cheaper and keep the difference. If it rises, you pay more than you sold for.',
      'A stock can only fall to zero, but it can rise without limit, so a short’s loss has no ceiling.',
      'You also pay a daily fee to borrow the shares, and any dividends. When many people are short and the price rises, they all rush to buy back: a short squeeze.',
    ],
    check: {
      question: 'You short a stock at $20 and it rises to $60. What have you lost per share?',
      options: [
        '$20, the most you can lose',
        '$40, and it could be more',
        'Nothing until you buy back',
      ],
      answer: 1,
      explain:
        'You owe shares now worth $60 against $20 received. The loss keeps growing while the price rises.',
    },
    tryIt: 'meme-squeeze',
  },
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
