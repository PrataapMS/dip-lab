import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Side } from '../engine/account';
import { halfSpread } from '../engine/costs';
import { BARS_PER_DAY } from '../engine/intraday';
import { describeOrder, type OrderDraft, type OrderType, type TimeInForce } from '../engine/orders';
import type { Activity, InstrumentInfo } from '../engine/protocol';
import { orderXpHint } from '../game/hints';
import { money, shares as fmtShares } from './format';
import { cents, parseAmount, previewOrder, riskCheck } from './orderPreview';
import { Term } from './Term';
import type { Market } from './useMarket';
import { today, useProgress } from './useProgress';

const EXPLAIN: Record<OrderType, (side: Side) => string> = {
  market: () => 'Market: trade right now at the current price. You pay a tiny extra called the spread.',
  limit: (side) =>
    side === 'buy'
      ? 'Limit: only buy at your price or lower. If the price never drops that far, nothing happens.'
      : 'Limit: only sell at your price or higher. If the price never rises that far, nothing happens.',
  stop: (side) =>
    side === 'sell'
      ? 'Stop-loss: if the price falls to your stop, sell automatically to cap the loss. If it gaps lower overnight, you get the gap price.'
      : 'Stop: buy automatically if the price rises to your level, e.g. to catch a breakout.',
};

const DOLLAR_CHIPS = [100, 500, 1_000];
const SHARE_CHIPS = [1, 5, 10];

interface Props {
  market: Market;
  inst: InstrumentInfo;
  initialSide: Side;
  onClose: () => void;
}

/** Bottom sheet for placing an order. Pauses the clock while open. */
export function OrderSheet({ market, inst, initialSide, onClose }: Props) {
  const { view, send } = market;
  const i = view.tickerIndex.get(inst.ticker) ?? -1;
  const price = view.prices[i] ?? 0;
  const account = view.account;
  const cash = account?.cash ?? 0;
  const held = account?.positions.find((p) => p.ticker === inst.ticker);
  const heldShares = held?.shares ?? 0;
  const settings = view.settings;
  const commission = settings?.commission ?? 0;
  const margin = !!settings?.margin;
  const canShort = margin && !!settings?.shorts;
  const power = margin ? (account?.buyingPower ?? 0) : cash;
  const startAmount = () => String(Math.max(0, Math.min(1_000, Math.floor(power - commission))));
  const half = settings ? halfSpread(inst, view.marketVol, settings) : 0;

  const [side, setSide] = useState<Side>(initialSide);
  // Closing a position starts with all of it; opening one starts with a dollar amount.
  const closing = (s: Side) => (s === 'sell' ? heldShares > 0 : heldShares < 0);
  const [unit, setUnit] = useState<'dollars' | 'shares'>(closing(initialSide) ? 'shares' : 'dollars');
  const [amountText, setAmountText] = useState(() =>
    closing(initialSide) ? String(Number(Math.abs(heldShares).toFixed(6))) : startAmount(),
  );
  const [type, setType] = useState<OrderType>('market');
  const [tif, setTif] = useState<TimeInForce>('day');
  const [limitText, setLimitText] = useState('');
  const [stopText, setStopText] = useState('');
  const [explain, setExplain] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  // Pause while deciding; resume on close if the clock was running.
  useEffect(() => {
    const wasPlaying = view.playing;
    if (wasPlaying) send({ type: 'pause' });
    dialog.current?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus();
    return () => {
      if (wasPlaying) send({ type: 'play' });
    };
    // Only on open and close.
  }, []);

  const pickType = (t: OrderType) => {
    setType(t);
    // Sensible starting prices: a limit a little better than now, a stop a little worse.
    if (t === 'limit' && !limitText) setLimitText(cents(price * (side === 'buy' ? 0.98 : 1.02)).toFixed(2));
    if (t === 'stop' && !stopText) setStopText(cents(price * (side === 'sell' ? 0.95 : 1.05)).toFixed(2));
  };

  const pickSide = (s: Side) => {
    setSide(s);
    setLimitText('');
    setStopText('');
    if (type !== 'market') {
      if (type === 'limit') setLimitText(cents(price * (s === 'buy' ? 0.98 : 1.02)).toFixed(2));
      else setStopText(cents(price * (s === 'sell' ? 0.95 : 1.05)).toFixed(2));
    }
    if (closing(s)) {
      setUnit('shares');
      setAmountText(String(Number(Math.abs(heldShares).toFixed(6))));
    } else {
      setUnit('dollars');
      setAmountText(startAmount());
    }
  };

  const amount = parseAmount(amountText);
  const limitPrice = type === 'limit' ? parseAmount(limitText) : undefined;
  const stopPrice = type === 'stop' ? parseAmount(stopText) : undefined;
  const preview = previewOrder({
    side,
    type,
    unit,
    amount,
    price,
    half,
    limitPrice,
    stopPrice,
    cash,
    heldShares,
    commission,
    ...(margin ? { buyingPower: power } : {}),
    canShort,
  });
  const shorting = side === 'sell' && heldShares <= 0;
  const covering = side === 'buy' && heldShares < 0;
  const risk = riskCheck({
    side: shorting ? 'buy' : covering ? 'sell' : side,
    ticker: inst.ticker,
    kind: inst.kind,
    vol: inst.vol,
    orderValue: preview.estShares * preview.fillPrice,
    heldValue: Math.abs(held?.value ?? 0),
    accountValue: account?.value ?? cash,
    closesPosition: closing(side) && preview.estShares >= Math.abs(heldShares) - 1e-6,
  });
  const draft: OrderDraft = useMemo(
    () => ({
      ticker: inst.ticker,
      side,
      type,
      amount: { kind: unit, value: amount },
      ...(type === 'limit' ? { limitPrice } : {}),
      ...(type === 'stop' ? { stopPrice } : {}),
      tif: type === 'market' ? 'day' : tif,
    }),
    [inst.ticker, side, type, unit, amount, limitPrice, stopPrice, tif],
  );
  const closed = view.bar >= BARS_PER_DAY;
  const { progress } = useProgress();
  const xpHint = useMemo(() => {
    const short = side === 'sell' ? heldShares <= 0 : heldShares < 0;
    const would: Activity[] = [{ kind: 'order', type, side, ticker: inst.ticker, short }];
    if (type === 'market' || preview.fillsNow) {
      would.push({ kind: 'fill', ticker: inst.ticker, side, orderType: type, etf: inst.kind === 'etf', short, forced: false, realised: 0, day: view.day });
    }
    return orderXpHint(progress, today(), would);
  }, [progress, type, side, heldShares, inst.ticker, inst.kind, preview.fillsNow, view.day]);

  const setMax = () => {
    if (!closing(side)) {
      setUnit('dollars');
      setAmountText(String(Math.max(0, Math.floor((power - commission) * 100) / 100)));
    } else {
      setUnit('shares');
      setAmountText(String(Number(Math.abs(heldShares).toFixed(6))));
    }
  };

  const confirm = () => {
    if (preview.problem) return;
    send({ type: 'placeOrder', draft });
    onClose();
  };

  const stopLabel = (side === 'sell' && !shorting) || covering ? 'Stop-loss' : 'Stop';
  const spreadNote = (
    <>
      ({side === 'buy' ? '+' : '−'}
      <Term id="spread">spread</Term>)
    </>
  );

  return (
    <div class="sheet-layer">
      <button type="button" class="scrim" aria-label="Close order sheet" onClick={onClose} />
      <div
        ref={dialog}
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${covering ? 'Buy to cover' : side === 'buy' ? 'Buy' : shorting ? 'Short' : 'Sell'} ${inst.ticker}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div class="grabber" aria-hidden="true" />

        <div class="segmented side" role="group" aria-label="Buy or sell">
          <button type="button" aria-pressed={side === 'buy'} onClick={() => pickSide('buy')}>
            {heldShares < 0 ? 'Cover' : 'Buy'}
          </button>
          <button type="button" aria-pressed={side === 'sell'} disabled={heldShares <= 0 && !canShort} onClick={() => pickSide('sell')}>
            {heldShares <= 0 && canShort ? 'Short' : 'Sell'}
          </button>
        </div>

        <div class="field">
          <div class="row">
            <label for="order-amount" class="field-label">
              Amount
            </label>
            <div class="units" role="group" aria-label="Amount unit">
              <button type="button" aria-pressed={unit === 'dollars'} onClick={() => setUnit('dollars')}>
                $
              </button>
              <button type="button" aria-pressed={unit === 'shares'} onClick={() => setUnit('shares')}>
                shares
              </button>
            </div>
          </div>
          <div class="amount">
            {unit === 'dollars' && <span aria-hidden="true">$</span>}
            <input
              id="order-amount"
              inputMode="decimal"
              value={amountText}
              onInput={(e) => setAmountText((e.target as HTMLInputElement).value)}
              autocomplete="off"
            />
          </div>
          <div class="chips quick" role="group" aria-label="Quick amounts">
            {(unit === 'dollars' ? DOLLAR_CHIPS : SHARE_CHIPS).map((v) => (
              <button key={v} type="button" class="chip" onClick={() => setAmountText(String(v))}>
                {unit === 'dollars' ? money(v) : `${v} sh`}
              </button>
            ))}
            <button type="button" class="chip" onClick={setMax}>
              Max
            </button>
          </div>
        </div>

        <div class="field">
          <div class="row baseline">
            <span class="field-label">Order type</span>
            <button type="button" class="link" aria-expanded={explain} onClick={() => setExplain(!explain)}>
              ? explain like I'm new
            </button>
          </div>
          <div class="types" role="group" aria-label="Order type">
            <button type="button" aria-pressed={type === 'market'} onClick={() => pickType('market')}>
              Market
            </button>
            <button type="button" aria-pressed={type === 'limit'} onClick={() => pickType('limit')}>
              Limit
            </button>
            <button type="button" aria-pressed={type === 'stop'} onClick={() => pickType('stop')}>
              {stopLabel}
            </button>
          </div>
          {explain && <p class="small dim explain">{EXPLAIN[type](side)}</p>}
        </div>

        {type !== 'market' && (
          <div class="trigger">
            <label class="field">
              <span class="field-label">
                {type === 'limit' ? <Term id="limit-order">Limit price</Term> : <Term id="stop-loss">Stop price</Term>}
              </span>
              <input
                inputMode="decimal"
                value={type === 'limit' ? limitText : stopText}
                onInput={(e) => (type === 'limit' ? setLimitText : setStopText)((e.target as HTMLInputElement).value)}
              />
            </label>
            <div class="field">
              <span class="field-label">
                <Term id="time-in-force">Lasts</Term>
              </span>
              <div class="segmented" role="group" aria-label="How long the order lasts">
                <button type="button" aria-pressed={tif === 'day'} onClick={() => setTif('day')}>
                  today
                </button>
                <button type="button" aria-pressed={tif === 'gtc'} onClick={() => setTif('gtc')}>
                  until cancelled
                </button>
              </div>
            </div>
          </div>
        )}

        <div class="terminal mono" role="group" aria-label="Order preview">
          <div class="row">
            <span class="dim">&gt; est_shares</span>
            <span>{fmtShares(preview.estShares)}</span>
          </div>
          <div class="row">
            <span class="dim">&gt; fill_price</span>
            <span>
              {money(preview.fillPrice, true)} <span class="dim">{type === 'limit' && !preview.fillsNow ? '(or better)' : spreadNote}</span>
            </span>
          </div>
          {type !== 'market' && (
            <div class="row">
              <span class="dim">&gt; trigger</span>
              <span>{preview.fillsNow && !closed ? 'already reached: fills now' : 'waits for the price'}</span>
            </div>
          )}
          <div class="row">
            <span class="dim">&gt; cash_after</span>
            <span>{money(preview.cashAfter, true)}</span>
          </div>
          {margin && side === 'buy' && (
            <div class="row">
              <span class="dim">
                &gt; <Term id="buying-power">buying_power</Term>
              </span>
              <span>{money(power, true)}</span>
            </div>
          )}
          {shorting && (
            <p class="tiny warn">
              You <Term id="short-selling">borrow {inst.ticker} shares and sell them</Term>. You make money if {inst.ticker} falls; if it rises, your loss has no
              ceiling. Borrow fee {inst.ticker === 'MOONR' ? '30' : '0.5'}% a year, and you pay its dividends.
            </p>
          )}
          {preview.borrowed > 0 && (
            <p class="tiny warn">
              {money(preview.borrowed, true)} of this is <Term id="margin">borrowed</Term> at {Math.round((settings?.marginRate ?? 0.08) * 100)}% a year. Losses on
              it are yours too.
            </p>
          )}
          {closed && <p class="tiny warn">Market closed: this fills at the next open, which can gap.</p>}
        </div>

        <div class="field">
          <div class="row tiny-gap">
            <span class="field-label">
              <Term id="risk-check">Risk check</Term>
            </span>
            <span class={`mono small risk-${risk.level}`}>{risk.label}</span>
          </div>
          <div class={`meter risk-${risk.level}`} aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} class={n <= risk.level ? 'on' : ''} />
            ))}
          </div>
          <p class="small dim">{risk.text}</p>
        </div>

        <div class="stack gap-6">
          <button type="button" class="primary confirm" disabled={!!preview.problem} onClick={confirm}>
            {preview.problem ?? describeOrder(draft, heldShares)}
            {!preview.problem && xpHint && <span class="xp-label mono">{xpHint}</span>}
          </button>
          <button type="button" class="link cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
