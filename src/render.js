import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
  findPromptsJson,
  validateAndFix,
  pad3,
  pngSize,
  rmrf,
  ensureDir,
} from './utils.js';
import { buildShell, buildContactSheet } from './template.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');

const OUT = path.join(projectDir, 'output');
const PREVIEWS = path.join(OUT, 'previews');

const CARD_W = 1080;
const CARD_H = 1920;

/* --scale=2 рендерит кадры 2160x3840 для видео: при зуме в Reels
   картинка всегда уменьшается, а не растягивается, и текст остаётся резким. */
const SCALE = Number((process.argv.find((a) => a.startsWith('--scale=')) || '').split('=')[1]) || 1;
const CARDS = path.join(OUT, SCALE === 1 ? 'cards' : `cards@${SCALE}x`);
const EXTRAS = SCALE === 1; // превью и contact sheet собираем только для основного размера

/** Превью-подборка: разные длины текста и разные разряды номера */
const PREVIEW_IDS = [1, 2, 3, 10, 25, 50, 75, 99, 100];

/** Параметры подгонки композиции */
const FIT = {
  titleMax: 82,
  titleMin: 54,
  titleMaxWidth: 900, // держим заголовок внутри боковой safe zone (1080 - 2*84 = 912)
  promptSizes: [46, 44, 42, 40, 38, 36, 34, 32, 30],
  skullSizes: [236, 220, 204, 190],
  minGap: 54, // минимальный воздух между черепом и соседями
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

const line = () => console.log(c.dim('─'.repeat(64)));

async function main() {
  const validateOnly = process.argv.includes('--validate-only');
  const t0 = Date.now();

  /* ---------------- 1. Поиск JSON ---------------- */
  line();
  console.log(c.b('MHS · генератор карточек 1080×1920'));
  line();

  const found = findPromptsJson(projectDir);
  if (!found) {
    console.error(c.err('Не найден JSON с промптами (массив объектов id/title/prompt).'));
    process.exit(1);
  }
  console.log(`JSON: ${c.b(path.relative(projectDir, found.file))} ${c.dim(`(${found.data.length} объектов)`)}`);

  /* ---------------- 2. Валидация ---------------- */
  const { items, issues, fixes, sequential } = validateAndFix(found.data);

  const checks = [
    ['JSON валиден', true],
    ['объектов ровно 100', items.length === 100],
    ['id уникальные', new Set(items.map((i) => i.id)).size === items.length],
    ['id идут 1…100 без пропусков', sequential],
    ['title есть у всех', items.every((i) => i.title && i.title.trim())],
    ['prompt есть у всех', items.every((i) => i.prompt && i.prompt.trim())],
    ['номера в формате #01 / #100', items.every((i) => /#(\d{2,3})$/.test(i.title))],
  ];
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? c.ok('✓') : c.err('✗')} ${name}`);
  }
  if (fixes.length) {
    console.log(c.warn(`  Автоисправления (${fixes.length}):`));
    fixes.slice(0, 10).forEach((f) => console.log(c.dim(`     · ${f}`)));
  }
  if (issues.length) {
    console.log(c.warn(`  Замечания (${issues.length}):`));
    issues.slice(0, 10).forEach((i) => console.log(c.dim(`     · ${i}`)));
  }
  if (checks.some(([, pass]) => !pass)) {
    console.error(c.err('\nJSON не прошёл проверку — рендер остановлен.'));
    process.exit(1);
  }
  if (validateOnly) {
    console.log(c.ok('\nJSON в порядке.'));
    return;
  }

  /* ---------------- 3. Подготовка output ---------------- */
  rmrf(CARDS);
  ensureDir(CARDS);
  if (EXTRAS) {
    rmrf(PREVIEWS);
    ensureDir(PREVIEWS);
  }

  /* ---------------- 4. Рендер ---------------- */
  line();
  const { html, fonts } = buildShell();
  console.log(`Шрифты: ${c.dim(path.basename(fonts.display))} + ${c.dim(path.basename(fonts.text))}`);

  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--font-render-hinting=none'] });
  const page = await browser.newPage({
    viewport: { width: CARD_W, height: CARD_H },
    deviceScaleFactor: SCALE,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const metrics = [];
  const problems = [];
  process.stdout.write('Рендер: ');

  for (const item of items) {
    const m = await page.evaluate(
      ([it, cfg]) => window.renderCard(it, cfg),
      [item, FIT]
    );

    // покадровый контроль до сохранения
    if (m.overflowX || m.overflowY) problems.push(`#${item.id}: композиция вышла за canvas`);
    if (m.cardBottom > CARD_H) problems.push(`#${item.id}: карточка ниже нижней границы`);
    if (m.gapSkullToCard < 20) problems.push(`#${item.id}: череп касается поля (${m.gapSkullToCard}px)`);
    if (!m.hasTitle || !m.hasMhs || !m.hasPrompt || !m.hasSkull || !m.hasButtons)
      problems.push(`#${item.id}: отсутствует обязательный элемент`);

    const file = path.join(CARDS, `secret-prompt-${pad3(item.id)}.png`);
    await page.screenshot({
      path: file,
      clip: { x: 0, y: 0, width: CARD_W, height: CARD_H },
      type: 'png',
    });

    metrics.push({ ...m, id: item.id, file });
    if (item.id % 10 === 0) process.stdout.write(`${item.id} `);
  }
  console.log(c.ok('✓'));

  /* ---------------- 5. Проверка результата ---------------- */
  const verified = [];
  for (const m of metrics) {
    const stat = fs.statSync(m.file);
    const size = pngSize(m.file);
    const okDims = size && size.width === CARD_W * SCALE && size.height === CARD_H * SCALE;
    if (!okDims) problems.push(`#${m.id}: неверный размер PNG`);
    if (stat.size < 5000) problems.push(`#${m.id}: подозрительно маленький файл`);
    verified.push({ ...m, bytes: stat.size, dims: size });
  }

  /* ---------------- 6. Превью ---------------- */
  if (EXTRAS) for (const id of PREVIEW_IDS) {
    const src = path.join(CARDS, `secret-prompt-${pad3(id)}.png`);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(PREVIEWS, `preview-${pad3(id)}.png`));
  }

  /* ---------------- 7. Contact sheet ---------------- */
  const sheetFiles = items.map((i) => ({
    path: path.join(CARDS, `secret-prompt-${pad3(i.id)}.png`),
    label: `#${i.id >= 100 ? i.id : String(i.id).padStart(2, '0')}`,
  }));
  const sheetHtml = path.join(OUT, '.contact-sheet.html');
  const sheetPath = path.join(OUT, 'contact-sheet.png');
  if (EXTRAS) {
  fs.writeFileSync(sheetHtml, buildContactSheet(sheetFiles), 'utf8');

  const sheetPage = await browser.newPage({ viewport: { width: 2200, height: 1200 }, deviceScaleFactor: 1 });
  await sheetPage.goto(`file://${sheetHtml}`, { waitUntil: 'load' });
  const imagesOk = await sheetPage.evaluate(() =>
    [...document.images].every((i) => i.complete && i.naturalWidth > 0)
  );
  if (!imagesOk) problems.push('contact sheet: часть превью не загрузилась');

  await sheetPage.screenshot({ path: sheetPath, fullPage: true, type: 'png' });
  fs.unlinkSync(sheetHtml);
  }

  await browser.close();

  /* ---------------- 8. Статистика ---------------- */
  const sheetDims = EXTRAS ? pngSize(sheetPath) : null;
  const totalBytes = verified.reduce((s, m) => s + m.bytes, 0);
  const promptSizes = verified.map((m) => m.promptSize);
  const heights = verified.map((m) => m.cardHeight);
  const hist = {};
  promptSizes.forEach((s) => (hist[s] = (hist[s] || 0) + 1));

  line();
  console.log(c.b('ИТОГ'));
  console.log(`  Карточек:        ${c.ok(String(verified.length))} / 100   ${c.dim(`(все ${CARD_W * SCALE}×${CARD_H * SCALE} PNG → ${path.basename(CARDS)}/)`)}`);
  console.log(`  Объём:           ${(totalBytes / 1048576).toFixed(1)} МБ`);
  console.log(`  Кегль промпта:   ${Math.min(...promptSizes)}–${Math.max(...promptSizes)} px  ${c.dim(
    Object.entries(hist).sort((a, b) => b[0] - a[0]).map(([k, v]) => `${k}px×${v}`).join('  ')
  )}`);
  console.log(`  Высота поля:     ${Math.min(...heights)}–${Math.max(...heights)} px ${c.dim('(адаптивная)')}`);
  console.log(`  Мельче минимума: ${verified.filter((m) => m.degraded).length}`);
  if (EXTRAS) {
    console.log(`  Превью:          ${PREVIEW_IDS.length} шт → output/previews/`);
    console.log(`  Contact sheet:   ${sheetDims.width}×${sheetDims.height} → output/contact-sheet.png`);
  }
  console.log(`  Время:           ${((Date.now() - t0) / 1000).toFixed(1)} с`);

  if (problems.length) {
    console.log(c.err(`\n  Проблемы (${problems.length}):`));
    problems.slice(0, 20).forEach((p) => console.log(c.err(`   · ${p}`)));
    process.exitCode = 1;
  } else {
    console.log(c.ok('\n  Визуальный контроль пройден: переполнений нет, все элементы на месте.'));
  }
  line();
}

main().catch((e) => {
  console.error(c.err(`\nОшибка: ${e.message}`));
  console.error(e.stack);
  process.exit(1);
});
