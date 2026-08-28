import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { pad3, pngSize, rmrf, ensureDir, fontDataUri, findFontFile } from './utils.js';
import { resolveFonts } from './template.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');

const DECKS = path.join(projectDir, 'carousel-decks');
const OUT = path.join(projectDir, 'output');

const W = 1080;
const H = 1350;

export const THEMES = ['invert', 'flood', 'blueprint', 'marker', 'terminal', 'grid'];

/** Моноширинный нужен только теме terminal — без него она откатится на текстовый. */
const MONO_CANDIDATES = ['SFNSMono.ttf', 'Menlo.ttc', 'JetBrainsMono-Regular.ttf', 'Courier New.ttf'];

/* Подгонка: сначала пробуем крупно, ужимаем только если не влезло. */
const FIT = {
  hookMax: 116,
  hookMin: 58,
  lineWidth: 888, // 1080 − 2 × 96
  titleSizes: [78, 72, 68, 64, 60, 56, 52],
  bulletSizes: [37, 36, 35, 34, 33, 32, 31, 30],
  quoteSizes: [84, 80, 76, 72, 68, 64, 60, 56],
  textSizes: [40, 38, 36, 34, 33, 32, 31, 30],
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};
const line = () => console.log(c.dim('─'.repeat(64)));

function buildShell() {
  const fonts = resolveFonts();
  const mono = findFontFile(MONO_CANDIDATES);
  const css = fs.readFileSync(path.join(here, 'carousel-styles.css'), 'utf8');

  const monoFace = mono
    ? `@font-face { font-family:'MHS Mono'; src:url('${fontDataUri(mono)}') format('truetype'); font-display:block; }`
    : '';

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><style>
@font-face { font-family:'MHS Display'; src:url('${fontDataUri(fonts.display)}') format('truetype');
             font-weight:100 900; font-stretch:50% 200%; font-display:block; }
@font-face { font-family:'MHS Text'; src:url('${fontDataUri(fonts.text)}') format('truetype');
             font-weight:100 900; font-display:block; }
${monoFace}
${css}
</style></head>
<body><div class="stage" id="stage"></div>
<script>
/* *текст* → синее выделение. Реализация выделения зависит от темы. */
const mark = (s) => String(s == null ? '' : s)
  .replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]))
  .replace(/\\*(.+?)\\*/g, '<span class="hl">$1</span>');

window.renderSlide = (slide, deck, theme, cfg) => {
  const root = document.documentElement;
  const stage = document.getElementById('stage');

  stage.dataset.theme = theme;
  stage.dataset.type = slide.type;
  root.style.setProperty('--hook-size', cfg.hookMax + 'px');
  root.style.setProperty('--title-size', cfg.titleSizes[0] + 'px');
  root.style.setProperty('--text-size', cfg.textSizes[0] + 'px');
  root.style.setProperty('--bullet-size', cfg.bulletSizes[0] + 'px');
  root.style.setProperty('--quote-size', cfg.quoteSizes[0] + 'px');

  const counter = theme === 'grid'
    ? slide.n + '/' + deck.slideCount
    : String(slide.n).padStart(2, '0') + '/' + String(deck.slideCount).padStart(2, '0');
  const handle = deck.handle || '@mhs.saas';

  let body = '';
  if (slide.type === 'cover') {
    body = '<div class="hook">' + mark(slide.hook) + '</div>' +
           (slide.sub ? '<div class="sub">' + mark(slide.sub) + '</div>' : '');
  } else if (slide.type === 'cta') {
    body =
      '<div class="bridge">' + mark(slide.bridge) + '</div>' +
      '<div class="offer">' + (slide.offer || []).map((o) => '<div class="offer-item">' + mark(o) + '</div>').join('') + '</div>' +
      (slide.why ? '<div class="why">' + mark(slide.why) + '</div>' : '') +
      '<div class="action">' + mark(slide.action) + '</div>' +
      (slide.barrier ? '<div class="barrier">' + mark(slide.barrier) + '</div>' : '');
  } else if (slide.type === 'quote') {
    body =
      '<div class="quote">' + mark(slide.quote) + '</div>' +
      (slide.note ? '<div class="quote-note">' + mark(slide.note) + '</div>' : '');
  } else {
    /* Есть список — показываем список: он читается быстрее абзаца и лучше сохраняется */
    const meat = slide.bullets && slide.bullets.length
      ? '<div class="bullets">' + slide.bullets.map((b) => '<div class="bullet">' + mark(b) + '</div>').join('') + '</div>'
      : '<div class="text">' + mark(slide.body) + '</div>';
    body =
      (slide.kicker ? '<div class="kicker">' + mark(slide.kicker) + '</div>' : '') +
      '<div class="title">' + mark(slide.title) + '</div>' +
      meat +
      (slide.stat ? '<div class="stat">' + mark(slide.stat) + '</div>' : '') +
      (slide.loop ? '<div class="loop">' + mark(slide.loop) + '</div>' : '');
  }

  const last = slide.n === deck.slideCount;
  stage.innerHTML =
    '<div class="deco"></div>' +
    '<header class="top"><div>' + handle + '</div><div class="counter">' + counter + '</div></header>' +
    '<main class="body" id="slideBody">' + body + '</main>' +
    '<footer class="bottom"><div class="brand">THE MHS</div>' +
    '<div class="swipe">' + (last ? '' : slide.type === 'cover' ? 'ЛИСТАЙ →' : '→') + '</div></footer>';

  const bodyEl = document.getElementById('slideBody');

  /* Хук: каждая строка должна влезать в полосу набора */
  let hookSize = cfg.hookMax;
  if (slide.type === 'cover') {
    const hookEl = stage.querySelector('.hook');
    const fits = () => {
      root.style.setProperty('--hook-size', hookSize + 'px');
      const r = document.createRange();
      r.selectNodeContents(hookEl);
      return [...r.getClientRects()].every((b) => b.width <= cfg.lineWidth);
    };
    while (!fits() && hookSize > cfg.hookMin) hookSize -= 2;
  }

  /* Цитата набрана вручную по строкам — подгоняем кегль под полосу */
  let quoteSize = cfg.quoteSizes[0];
  const quoteEl = stage.querySelector('.quote');
  if (quoteEl) {
    for (const q of cfg.quoteSizes) {
      root.style.setProperty('--quote-size', q + 'px');
      quoteSize = q;
      const r = document.createRange();
      r.selectNodeContents(quoteEl);
      if ([...r.getClientRects()].every((b) => b.width <= cfg.lineWidth)) break;
    }
  }

  /* Тело: ужимаем заголовок и текст, пока колонка не перестанет переполняться */
  let titleSize = cfg.titleSizes[0];
  let textSize = cfg.textSizes[0];
  const overflows = () => bodyEl.scrollHeight > bodyEl.clientHeight + 1;
  outer: for (const t of cfg.titleSizes) {
    root.style.setProperty('--title-size', t + 'px');
    for (const s of cfg.textSizes) {
      root.style.setProperty('--text-size', s + 'px');
      titleSize = t; textSize = s;
      if (!overflows()) break outer;
    }
  }

  /* Пункт списка живёт в одну строку — перенос под стрелку рвёт ритм */
  let bulletSize = cfg.bulletSizes[0];
  let bulletWrap = false;
  const items = [...stage.querySelectorAll('.bullet')];
  if (items.length) {
    const oneLine = () => items.every((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return [...r.getClientRects()].filter((b) => b.width > 1).length <= 1;
    });
    for (const b of cfg.bulletSizes) {
      root.style.setProperty('--bullet-size', b + 'px');
      bulletSize = b;
      if (oneLine()) break;
    }
    bulletWrap = !oneLine();
    /* Список мог подрасти — переподбираем колонку */
    for (const t of cfg.titleSizes) {
      root.style.setProperty('--title-size', t + 'px');
      titleSize = t;
      if (bodyEl.scrollHeight <= bodyEl.clientHeight + 1) break;
    }
  }

  const st = stage.getBoundingClientRect();
  return {
    hookSize, titleSize, textSize, bulletSize, bulletWrap, quoteSize,
    overflowY: bodyEl.scrollHeight > bodyEl.clientHeight + 1,
    outsideX: stage.scrollWidth > ${W},
    outsideY: stage.scrollHeight > ${H},
    hasBrand: stage.querySelector('.brand').textContent.trim() === 'THE MHS',
    hasCounter: /\\d+\\/\\d+/.test(stage.querySelector('.counter').textContent),
    textLen: bodyEl.textContent.trim().length,
    w: Math.round(st.width), h: Math.round(st.height),
  };
};
</script></body></html>`;
}

function loadDecks(only) {
  if (!fs.existsSync(DECKS)) return [];
  return fs
    .readdirSync(DECKS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DECKS, f), 'utf8')))
    .filter((d) => (only ? only.includes(d.id) : true))
    .sort((a, b) => a.id - b.id);
}

/** Проверки, которые ловят брак до Instagram, а не после. */
function auditDeck(deck) {
  const problems = [];
  const n = deck.slides.length;
  if (n !== deck.slideCount) problems.push(`колода #${deck.id}: slideCount ${deck.slideCount}, слайдов ${n}`);
  if (n < 3 || n > 11) problems.push(`колода #${deck.id}: ${n} слайдов — вне диапазона 3…11`);
  if (deck.slides[0]?.type !== 'cover') problems.push(`колода #${deck.id}: первый слайд не обложка`);
  const last = deck.slides[n - 1];
  if (last?.type !== 'cta') problems.push(`колода #${deck.id}: последний слайд не CTA — лид-магнит обязателен`);
  if (last?.type === 'cta' && !last.action) problems.push(`колода #${deck.id}: в CTA нет действия`);
  if (deck.caption && deck.caption.length > 1800) problems.push(`колода #${deck.id}: подпись ${deck.caption.length} знаков`);
  return problems;
}

export async function renderCarousels({ only = null, scale = 1, theme = null, outRoot = null } = {}) {
  const decks = loadDecks(only);
  if (!decks.length) throw new Error('Нет колод в carousel-decks/. Сначала отработает агент carousel-structure.');

  const root = outRoot || path.join(OUT, scale === 1 ? 'carousel-cards' : `carousel-cards@${scale}x`);

  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  await page.setContent(buildShell(), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const results = [];
  const problems = [];

  for (const deck of decks) {
    problems.push(...auditDeck(deck));
    const useTheme = theme || deck.theme || 'invert';
    if (!THEMES.includes(useTheme)) problems.push(`колода #${deck.id}: неизвестный дизайн «${useTheme}»`);

    const dir = path.join(root, `deck-${pad3(deck.id)}${theme ? '-' + theme : ''}`);
    rmrf(dir);
    ensureDir(dir);

    for (const slide of deck.slides) {
      const m = await page.evaluate(
        ([s, d, t, cfg]) => window.renderSlide(s, d, t, cfg),
        [slide, { slideCount: deck.slideCount, handle: deck.handle }, useTheme, FIT]
      );

      if (m.outsideX || m.outsideY) problems.push(`#${deck.id}/${slide.n}: слайд вышел за холст`);
      if (m.overflowY) problems.push(`#${deck.id}/${slide.n}: текст не влез даже на минимальном кегле`);
      if (!m.hasBrand || !m.hasCounter) problems.push(`#${deck.id}/${slide.n}: нет подписи или счётчика`);
      if (m.textLen < 20) problems.push(`#${deck.id}/${slide.n}: слайд почти пустой`);
      if (m.bulletWrap) problems.push(`#${deck.id}/${slide.n}: пункт списка не влез в строку — сократите до 46 знаков`);

      const file = path.join(dir, `slide-${String(slide.n).padStart(2, '0')}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W * scale, height: H * scale }, type: 'png' });
      results.push({ ...m, deck: deck.id, n: slide.n, type: slide.type, theme: useTheme, file });
    }

    if (deck.caption) {
      fs.writeFileSync(path.join(dir, 'caption.txt'),
        deck.caption + '\n\n' + (deck.hashtags || []).join(' ') + '\n', 'utf8');
    }
    if (deck.topicId || deck.slideCountWhy) {
      fs.writeFileSync(path.join(dir, 'about.txt'),
        [`Колода #${deck.id}`, deck.rubric ? `Рубрика: ${deck.rubric}` : '',
         `Слайдов: ${deck.slideCount}`, deck.slideCountWhy ? `Почему столько: ${deck.slideCountWhy}` : '',
         deck.theme ? `Дизайн: ${deck.theme}` : ''].filter(Boolean).join('\n') + '\n', 'utf8');
    }
  }

  await browser.close();
  return { results, problems, root, decks };
}

/** Лист превью: слайды одной колоды в ряд, чтобы оценить ритм целиком. */
export async function contactSheet(files, out, { cols = 6, cell = 300, label = '' } = {}) {
  const gap = 14;
  const rows = Math.ceil(files.length / cols);
  const cellH = Math.round((cell * H) / W);
  const width = cols * cell + (cols + 1) * gap;
  const height = rows * cellH + (rows + 1) * gap + (label ? 78 : 0);

  const imgs = files
    .map((f) => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">`)
    .join('');

  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#101014;font-family:-apple-system,Inter,sans-serif}
    h1{margin:0;padding:26px ${gap}px 8px;color:#fff;font-size:26px;letter-spacing:.16em;text-transform:uppercase}
    .grid{display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:${gap}px;padding:${gap}px}
    img{width:${cell}px;height:${cellH}px;display:block;border:1px solid #26262c}
  </style>${label ? `<h1>${label}</h1>` : ''}<div class="grid">${imgs}</div>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  return out;
}

/** Сравнение дизайнов: колонка — тема, ряд — обложка / слайд тела / CTA. */
export async function compareSheet(deckId, out, { cell = 300, picks = [1, 3, 6, null] } = {}) {
  const gap = 16;
  const cellH = Math.round((cell * H) / W);
  const cols = THEMES.length;

  const deck = loadDecks([deckId])[0];
  const last = deck.slideCount;

  const columns = THEMES.map((t) => {
    const dir = path.join(OUT, 'carousel-cards', `deck-${pad3(deckId)}-${t}`);
    const files = picks.map((n) => path.join(dir, `slide-${String(n || last).padStart(2, '0')}.png`));
    return { theme: t, files };
  });

  const head = columns
    .map((c) => `<div class="head">${c.theme}</div>`)
    .join('');
  const cells = picks.map((_, i) => i)
    .map((row) => columns
      .map((c) => `<img src="data:image/png;base64,${fs.readFileSync(c.files[row]).toString('base64')}">`)
      .join(''))
    .join('');

  const width = cols * cell + (cols + 1) * gap;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#0b0b0e;font-family:-apple-system,Inter,sans-serif}
    h1{margin:0;padding:30px ${gap}px 6px;color:#fff;font-size:28px;letter-spacing:.14em;text-transform:uppercase}
    p{margin:0;padding:0 ${gap}px 18px;color:#8a8a95;font-size:19px}
    .grid{display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:${gap}px;padding:${gap}px}
    .head{color:#1b4dff;font-size:22px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;padding-bottom:2px}
    img{width:${cell}px;height:${cellH}px;display:block;border:1px solid #25252c}
  </style>
  <h1>${cols} дизайнов · колода #${deckId}</h1>
  <p>Ряды: обложка · слайд со списком · слайд-цитата · финальный слайд с лид-магнитом</p>
  <div class="grid">${head}${cells}</div>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 600 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  return out;
}

async function main() {
  const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
  const only = arg('only') ? arg('only').split(',').map(Number) : null;
  const scale = Number(arg('scale')) || 1;
  const theme = arg('theme') || null;
  const allThemes = process.argv.includes('--themes');

  line();
  console.log(c.b('MHS · карусели 1080×1350'));
  line();

  const themes = allThemes ? THEMES : [theme];
  let failed = 0;

  for (const t of themes) {
    const { results, problems, root, decks } = await renderCarousels({ only, scale, theme: t });
    const label = t ? `дизайн ${t}` : 'дизайн из колоды';
    console.log(`  ${label}: ${c.ok(String(results.length))} слайдов, колод ${decks.length}`);

    if (true) {
      for (const deck of decks) {
        const files = results.filter((r) => r.deck === deck.id).map((r) => r.file);
        const sheetName = `deck-${pad3(deck.id)}${t ? '-' + t : ''}.png`;
        const sheet = path.join(OUT, 'carousel-previews', sheetName);
        ensureDir(path.dirname(sheet));
        await contactSheet(files, sheet, { label: `${t || deck.theme} · колода #${deck.id} · ${files.length} слайдов` });
        const inDeck = path.join(root, `deck-${pad3(deck.id)}${t ? '-' + t : ''}`, '_превью.png');
        if (fs.existsSync(path.dirname(inDeck))) fs.copyFileSync(sheet, inDeck);
        console.log(c.dim(`    лист → ${path.relative(projectDir, sheet)}`));
      }
    }

    if (problems.length) {
      failed += problems.length;
      console.log(c.err(`    проблемы (${problems.length}):`));
      [...new Set(problems)].slice(0, 12).forEach((p) => console.log(c.err(`     · ${p}`)));
    }
    const dims = new Set(results.map((r) => { const s = pngSize(r.file); return `${s.width}×${s.height}`; }));
    console.log(c.dim(`    размер ${[...dims].join(', ')} → ${path.relative(projectDir, root)}/`));
  }

  if (allThemes && only) {
    for (const id of only) {
      const out = path.join(OUT, 'carousel-previews', `compare-deck-${pad3(id)}.png`);
      await compareSheet(id, out);
      console.log(`  Сравнение дизайнов → ${path.relative(projectDir, out)}`);
    }
  }

  if (failed) { console.log(c.err(`\n  Проверка не пройдена: ${failed}`)); process.exitCode = 1; }
  else console.log(c.ok('\n  Проверка пройдена.'));
  line();
}

if (process.argv[1] && process.argv[1].endsWith('render-carousel.js')) await main();
