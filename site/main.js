// Dip Lab landing page. Plain JS, no dependencies, no network calls.
// Everything that looks like market data here is simulated, like the game itself.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const SVG = 'http://www.w3.org/2000/svg';
const MINUS = '−';

/** Small seeded RNG (mulberry32), so the demo market replays exactly. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r) {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** A path that passes through the waypoints [day, value] with seeded bridge noise between them. */
function bridgePath(waypoints, seed, vol) {
  const r = rng(seed);
  const out = [];
  for (let w = 0; w < waypoints.length - 1; w++) {
    const [d0, v0] = waypoints[w];
    const [d1, v1] = waypoints[w + 1];
    const n = d1 - d0;
    let walk = 0;
    const steps = [0];
    for (let i = 1; i <= n; i++) {
      walk += gauss(r) * vol;
      steps.push(walk);
    }
    for (let i = w === 0 ? 0 : 1; i <= n; i++) {
      const t = i / n;
      const base = Math.log(v0) + (Math.log(v1) - Math.log(v0)) * t;
      const noise = steps[i] - steps[n] * t;
      out.push(Math.exp(base + noise));
    }
  }
  return out;
}

const signed = (x, digits = 1) => `${x >= 0 ? '+' : MINUS}${Math.abs(x).toFixed(digits)}%`;
const money = (x) =>
  `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/* ---------- ticker tape ---------- */

function tape() {
  const track = $('#tape');
  if (!track) return;
  const names = [
    'SPY',
    'AAPL',
    'NVDA',
    'MSFT',
    'AMZN',
    'TSLA',
    'META',
    'GOOGL',
    'NFLX',
    'JPM',
    'KO',
    'DIS',
    'NKE',
    'AMD',
    'COST',
    'XOM',
    'QQQ',
    'V',
    'MCD',
    'SBUX',
  ];
  const r = rng(42);
  const items = names.map((t) => {
    const ch = gauss(r) * 1.8;
    const cls = ch >= 0 ? 'up' : 'down';
    const arrow = ch >= 0 ? '▲' : '▼';
    return `<span><b>${t}</b><span class="${cls}">${arrow} ${signed(ch, 2)}</span></span>`;
  });
  track.innerHTML = items.join('') + items.join('');
}

/* ---------- hero chart ---------- */

function heroChart() {
  const svg = $('#hero-chart');
  if (!svg) return;
  const W = 1200;
  const H = 600;
  const main = bridgePath(
    [
      [0, 100],
      [40, 112],
      [70, 64],
      [110, 92],
      [150, 86],
      [200, 140],
    ],
    7,
    0.025,
  );
  const ghost = bridgePath(
    [
      [0, 104],
      [40, 110],
      [70, 60],
      [110, 70],
      [150, 62],
      [200, 66],
    ],
    11,
    0.02,
  );
  const lo = 50;
  const hi = 150;
  const pts = (arr) =>
    arr
      .map(
        (v, i) =>
          `${((i / (arr.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / (hi - lo)) * H).toFixed(1)}`,
      )
      .join(' ');
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'hc-grad', x1: '0', x2: '0', y1: '0', y2: '1' }, defs);
  el('stop', { offset: '0', 'stop-color': '#c6ff3d', 'stop-opacity': '0.35' }, grad);
  el('stop', { offset: '1', 'stop-color': '#c6ff3d', 'stop-opacity': '0' }, grad);
  el('polyline', { class: 'hc-ghost', points: pts(ghost) }, svg);
  el('polygon', { class: 'hc-area', points: `0,${H} ${pts(main)} ${W},${H}` }, svg);
  const line = el('polyline', { class: 'hc-line', points: pts(main) }, svg);
  if (!reduced && line.getTotalLength) {
    const len = 4000;
    line.style.strokeDasharray = `${len}`;
    line.style.strokeDashoffset = `${len}`;
    line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: 2600,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'forwards',
    });
  }
}

/* ---------- nav, progress, reveal, counters ---------- */

function chrome() {
  const nav = $('#nav');
  const bar = $('#progress');
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    nav?.classList.toggle('scrolled', window.scrollY > 10);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const links = $$('.nav-links a');
  const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  const spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        for (const a of links)
          a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`);
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  for (const s of sections) spy.observe(s);

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
        const n = e.target.querySelector('[data-count]');
        if (n) countUp(n);
      }
    },
    { threshold: 0.15 },
  );
  // Stagger siblings that reveal together.
  for (const group of [$$('.stats .reveal'), $$('.bento .reveal')]) {
    group.forEach((node, i) => {
      node.style.setProperty('--d', `${(i % 6) * 0.07}s`);
    });
  }
  for (const node of $$('.reveal')) io.observe(node);
}

function countUp(node) {
  const target = Number(node.dataset.count);
  if (reduced) {
    node.textContent = target.toLocaleString('en-US');
    return;
  }
  const start = performance.now();
  const dur = 1300;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - (1 - t) ** 4;
    node.textContent = Math.round(target * eased).toLocaleString('en-US');
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- pointer niceties ---------- */

function pointer() {
  if (!finePointer || reduced) return;
  for (const b of $$('.magnetic')) {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty('--mx', `${(e.clientX - r.left - r.width / 2) * 0.2}px`);
      b.style.setProperty('--my', `${(e.clientY - r.top - r.height / 2) * 0.3}px`);
    });
    b.addEventListener('pointerleave', () => {
      b.style.setProperty('--mx', '0px');
      b.style.setProperty('--my', '0px');
    });
  }
  for (const c of $$('.card')) {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--x', `${e.clientX - r.left}px`);
      c.style.setProperty('--y', `${e.clientY - r.top}px`);
    });
  }
  const hero = $('.hero');
  const phone = $('#hero-phone');
  if (hero && phone) {
    hero.addEventListener('pointermove', (e) => {
      if (window.innerWidth <= 960) return;
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      phone.style.transform = `rotateY(${-14 + x * 14}deg) rotateX(${6 - y * 10}deg) rotateZ(1deg)`;
    });
    hero.addEventListener('pointerleave', () => {
      phone.style.transform = '';
    });
  }
}

/* ---------- demo: buy the dip ---------- */

function demo() {
  const root = $('#demo');
  if (!root) return;
  const DAYS = 220;
  const START = 10_000;
  const SPEED = { 1: 6, 2: 12, 4: 24, 8: 48 }; // trading days per second
  const HEADLINES = [
    [16, 'News: a new virus spreads; travel stocks slide'],
    [30, 'Circuit breaker: trading halted for 15 minutes'],
    [44, 'Central bank cuts rates to zero'],
    [70, 'Reopening hopes lift stocks off the lows'],
    [140, 'Vaccine trial results beat expectations'],
    [200, 'Index closes at a record high'],
  ];
  const svg = $('#d-svg');
  const VW = 800;
  const VH = 280;
  const ui = {
    price: $('#d-price'),
    change: $('#d-change'),
    day: $('#d-day'),
    seed: $('#d-seed'),
    play: $('#d-play'),
    trade: $('#d-trade'),
    headline: $('#d-headline'),
    result: $('#d-result'),
    you: $('#r-you'),
    spy: $('#r-spy'),
    msg: $('#r-msg'),
  };

  let seed = 2020;
  let prices = [];
  let state;
  let ghost = null;
  let speed = 2;
  let playing = false;
  let last = 0;
  let headlineTimer = 0;
  let domain = [0.6, 1.2];

  function build() {
    prices = bridgePath(
      [
        [0, 100],
        [22, 104],
        [45, 67],
        [80, 86],
        [150, 97],
        [DAYS, 113],
      ],
      seed,
      0.016,
    );
  }

  function reset() {
    state = { t: 0, day: 0, cash: START, shares: 0, trades: [], equity: [START], done: false };
    domain = [0.6, 1.2];
    ui.result.hidden = true;
    ui.seed.textContent = String(seed);
    setTrade();
    setPlay(false);
    say('Press ▶ to start the clock');
    render();
  }

  function say(text) {
    ui.headline.textContent = text;
    ui.headline.classList.add('show');
    clearTimeout(headlineTimer);
    headlineTimer = setTimeout(() => ui.headline.classList.remove('show'), 3200);
  }

  function setPlay(on) {
    playing = on;
    ui.play.innerHTML = `<span aria-hidden="true">${on ? '❚❚' : '▶'}</span>`;
    ui.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (on) {
      last = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function setTrade() {
    const holding = state.shares > 0;
    ui.trade.textContent = holding
      ? 'Sell all SPY'
      : `Buy ${money(state.cash).replace('.00', '')} of SPY`;
    ui.trade.classList.toggle('sell', holding);
    ui.trade.disabled = state.done;
  }

  function trade() {
    if (state.done) return;
    const p = prices[state.day];
    if (state.shares > 0) {
      state.cash += state.shares * p;
      state.shares = 0;
      state.trades.push({ day: state.day, side: 'sell' });
    } else {
      state.shares = state.cash / p;
      state.cash = 0;
      state.trades.push({ day: state.day, side: 'buy' });
    }
    state.equity[state.day] = state.cash + state.shares * p;
    setTrade();
    render();
  }

  function loop(now) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    state.t = Math.min(DAYS, state.t + dt * SPEED[speed]);
    const target = Math.floor(state.t);
    while (state.day < target) {
      state.day++;
      state.equity[state.day] = state.cash + state.shares * prices[state.day];
      for (const [d, text] of HEADLINES) if (d === state.day) say(text);
    }
    render();
    if (state.day >= DAYS) {
      finish();
      return;
    }
    requestAnimationFrame(loop);
  }

  function finish() {
    state.done = true;
    setPlay(false);
    setTrade();
    const you = (state.equity[DAYS] / START - 1) * 100;
    const spy = (prices[DAYS] / prices[0] - 1) * 100;
    ui.you.textContent = signed(you);
    ui.you.className = `mono ${you >= 0 ? 'up' : 'down'}`;
    ui.spy.textContent = signed(spy);
    ui.spy.className = `mono ${spy >= 0 ? 'up' : 'down'}`;
    const gap = Math.abs(you - spy).toFixed(1);
    if (state.trades.length === 0) {
      ui.msg.textContent =
        'You sat in cash the whole run. Safe, but buy-and-hold beat you. Hit Replay and try buying the dip.';
    } else if (you > spy) {
      ui.msg.textContent = `You beat buy-and-hold by ${gap} points with ${state.trades.length} trade${state.trades.length > 1 ? 's' : ''}. In the full game you're graded on risk and discipline too.`;
      confetti();
    } else {
      ui.msg.textContent = `Buy-and-hold won by ${gap} points this time. Same market, new try: hit Replay and see if a different plan works.`;
    }
    ui.result.hidden = false;
    ghost = state.equity.slice();
  }

  function render() {
    const d = state.day;
    const p = prices[d];
    ui.price.textContent = money(p);
    const ch = (p / prices[0] - 1) * 100;
    ui.change.textContent = signed(ch, 2);
    ui.change.className = `mono ${ch >= 0 ? 'up' : 'down'}`;
    ui.day.textContent = String(d);

    // Ease the y range towards what's on screen, in units of starting equity.
    let lo = 1;
    let hi = 1;
    for (let i = 0; i <= d; i++) {
      const s = prices[i] / prices[0];
      const y = state.equity[i] / START;
      lo = Math.min(lo, s, y);
      hi = Math.max(hi, s, y);
    }
    if (ghost)
      for (const g of ghost) {
        lo = Math.min(lo, g / START);
        hi = Math.max(hi, g / START);
      }
    const pad = (hi - lo) * 0.12 + 0.02;
    domain = [
      domain[0] + (Math.min(lo - pad, 0.95) - domain[0]) * 0.2,
      domain[1] + (Math.max(hi + pad, 1.05) - domain[1]) * 0.2,
    ];
    const x = (i) => (i / DAYS) * VW;
    const y = (v) => VH - ((v - domain[0]) / (domain[1] - domain[0])) * VH;
    const line = (arr, n, f) => {
      let s = '';
      for (let i = 0; i <= n; i++) s += `${x(i).toFixed(1)},${y(f(arr[i])).toFixed(1)} `;
      return s;
    };

    svg.replaceChildren();
    el('line', { class: 'd-base', x1: 0, x2: VW, y1: y(1), y2: y(1) }, svg);
    if (ghost)
      el('polyline', { class: 'd-ghost', points: line(ghost, DAYS, (v) => v / START) }, svg);
    el('polyline', { class: 'd-spy', points: line(prices, d, (v) => v / prices[0]) }, svg);
    el('polyline', { class: 'd-you', points: line(state.equity, d, (v) => v / START) }, svg);
    for (const t of state.trades) {
      const tx = x(t.day);
      const ty = y(state.equity[t.day] / START);
      const up = t.side === 'buy';
      el(
        'path',
        {
          d: up ? `M${tx} ${ty + 8} l7 12 h-14 z` : `M${tx} ${ty - 8} l7 -12 h-14 z`,
          fill: up ? '#c6ff3d' : '#ff5c8a',
        },
        svg,
      );
    }
    const hy = y(state.equity[d] / START);
    el('circle', { cx: x(d), cy: hy, r: 9, fill: '#c6ff3d', opacity: 0.25 }, svg);
    el('circle', { cx: x(d), cy: hy, r: 4, fill: '#c6ff3d' }, svg);
  }

  ui.play.addEventListener('click', () => {
    if (state.done) {
      reset();
      setPlay(true);
      return;
    }
    setPlay(!playing);
  });
  ui.trade.addEventListener('click', trade);
  for (const b of $$('.speed', root)) {
    b.addEventListener('click', () => {
      speed = Number(b.dataset.speed);
      for (const o of $$('.speed', root)) o.classList.toggle('on', o === b);
    });
  }
  $('#d-replay').addEventListener('click', () => {
    reset();
    say('Replay: same seed, same market. Only you change.');
    setPlay(true);
  });
  $('#d-new').addEventListener('click', () => {
    seed = 1000 + Math.floor(Math.random() * 9000);
    ghost = null;
    build();
    reset();
    setPlay(true);
  });

  build();
  reset();
}

/* ---------- getting started steps ---------- */

function steps() {
  const list = $$('.step');
  const img = $('#step-img');
  const dots = $('#step-dots');
  if (!list.length || !img || !dots) return;
  for (const [i, s] of list.entries()) {
    const dot = document.createElement('span');
    dot.title = `Step ${i + 1}`;
    dots.appendChild(dot);
    dot.addEventListener('click', () => s.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  const dotEls = $$('span', dots);
  let current = -1;
  const activate = (i) => {
    if (i === current) return;
    current = i;
    list.forEach((s, j) => {
      s.classList.toggle('on', j === i);
      dotEls[j].classList.toggle('on', j === i);
    });
    const src = `shots/${list[i].dataset.shot}`;
    if (img.getAttribute('src') === src) return;
    img.classList.add('swap');
    setTimeout(() => {
      img.src = src;
      img.onload = () => img.classList.remove('swap');
    }, 180);
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) activate(list.indexOf(e.target));
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  for (const s of list) io.observe(s);
  activate(0);
}

/* ---------- scenarios ---------- */

function scenarios() {
  const grid = $('#scen-grid');
  if (!grid) return;
  const list = [
    [
      'First steps',
      'Made-up · 3 months',
      1,
      false,
      'Orders, charts, profit and loss',
      [100, 103, 101, 106, 108],
    ],
    [
      'The long bull',
      '2010 to 2019',
      1,
      false,
      'Compounding and buy-and-hold',
      [100, 92, 120, 140, 135, 180, 210, 200, 260, 290],
    ],
    [
      'Sideways chop',
      'Made-up · 1 year',
      2,
      false,
      'Overtrading and fees',
      [100, 105, 96, 104, 95, 103, 98, 101],
    ],
    [
      'Earnings season',
      'Made-up · 3 months',
      2,
      false,
      'Price gaps, beats vs misses',
      [100, 104, 95, 106, 98, 109],
    ],
    [
      'COVID crash and rebound',
      'Feb to Dec 2020',
      3,
      false,
      'How fast crashes happen',
      [100, 104, 66, 85, 95, 112],
    ],
    [
      '2022 rate shock',
      'Jan to Dec 2022',
      3,
      false,
      'Interest rates, bear-market rallies',
      [100, 90, 82, 92, 77, 86, 81],
    ],
    [
      'Dot-com bubble',
      'Jan 1998 to Oct 2002',
      4,
      true,
      'Valuation, hype, concentration',
      [100, 130, 175, 150, 120, 85, 60, 52],
    ],
    [
      '2008 financial crisis',
      'Oct 2007 to Mar 2009',
      4,
      true,
      'Diversification, panic selling',
      [100, 92, 86, 88, 70, 54, 45],
    ],
    [
      'Meme squeeze',
      'Made-up · 6 weeks',
      5,
      true,
      'Short squeezes, extreme volatility',
      [100, 110, 380, 240, 560, 160, 90],
    ],
    ['Custom', 'Any start, 1998 to 2024', 0, false, 'Pick the mood, length and seed', null],
  ];
  for (const [i, [name, period, diff, boss, teaches, shape]] of list.entries()) {
    const card = document.createElement('article');
    card.className = `scen reveal${boss ? ' boss' : ''}`;
    card.style.setProperty('--d', `${(i % 3) * 0.08}s`);
    const pips = diff
      ? `<span class="pips" aria-label="Difficulty ${diff} of 5">${[1, 2, 3, 4, 5]
          .map((k) => `<i class="${k <= diff ? 'on' : ''}"></i>`)
          .join('')}</span>`
      : '<span class="mono small dim">your call</span>';
    card.innerHTML = `<div class="scen-top"><h3>${name}${boss ? ' <span aria-label="boss run">💀</span>' : ''}</h3>${pips}</div><p class="period">${period}</p>`;
    const svg = el('svg', {
      viewBox: '0 0 300 64',
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
    });
    const W = 300;
    const H = 64;
    if (shape) {
      const wps = shape.map((v, k) => [Math.round((k / (shape.length - 1)) * 60), v]);
      const path = bridgePath(wps, 100 + i, boss ? 0.04 : 0.02);
      const lo = Math.min(...path);
      const hi = Math.max(...path);
      const pts = path.map(
        (v, k) =>
          `${((k / (path.length - 1)) * W).toFixed(1)},${(H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8)).toFixed(1)}`,
      );
      const color = path[path.length - 1] >= path[0] ? '#c6ff3d' : '#ff5c8a';
      el('path', { class: 'area', d: `M0,${H} L${pts.join(' L')} L${W},${H} Z`, fill: color }, svg);
      el('path', { d: `M${pts.join(' L')}`, stroke: color }, svg);
    } else {
      el(
        'path',
        {
          d: 'M0,40 C60,10 90,60 150,32 S240,20 300,28',
          stroke: '#a08bff',
          'stroke-dasharray': '6 6',
        },
        svg,
      );
    }
    card.appendChild(svg);
    const p = document.createElement('p');
    p.className = 'teaches';
    p.textContent = teaches;
    card.appendChild(p);
    grid.appendChild(card);
  }
}

/* ---------- install tabs ---------- */

function tabs() {
  const tabList = $$('[role="tab"]');
  const select = (tab) => {
    for (const t of tabList) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    }
  };
  tabList.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = tabList[(i + step + tabList.length) % tabList.length];
      select(next);
      next.focus();
    });
  });
  // Open the tab that matches this device.
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) select($('#tab-ios'));
  else if (/Android/.test(ua)) select($('#tab-android'));
  else if (!/Mobi/.test(ua)) select($('#tab-desktop'));
}

/* ---------- toast, confetti, easter egg ---------- */

let toastTimer = 0;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function confetti() {
  if (reduced) return;
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#c6ff3d', '#ff5c8a', '#a08bff', '#ffb23d'];
  const bits = Array.from({ length: 140 }, () => ({
    x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: window.innerHeight * 0.6,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 18 - 6,
    w: 5 + Math.random() * 5,
    h: 10 + Math.random() * 14,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = (now) => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const b of bits) {
      b.vy += 0.45;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      // A tiny candlestick: wick plus body.
      ctx.fillRect(-0.75, -b.h * 0.8, 1.5, b.h * 1.6);
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (now - start < 3500) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  };
  requestAnimationFrame(frame);
}

function easterEgg() {
  let buffer = '';
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.key.length !== 1) return;
    buffer = (buffer + e.key.toLowerCase()).slice(-3);
    if (buffer === 'dip') {
      buffer = '';
      confetti();
      toast('🏅 Secret badge: Dip Detector. Now go find a real one ▶');
    }
  });
}

tape();
heroChart();
scenarios();
chrome();
pointer();
demo();
steps();
tabs();
easterEgg();
