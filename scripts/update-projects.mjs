// Rebuilds the projects table in README.md from repos tagged with the "showcase" topic.
// Runs in GitHub Actions (see .github/workflows/update-projects.yml). Node 20+, no dependencies.
import { readFile, writeFile } from 'node:fs/promises';

const OWNER = process.env.GITHUB_REPOSITORY_OWNER || 'akhiakl';
const TOPIC = process.env.SHOWCASE_TOPIC || 'showcase';
const README = process.env.README_PATH || 'README.md';
const START = '<!-- PROJECTS:START -->';
const END = '<!-- PROJECTS:END -->';

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': OWNER };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function fetchRepos() {
  const q = encodeURIComponent(`user:${OWNER} topic:${TOPIC} fork:false archived:false is:public`);
  const res = await fetch(`https://api.github.com/search/repositories?q=${q}&per_page=100`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const { items } = await res.json();
  return items;
}

// Tag a repo "pinned" to keep it at the top; the rest sort by stars, then most recently pushed.
const sortRepos = (repos) =>
  [...repos].sort(
    (a, b) =>
      Number(b.topics.includes('pinned')) - Number(a.topics.includes('pinned')) ||
      b.stargazers_count - a.stargazers_count ||
      new Date(b.pushed_at) - new Date(a.pushed_at),
  );

const escape = (s) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function linkFor(homepage) {
  if (!homepage) return '';
  const url = /^https?:\/\//.test(homepage) ? homepage : `https://${homepage}`;
  if (/github\.com/.test(url)) return '';
  const label = /npmjs\.com/.test(url) ? 'npm' : 'Live';
  return `[${label} ↗](${url})`;
}

export function renderTable(repos) {
  if (!repos.length) return `_Nothing tagged \`${TOPIC}\` yet._`;
  const rows = sortRepos(repos).map((r) => {
    const name = `[**${r.name}**](${r.html_url})`;
    const desc = r.description ? escape(r.description) : '';
    const meta = [r.language, r.stargazers_count ? `★ ${r.stargazers_count}` : ''].filter(Boolean).join(' · ');
    return `| ${name} | ${desc} | ${[linkFor(r.homepage), meta].filter(Boolean).join('<br>')} |`;
  });
  return ['| Project | What it is | |', '|---|---|---|', ...rows].join('\n');
}

export function replaceSection(readme, body) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error(`Markers ${START} / ${END} not found in ${README}`);
  return `${readme.slice(0, start + START.length)}\n${body}\n${readme.slice(end)}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const readme = await readFile(README, 'utf8');
  const next = replaceSection(readme, renderTable(await fetchRepos()));
  if (next === readme) console.log('Projects table unchanged.');
  else {
    await writeFile(README, next);
    console.log('Projects table updated.');
  }
}
