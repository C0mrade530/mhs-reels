import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/* ------------------------------------------------------------------ *
 *  Поиск JSON с промптами
 * ------------------------------------------------------------------ */

/**
 * Оценивает, насколько содержимое файла похоже на массив промптов.
 * Возвращает число очков (чем больше — тем вероятнее это нужный файл).
 */
function scoreCandidate(data) {
  if (!Array.isArray(data) || data.length === 0) return 0;
  let score = 0;
  const sample = data.slice(0, 5);
  const hasShape = sample.every(
    (o) => o && typeof o === 'object' && 'prompt' in o && 'title' in o && 'id' in o
  );
  if (!hasShape) return 0;
  score += 50;
  if (data.length === 100) score += 50;
  if (sample.every((o) => typeof o.prompt === 'string' && o.prompt.length > 40)) score += 20;
  if (sample.some((o) => /ПРОМПТ/i.test(String(o.title)))) score += 20;
  return score;
}

/**
 * Ищет JSON-файл с промптами в корне проекта (и на один уровень вглубь).
 * Не требует конкретного имени — определяет файл по структуре содержимого.
 */
export function findPromptsJson(projectDir) {
  const skipDirs = new Set(['node_modules', 'output', '.git', 'src']);
  const candidates = [];

  const scan = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth > 0 && !skipDirs.has(e.name) && !e.name.startsWith('.')) scan(full, depth - 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.json')) {
        if (e.name === 'package.json' || e.name === 'package-lock.json') continue;
        candidates.push(full);
      }
    }
  };
  scan(projectDir, 1);

  let best = null;
  for (const file of candidates) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const score = scoreCandidate(data);
    if (score > 0 && (!best || score > best.score)) best = { file, data, score };
  }
  return best;
}

/* ------------------------------------------------------------------ *
 *  Валидация и авто-починка
 * ------------------------------------------------------------------ */

export const pad2 = (n) => String(n).padStart(2, '0');
export const pad3 = (n) => String(n).padStart(3, '0');

/** Номер в заголовке: #01..#09, #10..#99, #100 */
export const cardNumber = (id) => (id >= 100 ? String(id) : pad2(id));

const TITLE_PREFIX = 'СЕКРЕТНЫЙ ПРОМПТ';

/**
 * Проверяет JSON и программно чинит только техническое:
 * формат номера в title, пропущенный/битый title.
 * Тексты промптов не трогает.
 */
export function validateAndFix(data) {
  const issues = [];
  const fixes = [];

  if (!Array.isArray(data)) throw new Error('JSON не является массивом');
  if (data.length !== 100) issues.push(`объектов ${data.length}, ожидалось 100`);

  const seen = new Map();
  const items = data.map((raw, index) => {
    const item = { ...raw };

    // --- id ---
    let id = Number(item.id);
    if (!Number.isInteger(id) || id < 1) {
      id = index + 1;
      fixes.push(`#${index + 1}: некорректный id → ${id}`);
    }
    if (seen.has(id)) {
      const fresh = index + 1;
      fixes.push(`дубликат id ${id} → ${fresh}`);
      id = fresh;
    }
    seen.set(id, true);
    item.id = id;

    // --- prompt ---
    if (typeof item.prompt !== 'string' || item.prompt.trim() === '') {
      issues.push(`id ${id}: пустой prompt`);
      item.prompt = '';
    } else {
      item.prompt = item.prompt.trim();
    }

    // --- title: приводим номер к формату #01 / #100 ---
    const expected = `${TITLE_PREFIX} #${cardNumber(id)}`;
    if (typeof item.title !== 'string' || item.title.trim() === '') {
      fixes.push(`id ${id}: отсутствовал title → «${expected}»`);
      item.title = expected;
    } else {
      const t = item.title.trim();
      const m = t.match(/^(.*?)#\s*(\d+)\s*$/);
      if (m) {
        const base = m[1].trim();
        const num = Number(m[2]);
        const normalized = `${base} #${cardNumber(num)}`;
        if (normalized !== t) {
          fixes.push(`id ${id}: «${t}» → «${normalized}»`);
        }
        if (num !== id) issues.push(`id ${id}: номер в title (#${num}) не совпадает с id`);
        item.title = normalized;
      } else {
        fixes.push(`id ${id}: в title нет номера → «${expected}»`);
        item.title = expected;
      }
    }
    return item;
  });

  items.sort((a, b) => a.id - b.id);

  const ids = items.map((i) => i.id);
  const sequential = ids.every((v, i) => v === i + 1);
  if (!sequential) issues.push('id идут не строго от 1 до 100');

  return { items, issues, fixes, sequential };
}

/* ------------------------------------------------------------------ *
 *  Шрифты: ищем локально, инлайним как data-URI (без сети)
 * ------------------------------------------------------------------ */

const FONT_DIRS = [
  path.join(os.homedir(), 'Library/Fonts'),
  '/Library/Fonts',
  '/System/Library/Fonts',
  '/System/Library/Fonts/Supplemental',
];

/** Ищет файл шрифта по списку возможных имён. */
export function findFontFile(names) {
  for (const dir of FONT_DIRS) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

export function fontDataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.otf' ? 'font/otf' : ext === '.ttc' ? 'font/collection' : 'font/ttf';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/* ------------------------------------------------------------------ *
 *  PNG: чтение размеров прямо из заголовка IHDR (без зависимостей)
 * ------------------------------------------------------------------ */

export function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(24);
  const read = fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  if (read < 24) return null;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
