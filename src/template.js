import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFontFile, fontDataUri } from './utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 *  Локальные шрифты (никаких сетевых запросов)
 *  Display — узкий тяжёлый гротеск под заголовок.
 *  Text    — нейтральный modern sans под промпт и подпись.
 * ------------------------------------------------------------------ */

const DISPLAY_CANDIDATES = [
  'Roboto-VariableFont_wdth,wght.ttf', // вариативный: ось wdth даёт настоящий condensed
  'RobotoCondensed-VariableFont_wght.ttf',
  'RobotoCondensed-Bold.ttf',
  'Arial Narrow Bold.ttf',
  'DIN Condensed Bold.ttf',
];

const TEXT_CANDIDATES = [
  'Inter-VariableFont_opsz,wght.ttf',
  'Inter-VariableFont_slnt,wght.ttf',
  'Roboto-VariableFont_wdth,wght.ttf',
  'Helvetica.ttc',
];

export function resolveFonts() {
  const display = findFontFile(DISPLAY_CANDIDATES);
  const text = findFontFile(TEXT_CANDIDATES);
  if (!display || !text) {
    throw new Error(
      'Не найдены локальные шрифты. Ожидались Roboto/Inter в ~/Library/Fonts или системные Arial Narrow / Helvetica.'
    );
  }
  return { display, text };
}

/**
 * Каркас страницы. Загружается в браузер ОДИН раз,
 * дальше карточки перерисовываются через window.renderCard().
 */
export function buildShell() {
  const fonts = resolveFonts();
  const css = fs.readFileSync(path.join(here, 'styles.css'), 'utf8');

  return {
    fonts,
    html: `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'MHS Display';
  src: url('${fontDataUri(fonts.display)}') format('truetype');
  font-weight: 100 900;
  font-stretch: 50% 200%;
  font-display: block;
}
@font-face {
  font-family: 'MHS Text';
  src: url('${fontDataUri(fonts.text)}') format('truetype');
  font-weight: 100 900;
  font-display: block;
}
${css}
</style>
</head>
<body>
  <div class="stage" id="stage">

    <header class="header">
      <div class="title" id="title">СЕКРЕТНЫЙ ПРОМПТ #01</div>
      <div class="mhs">THE MHS</div>
    </header>

    <div class="middle" id="middle">
      <div class="skull" id="skull">&#9760;&#65039;</div>
    </div>

    <section class="card" id="card">
      <div class="prompt" id="prompt">
        <span class="close">
          <svg viewBox="0 0 24 24"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/></svg>
        </span>
        <span id="promptText"></span>
      </div>
      <div class="controls">
        <span class="btn btn-plus">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        </span>
        <span class="btn btn-send">
          <svg viewBox="0 0 24 24"><path d="M2.2 21.4 23 12 2.2 2.6 2.2 9.9 17 12 2.2 14.1z"/></svg>
        </span>
      </div>
    </section>

  </div>

<script>
/* ---------------------------------------------------------------- *
 *  Подгонка композиции под конкретный промпт.
 *  Принцип из ТЗ: сначала растим высоту блока, и только если места
 *  под череп уже не остаётся — аккуратно уменьшаем кегль.
 * ---------------------------------------------------------------- */
window.renderCard = (item, cfg) => {
  const root = document.documentElement;
  const stage = document.getElementById('stage');
  const titleEl = document.getElementById('title');
  const middleEl = document.getElementById('middle');
  const cardEl = document.getElementById('card');
  const skullEl = document.getElementById('skull');

  titleEl.textContent = item.title;
  document.getElementById('promptText').textContent = item.prompt;

  /* --- Заголовок: подгоняем кегль под ширину полосы набора --- */
  let titleSize = cfg.titleMax;
  root.style.setProperty('--title-size', titleSize + 'px');
  while (titleEl.scrollWidth > cfg.titleMaxWidth && titleSize > cfg.titleMin) {
    titleSize -= 1;
    root.style.setProperty('--title-size', titleSize + 'px');
  }

  /* --- Тело: сначала бережём кегль текста, потом размер черепа ---
     Внешний цикл по кеглю, внутренний по черепу: берём самый крупный
     текст, который вообще влезает, и под него — самый крупный череп. */
  let chosen = null;
  for (const size of cfg.promptSizes) {
    root.style.setProperty('--prompt-size', size + 'px');
    for (const skull of cfg.skullSizes) {
      root.style.setProperty('--skull-size', skull + 'px');
      const free = middleEl.getBoundingClientRect().height;
      if (free >= skull + cfg.minGap * 2) {
        chosen = { promptSize: size, skullSize: skull, free };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) {
    const skull = cfg.skullSizes[cfg.skullSizes.length - 1];
    const size = cfg.promptSizes[cfg.promptSizes.length - 1];
    root.style.setProperty('--skull-size', skull + 'px');
    root.style.setProperty('--prompt-size', size + 'px');
    chosen = { promptSize: size, skullSize: skull, free: middleEl.getBoundingClientRect().height, degraded: true };
  }

  /* --- Контроль: ничего не вылезло и не наложилось --- */
  const card = cardEl.getBoundingClientRect();
  const head = titleEl.getBoundingClientRect();
  const sk = skullEl.getBoundingClientRect();

  return {
    titleSize,
    promptSize: chosen.promptSize,
    skullSize: chosen.skullSize,
    freeSpace: Math.round(chosen.free),
    degraded: !!chosen.degraded,
    cardHeight: Math.round(card.height),
    cardTop: Math.round(card.top),
    cardBottom: Math.round(card.bottom),
    gapSkullToCard: Math.round(card.top - sk.bottom),
    gapTitleToSkull: Math.round(sk.top - head.bottom),
    titleWidth: Math.round(titleEl.scrollWidth),
    overflowX: stage.scrollWidth > 1080,
    overflowY: stage.scrollHeight > 1920,
    textLen: item.prompt.length,
    /* тексты действительно попали в DOM */
    hasTitle: titleEl.textContent.trim().length > 0,
    hasMhs: !!document.querySelector('.mhs') &&
            document.querySelector('.mhs').textContent.trim() === 'THE MHS',
    hasPrompt: document.getElementById('promptText').textContent.trim().length > 0,
    hasSkull: skullEl.getBoundingClientRect().width > 20,
    hasButtons: !!document.querySelector('.btn-send') && !!document.querySelector('.btn-plus'),
  };
};
</script>
</body>
</html>`,
  };
}

/* ------------------------------------------------------------------ *
 *  Contact sheet — сетка превью всех карточек
 * ------------------------------------------------------------------ */

export function buildContactSheet(files, { cols = 10, cell = 200, gap = 12, pad = 28 } = {}) {
  const cards = files
    .map(
      (f) => `<figure class="c">
        <img src="file://${encodeURI(f.path).replace(/#/g, '%23')}">
        <figcaption>${f.label}</figcaption>
      </figure>`
    )
    .join('\n');

  const width = cols * cell + (cols - 1) * gap + pad * 2;

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:${width}px; background:#0a0a0a; padding:${pad}px;
         font-family:-apple-system, sans-serif; }
  .grid { display:grid; grid-template-columns:repeat(${cols}, ${cell}px); gap:${gap}px; }
  .c { width:${cell}px; }
  .c img { width:${cell}px; height:${Math.round((cell * 1920) / 1080)}px;
           display:block; border-radius:6px; }
  .c figcaption { margin-top:6px; text-align:center; color:#7c7c85;
                  font-size:13px; letter-spacing:.06em; }
</style></head>
<body><div class="grid">${cards}</div></body></html>`;
}
