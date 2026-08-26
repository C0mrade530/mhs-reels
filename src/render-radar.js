import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { pad3, pngSize, rmrf, ensureDir, fontDataUri } from './utils.js';
import { resolveFonts } from './template.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');

const DATA = path.join(projectDir, 'github-radar-100.json');

/** 179519 → 180k, 17572 → 17.6k, 614 → 614 — как в интерфейсе GitHub */
function short(n) {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  const k = n / 1000;
  return (k < 10 ? k.toFixed(1) : Math.round(k)) + 'k';
}
const OUT = path.join(projectDir, 'output');

const CARD_W = 1080;
const CARD_H = 1920;

/** Подгонка заголовка: длинные строки уменьшаем, но не мельче нижней границы. */
const FIT = {
  headlineMax: 94,
  headlineMin: 54,
  headlineWidth: 856, // уже полосы набора: боковая safe zone Instagram
  descSizes: [42, 40, 38, 36, 34],
  skullSizes: [186, 168, 148, 128],
  minSpacer: 48, // воздух между текстом и карточкой репозитория
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};
const line = () => console.log(c.dim('─'.repeat(64)));

function buildShell() {
  const fonts = resolveFonts();
  const css = fs.readFileSync(path.join(here, 'radar-styles.css'), 'utf8');

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><style>
@font-face { font-family:'MHS Display'; src:url('${fontDataUri(fonts.display)}') format('truetype');
             font-weight:100 900; font-stretch:50% 200%; font-display:block; }
@font-face { font-family:'MHS Text'; src:url('${fontDataUri(fonts.text)}') format('truetype');
             font-weight:100 900; font-display:block; }
${css}
</style></head>
<body>
  <div class="stage" id="stage">
    <div class="rubric" id="rubric">GITHUB-НАХОДКА №01</div>
    <div class="brand">THE MHS</div>
    <div class="skull" id="skull">&#9760;&#65039;</div>
    <div class="headline" id="headline"></div>
    <div class="desc" id="desc"></div>
    <div class="spacer"></div>

    <section class="repo" id="repo">
      <div class="repo-head">
        <div class="repo-name" id="repoName"></div>
        <svg class="repo-mark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
      </div>
      <div class="repo-about" id="repoAbout"></div>
      <div class="repo-rule"></div>
      <div class="stats">
        <div class="stat">
          <div class="stat-top">
            <svg viewBox="0 0 16 16"><path d="M5.5 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM2 8.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Zm.5 4.5A2.5 2.5 0 0 1 5 10.5h1a2.5 2.5 0 0 1 2.5 2.5v1.5h-6V13Zm9-9.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-.5 6h.5a2.5 2.5 0 0 1 2.5 2.5v1.5h-3.2V13c0-1.02-.42-1.95-1.1-2.62.4-.24.86-.38 1.3-.38Z"/></svg>
            <span class="stat-value" id="statContrib"></span>
          </div>
          <div class="stat-label">Contributors</div>
        </div>
        <div class="stat">
          <div class="stat-top">
            <svg viewBox="0 0 16 16"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>
            <span class="stat-value" id="statStars"></span>
          </div>
          <div class="stat-label">Stars</div>
        </div>
        <div class="stat">
          <div class="stat-top">
            <svg viewBox="0 0 16 16"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>
            <span class="stat-value" id="statForks"></span>
          </div>
          <div class="stat-label">Forks</div>
        </div>
      </div>
    </section>
    <div class="spacer-b"></div>
  </div>

<script>
window.renderRadar = (item, cfg) => {
  const root = document.documentElement;
  const stage = document.getElementById('stage');
  const headlineEl = document.getElementById('headline');
  const descEl = document.getElementById('desc');
  const spacerEl = document.querySelector('.spacer');
  const repoEl = document.getElementById('repo');

  document.getElementById('rubric').textContent = 'GITHUB-НАХОДКА №' + item.number;
  headlineEl.textContent = item.headline;
  descEl.textContent = item.description;

  const [owner, name] = item.repo.split('/');
  document.getElementById('repoName').innerHTML =
    owner.replace(/[<>&]/g, '') + '/<b>' + name.replace(/[<>&]/g, '') + '</b>';
  document.getElementById('repoAbout').textContent = item.about || '';
  document.getElementById('statContrib').textContent = item.contributorsText;
  document.getElementById('statStars').textContent = item.starsText;
  document.getElementById('statForks').textContent = item.forksText;

  /* Хук: самая длинная строка должна влезать в полосу набора */
  let headlineSize = cfg.headlineMax;
  const lineFits = () => {
    root.style.setProperty('--headline-size', headlineSize + 'px');
    const r = document.createRange();
    r.selectNodeContents(headlineEl);
    return [...r.getClientRects()].every((b) => b.width <= cfg.headlineWidth);
  };
  while (!lineFits() && headlineSize > cfg.headlineMin) headlineSize -= 2;

  /* Ужимаем описание и череп, только если воздух между блоками съеден */
  let descSize = cfg.descSizes[0];
  let skullSize = cfg.skullSizes[0];
  outer: for (const skull of cfg.skullSizes) {
    root.style.setProperty('--skull-size', skull + 'px');
    for (const size of cfg.descSizes) {
      root.style.setProperty('--desc-size', size + 'px');
      descSize = size;
      skullSize = skull;
      if (spacerEl.getBoundingClientRect().height >= cfg.minSpacer) break outer;
    }
  }

  const repo = repoEl.getBoundingClientRect();
  return {
    headlineSize,
    descSize,
    skullSize,
    spacer: Math.round(spacerEl.getBoundingClientRect().height),
    repoTop: Math.round(repo.top),
    repoBottom: Math.round(repo.bottom),
    overflowY: stage.scrollHeight > 1920,
    overflowX: stage.scrollWidth > 1080,
    hasHeadline: headlineEl.textContent.trim().length > 0,
    hasDesc: descEl.textContent.trim().length > 0,
    hasRepo: document.getElementById('repoName').textContent.includes('/'),
    hasBrand: document.querySelector('.brand').textContent.trim() === 'THE MHS',
    rubricText: document.getElementById('rubric').textContent,
    hasRubric: /GITHUB-НАХОДКА №\\d+/.test(document.getElementById('rubric').textContent),
    hasSkull: document.getElementById('skull').getBoundingClientRect().width > 20,
    hasStats: document.getElementById('statStars').textContent.length > 0,
  };
};
</script></body></html>`;
}

export async function renderRadarCards({ only = null, scale = 1, outDir } = {}) {
  const items = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const cards = outDir || path.join(OUT, scale === 1 ? 'radar-cards' : `radar-cards@${scale}x`);

  const queue = only ? items.filter((i) => only.includes(i.id)) : items;
  if (!only) rmrf(cards);
  ensureDir(cards);

  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
  const page = await browser.newPage({
    viewport: { width: CARD_W, height: CARD_H },
    deviceScaleFactor: scale,
  });
  await page.setContent(buildShell(), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const results = [];
  const problems = [];

  for (const item of queue) {
    const number = item.id >= 100 ? String(item.id) : String(item.id).padStart(2, '0');

    const m = await page.evaluate(
      ([it, cfg]) => window.renderRadar(it, cfg),
      [{
        ...item,
        number,
        starsText: short(item.stars),
        forksText: short(item.forks),
        contributorsText: short(item.contributors),
      }, FIT]
    );

    if (m.overflowX || m.overflowY) problems.push(`#${item.id}: композиция вышла за canvas`);
    if (!m.hasHeadline || !m.hasDesc || !m.hasRepo || !m.hasBrand || !m.hasRubric || !m.hasSkull || !m.hasStats)
      problems.push(`#${item.id}: отсутствует обязательный элемент`);
    if (m.repoBottom > CARD_H) problems.push(`#${item.id}: карточка репозитория за краем`);
    if (m.spacer < 20) problems.push(`#${item.id}: текст прижат к карточке (${m.spacer}px)`);

    const file = path.join(cards, `radar-${pad3(item.id)}.png`);
    await page.screenshot({
      path: file,
      clip: { x: 0, y: 0, width: CARD_W * scale, height: CARD_H * scale },
      type: 'png',
    });
    results.push({ ...m, id: item.id, file });
  }

  await browser.close();
  return { results, problems, cards };
}

async function main() {
  const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
  const scale = Number((process.argv.find((a) => a.startsWith('--scale=')) || '').split('=')[1]) || 1;
  const only = onlyArg ? onlyArg.split(',').map(Number) : null;

  line();
  console.log(c.b('MHS · карточки «GitHub-находка»'));
  line();

  const { results, problems, cards } = await renderRadarCards({ only, scale });

  for (const r of results) {
    if (!only) continue;
    console.log(`  #${r.id}  хук ${r.headlineSize}px  описание ${r.descSize}px  череп ${r.skullSize}px  воздух ${r.spacer}px`);
  }

  console.log(`  Карточек: ${c.ok(String(results.length))} → ${path.relative(projectDir, cards)}/`);
  const dims = new Set(results.map((r) => { const s = pngSize(r.file); return `${s.width}×${s.height}`; }));
  console.log(`  Размер:   ${[...dims].join(', ')}`);

  if (problems.length) {
    console.log(c.err(`\n  Проблемы (${problems.length}):`));
    problems.slice(0, 15).forEach((p) => console.log(c.err(`   · ${p}`)));
    process.exitCode = 1;
  } else {
    console.log(c.ok('\n  Проверка пройдена.'));
  }
  line();
}

if (import.meta.url === `file://${encodeURI(process.argv[1]).replace(/#/g, '%23')}`) {
  await main();
} else if (process.argv[1] && process.argv[1].endsWith('render-radar.js')) {
  await main();
}
