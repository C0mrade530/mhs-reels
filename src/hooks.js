import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const AUDIO = path.join(path.resolve(here, '..'), 'audio');

/* ------------------------------------------------------------------ *
 *  Поиск припева / дропа в треке
 *
 *  Логика простая и для фонка рабочая: декодируем трек в моно 8 кГц,
 *  считаем энергию по полусекундным корзинам и ищем окно нужной длины
 *  с максимальной средней энергией. У фонка и бразильского фанка
 *  самый громкий и плотный участок — это и есть дроп.
 * ------------------------------------------------------------------ */

const RATE = 8000;
const BUCKET = 0.5; // секунды на корзину

async function energyProfile(file) {
  const { stdout } = await run(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'],
    { maxBuffer: 1 << 30, encoding: 'buffer' }
  );
  const pcm = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
  const per = Math.round(RATE * BUCKET);
  const buckets = [];
  for (let i = 0; i + per <= pcm.length; i += per) {
    let sum = 0;
    for (let j = i; j < i + per; j++) sum += pcm[j] * pcm[j];
    buckets.push(Math.sqrt(sum / per));
  }
  return buckets;
}

/**
 * Возвращает список секунд, с которых можно резать ролик, — от самого
 * плотного участка к менее плотным. Куски не перекрываются, поэтому
 * один трек звучит в серии по-разному, а не одним и тем же отрывком.
 *
 * Первые 8 секунд пропускаем: там почти всегда интро, а не то,
 * ради чего трек узнают.
 */
export async function findHooks(file, duration, limit = 12) {
  const buckets = await energyProfile(file);
  const total = buckets.length * BUCKET;
  if (total <= duration + 1) return [0];

  const win = Math.round(duration / BUCKET);
  const skip = Math.min(Math.round(8 / BUCKET), Math.max(0, buckets.length - win - 1));
  const maxStart = Math.max(0, total - duration - 0.5);

  // энергия каждого возможного окна
  const windows = [];
  for (let i = skip; i + win <= buckets.length; i++) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += buckets[j];
    windows.push({ i, score: sum / win });
  }
  windows.sort((a, b) => b.score - a.score);

  // жадно набираем непересекающиеся куски
  const picked = [];
  for (const w of windows) {
    if (picked.length >= limit) break;
    if (picked.some((p) => Math.abs(p - w.i) < win)) continue;
    picked.push(w.i);
  }

  return picked
    .map((i) => Math.min(Number((i * BUCKET).toFixed(1)), Number(maxStart.toFixed(1))))
    .filter((v, idx, arr) => arr.indexOf(v) === idx);
}

/* ------------------------------------------------------------------ *
 *  CLI: npm run hooks — проставляет start в audio/tracks.json
 * ------------------------------------------------------------------ */

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

async function main() {
  if (!fs.existsSync(AUDIO)) {
    console.error('Нет папки audio/');
    process.exit(1);
  }
  const files = fs.readdirSync(AUDIO).filter((f) => /\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(f)).sort();
  if (!files.length) {
    console.log(c.warn('В audio/ нет треков. Положите mp3 и запустите снова.'));
    return;
  }

  const cfgPath = path.join(AUDIO, 'tracks.json');
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : [];
  const byFile = new Map(cfg.filter((t) => t && t.file).map((t) => [t.file, t]));

  console.log(c.b('Ищу припев в каждом треке…\n'));
  const out = [];
  for (const file of files) {
    const prev = byFile.get(file) || {};
    const duration = Math.min(10, Math.max(7, Number(prev.duration) || 8));
    const starts = await findHooks(path.join(AUDIO, file), duration);
    const entry = {
      file,
      label: prev.label || path.parse(file).name.replace(/[-_]/g, ' ').toUpperCase(),
      duration,
      starts,
    };
    out.push(entry);
    const fmt = (s) =>
      `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    console.log(
      `  ${entry.label.padEnd(20)} ${c.dim(`${duration}с ×`)} ${c.ok(String(starts.length).padStart(2))} ${c.dim('отрывков:')} ${starts
        .map(fmt)
        .join(' ')}`
    );
  }

  fs.writeFileSync(cfgPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(c.dim(`\nЗаписано в ${path.relative(process.cwd(), cfgPath)}`));
  console.log(c.dim('Если какой-то трек зашёл не туда — поправьте start руками и запустите npm run reels.'));
}

// сравниваем через pathToFileURL: в пути проекта есть пробел,
// и прямая склейка `file://` + argv[1] с ним не совпадёт
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
