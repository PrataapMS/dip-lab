// Assembles the landing page (site/) into dist/welcome/, next to the built app.
// Run after `npm run build`: the app's service worker never precaches these files.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'dist/welcome';
const FONTS = [
  'space-grotesk/files/space-grotesk-latin-400-normal.woff2',
  'space-grotesk/files/space-grotesk-latin-500-normal.woff2',
  'space-grotesk/files/space-grotesk-latin-700-normal.woff2',
  'jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2',
  'jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2',
  'silkscreen/files/silkscreen-latin-400-normal.woff2',
];

rmSync(OUT, { recursive: true, force: true });
cpSync('site', OUT, { recursive: true });
cpSync('public/icon.svg', join(OUT, 'icon.svg'));

mkdirSync(join(OUT, 'fonts'), { recursive: true });
for (const font of FONTS) {
  cpSync(join('node_modules/@fontsource', font), join(OUT, 'fonts', font.split('/').pop()));
}

mkdirSync(join(OUT, 'shots'), { recursive: true });
for (const shot of readdirSync('docs/assets').filter((f) => f.endsWith('.png'))) {
  cpSync(join('docs/assets', shot), join(OUT, 'shots', shot));
}

console.log(`Landing page assembled in ${OUT}/`);
