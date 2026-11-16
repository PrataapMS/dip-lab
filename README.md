# Dip Lab

An offline, gamified stock market simulator. Pick a market, trade it, see how you did against
simply buying the index, then replay the exact same market with a better plan.

Prices are simulated. Nothing here is investment advice.

## Run it

Requires Node 20+.

```bash
npm ci
npm run dev
```

Checks that CI runs on every push:

```bash
npm run typecheck && npm test && npm run build
```

## Releases

The app is published to GitHub Pages only when the major version in `package.json` goes up on
`main` (for example `0.x` to `1.0.0`). Other pushes run CI only. A deploy can also be started
manually from the Actions tab.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).
