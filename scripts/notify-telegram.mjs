// Reports a GitHub Pages deploy on Telegram. Run by GitHub Actions (deploy.yml); never part of the app build.
//
//   node scripts/notify-telegram.mjs
//
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID; without them it prints the message and exits.
// Reads DEPLOY_RESULT, RELEASE_RESULT, SITE_URL, RUN_URL, GITHUB_SERVER_URL and GITHUB_REPOSITORY.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TELEGRAM_LIMIT = 4096;
const MAX_BULLETS = 8;
const ATTEMPTS = 4;
const RETRY_DELAY_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;

const env = (name, fallback = '') => process.env[name] || fallback;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const link = (url, label) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;

function bulletList(items) {
  const shown = items.slice(0, MAX_BULLETS).map((item) => `• ${escapeHtml(item)}`);
  if (items.length > MAX_BULLETS) shown.push(`• and ${items.length - MAX_BULLETS} more`);
  return shown.join('\n');
}

/** The newest version tag below this one, or undefined for the first release. */
function previousTag(tag) {
  return git('tag', '--list', 'v[0-9]*', '--merged', 'HEAD', '--sort=-v:refname')
    .split('\n')
    .find((t) => t && t !== tag);
}

function message() {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const tag = `v${version}`;
  const deploy = env('DEPLOY_RESULT', 'success');
  const release = env('RELEASE_RESULT', 'success');
  const runUrl = env('RUN_URL');
  const siteUrl = env('SITE_URL');
  const repoUrl =
    env('GITHUB_SERVER_URL') && env('GITHUB_REPOSITORY')
      ? `${env('GITHUB_SERVER_URL')}/${env('GITHUB_REPOSITORY')}`
      : '';

  if (deploy !== 'success') {
    const outcome = deploy === 'cancelled' ? 'was cancelled' : 'failed';
    const lines = [
      `❌ <b>Dip Lab ${escapeHtml(tag)}</b> deploy ${outcome}`,
      '',
      'GitHub Pages still serves the previous version.',
    ];
    if (runUrl) lines.push('', link(runUrl, 'Open the workflow run'));
    return lines.join('\n');
  }

  const since = previousTag(tag);
  const commits = git('log', '--no-merges', '--format=%s', since ? `${since}..HEAD` : '-1')
    .split('\n')
    .filter(Boolean);
  const lines = [`🚀 <b>Dip Lab ${escapeHtml(tag)}</b> is live on GitHub Pages`, ''];
  if (since) {
    const count = commits.length === 1 ? '1 commit' : `${commits.length} commits`;
    lines.push(`${count} since ${escapeHtml(since)}:`);
  }
  lines.push(bulletList(commits));
  if (release !== 'success') {
    lines.push('', `⚠️ The ${escapeHtml(tag)} tag and GitHub Release were not created.`);
  }
  const links = [];
  if (siteUrl) links.push(link(siteUrl, 'Open Dip Lab'));
  if (repoUrl && release === 'success') {
    links.push(link(`${repoUrl}/releases/tag/${tag}`, 'Release notes'));
  }
  if (repoUrl && since) links.push(link(`${repoUrl}/compare/${since}...${tag}`, 'Changes'));
  if (links.length) lines.push('', links.join(' · '));
  return lines.join('\n');
}

async function send(text) {
  const token = env('TELEGRAM_BOT_TOKEN');
  const chatId = env('TELEGRAM_CHAT_ID');
  if (!token || !chatId) {
    console.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set; skipping the notification.');
    console.info(text);
    return;
  }
  // Telegram rejects messages over 4096 characters. Cut on a line break so no HTML tag is split.
  let body = text;
  if (body.length > TELEGRAM_LIMIT) {
    body = body.slice(0, TELEGRAM_LIMIT - 20);
    body = `${body.slice(0, body.lastIndexOf('\n'))}\n…`;
  }
  const request = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: body,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }),
    signal: undefined,
  };
  // Telegram sometimes answers 429 or 5xx (e.g. 504 Gateway Timeout); those are worth retrying.
  for (let attempt = 1; ; attempt++) {
    let failure;
    let retryable = true;
    let waitMs = RETRY_DELAY_MS * attempt;
    try {
      request.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, request);
      if (response.ok) {
        console.info('Sent to Telegram.');
        return;
      }
      const text = await response.text();
      failure = `${response.status} ${text}`;
      retryable = response.status === 429 || response.status >= 500;
      const retryAfter = Number(/"retry_after":\s*(\d+)/.exec(text)?.[1]);
      if (retryAfter > 0) waitMs = retryAfter * 1000;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (!retryable || attempt >= ATTEMPTS) {
      throw new Error(`Telegram sendMessage failed: ${failure}`);
    }
    console.warn(`Telegram attempt ${attempt} failed (${failure}); retrying.`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

await send(message());
