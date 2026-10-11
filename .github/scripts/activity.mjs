// Renders dist/stats.svg and dist/activity.svg from the GitHub contribution
// calendar so the profile does not depend on third-party stats services.
// Usage: GITHUB_TOKEN=... node activity.mjs <login> [--demo]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [login = 'hoaimyn05', flag] = process.argv.slice(2);

const C = {
  bg: '#121016', card: '#16131a', line: '#2b2520', cream: '#f6efe7',
  muted: '#a7a09b', dim: '#6d6762', orange: '#ff7a1f', amber: '#ffb35c',
};

async function fetchData() {
  if (flag === '--demo') {
    const days = [];
    const start = Date.UTC(2025, 9, 12);
    for (let i = 0; i < 365; i++) {
      const n = Math.max(0, Math.round(Math.sin(i / 9) * 4 + Math.random() * 6 - 1));
      days.push({ date: new Date(start + i * 864e5).toISOString().slice(0, 10), count: n });
    }
    return { days, commits: 412, prs: 9, repos: 2, followers: 0 };
  }
  const query = `query($login:String!){user(login:$login){
    followers{totalCount}
    repositories(ownerAffiliations:OWNER){totalCount}
    contributionsCollection{totalCommitContributions totalPullRequestContributions restrictedContributionsCount
      contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  const u = json.data.user;
  const cc = u.contributionsCollection;
  const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));
  return {
    days,
    commits: cc.totalCommitContributions + cc.restrictedContributionsCount,
    prs: cc.totalPullRequestContributions,
    repos: u.repositories.totalCount,
    followers: u.followers.totalCount,
  };
}

function streaks(days) {
  let longest = 0, run = 0;
  for (const d of days) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--; // today may simply not have activity yet
  let current = 0;
  for (; i >= 0 && days[i].count > 0; i--) current++;
  return { current, longest };
}

const font = (file) => readFileSync(join(here, 'fonts', file)).toString('base64');
const FONT_CSS = `@font-face{font-family:'SG';font-weight:700;src:url(data:font/woff2;base64,${font('SpaceGrotesk-700-normal.woff2')}) format('woff2')}
@font-face{font-family:'JB';font-weight:500;src:url(data:font/woff2;base64,${font('JetBrainsMono-500-normal.woff2')}) format('woff2')}
.sg{font-family:'SG','Segoe UI',Helvetica,Arial,sans-serif;font-weight:700}
.jb{font-family:'JB',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:500}
.draw{stroke-dasharray:3000;stroke-dashoffset:3000;animation:draw 2.4s ease-out forwards}@keyframes draw{to{stroke-dashoffset:0}}
.pulse{animation:pulse 2s ease-in-out infinite}@keyframes pulse{50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;stroke-dashoffset:0!important}}`;

const DEFS = `<linearGradient id="hot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5e1a"/><stop offset="1" stop-color="#ffb35c"/></linearGradient>
<linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a1f" stop-opacity=".45"/><stop offset="1" stop-color="#ff7a1f" stop-opacity="0"/></linearGradient>
<linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16131a"/><stop offset=".6" stop-color="#121016"/><stop offset="1" stop-color="#1a110b"/></linearGradient>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function frame(w, h) {
  const c = 26;
  const d = `M${c + 2} 2H${w - c - 2}L${w - 2} ${c + 2}V${h - 2}H${c + 2}L2 ${h - c - 2}V2Z`;
  return `<path d="${d}" fill="url(#bgg)" stroke="${C.line}" stroke-width="1.5"/>
<path d="M${w - c - 6} 10L${w - 10} ${c + 6}M10 ${h - c - 6}L${c + 6} ${h - 10}" stroke="${C.orange}" stroke-width="2"/>`;
}

const wrap = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><defs>${DEFS}<style>${FONT_CSS}</style></defs>${frame(w, h)}${body}</svg>`;

function statsSvg(data, s) {
  const year = data.days.reduce((a, d) => a + d.count, 0);
  const tiles = [
    [year, 'CONTRIBUTIONS', 'last 12 months'],
    [data.commits, 'COMMITS', 'last 12 months'],
    [s.current, 'CURRENT STREAK', `days · best ${s.longest}`],
    [data.prs, 'PULL REQUESTS', `${data.repos} repos`],
  ];
  const W = 1200, H = 190, tw = (W - 80) / 4;
  let b = '';
  tiles.forEach(([v, label, sub], i) => {
    const x = 40 + i * tw;
    if (i) b += `<path d="M${x} 44V146" stroke="${C.line}"/>`;
    b += `<text x="${x + 24}" y="62" class="jb" font-size="13" fill="${C.muted}" letter-spacing="2">${label}</text>`;
    b += `<text x="${x + 22}" y="124" class="sg" font-size="56" fill="url(#hot)" letter-spacing="-2">${esc(v)}</text>`;
    b += `<text x="${x + 24}" y="152" class="jb" font-size="13" fill="${C.dim}">${esc(sub)}</text>`;
  });
  return wrap(W, H, `GitHub stats: ${year} contributions, current streak ${s.current} days`, b);
}

function activitySvg(data) {
  const days = data.days.slice(-31);
  const W = 1200, H = 380, L = 80, R = 1150, T = 110, B = 320;
  const max = Math.ceil(Math.max(4, ...days.map((d) => d.count)) / 4) * 4;
  const x = (i) => L + (i * (R - L)) / (days.length - 1);
  const y = (v) => B - (v / max) * (B - T);
  const pts = days.map((d, i) => [x(i), y(d.count)]);
  let line = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], mx = (px + cx) / 2;
    line += ` C${mx} ${py} ${mx} ${cy} ${cx} ${cy}`;
  }
  const total = days.reduce((a, d) => a + d.count, 0);
  let b = `<text x="40" y="58" class="jb" font-size="14" fill="${C.orange}" letter-spacing="3">CONTRIBUTION ACTIVITY</text>`;
  b += `<text x="1160" y="58" class="jb" font-size="14" fill="${C.muted}" text-anchor="end" letter-spacing="2">LAST 31 DAYS · ${total} CONTRIBUTIONS</text>`;
  for (let k = 0; k <= 4; k++) {
    const v = Math.round((max * k) / 4), yy = y(v);
    b += `<path d="M${L} ${yy}H${R}" stroke="${C.line}" stroke-dasharray="${k ? '3 6' : ''}"/>`;
    b += `<text x="${L - 14}" y="${yy + 4}" class="jb" font-size="12" fill="${C.dim}" text-anchor="end">${v}</text>`;
  }
  b += `<path d="${line} L${R} ${B} L${L} ${B}Z" fill="url(#area)"/>`;
  b += `<path d="${line}" fill="none" stroke="url(#hot)" stroke-width="3" stroke-linecap="round" class="draw"/>`;
  pts.forEach(([px, py], i) => {
    const hot = days[i].count === max && max > 0;
    b += `<circle cx="${px}" cy="${py}" r="${hot ? 6 : 3.5}" fill="${hot ? C.amber : C.bg}" stroke="${C.orange}" stroke-width="2"${hot ? ' class="pulse"' : ''}/>`;
    if (i % 5 === 0 || i === days.length - 1) {
      b += `<text x="${px}" y="${B + 30}" class="jb" font-size="12" fill="${C.dim}" text-anchor="middle">${days[i].date.slice(5).replace('-', '/')}</text>`;
    }
  });
  return wrap(W, H, `Contribution activity: ${total} contributions in the last 31 days`, b);
}

const data = await fetchData();
const s = streaks(data.days);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/stats.svg', statsSvg(data, s));
writeFileSync('dist/activity.svg', activitySvg(data));
console.log('wrote dist/stats.svg and dist/activity.svg', s);
