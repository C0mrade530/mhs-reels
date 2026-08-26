import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { findPromptsJson, validateAndFix, pad3, rmrf, ensureDir } from './utils.js';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');

const FRAMES = path.join(projectDir, 'output', 'cards@2x');
const AUDIO = path.join(projectDir, 'audio');
const REELS = path.join(projectDir, 'output', 'reels');

/* ------------------------------------------------------------------ *
 *  Параметры видео под Instagram Reels
 * ------------------------------------------------------------------ */
const V = {
  width: 1080,
  height: 1920,
  fps: 30,
  minDuration: 7,
  maxDuration: 10,
  defaultDuration: 8,
  zoom: 0.06, // медленный наезд на 6% за ролик
  fadeIn: 0.4,
  audioFadeIn: 0.25,
  audioFadeOut: 0.7,
  videoBitrate: '6M',
  audioBitrate: '128k',
};

/**
 * Подпись к рилсу = сам промпт. Заголовок сверху для контекста.
 * FOOTER — место под хештеги и призыв, если понадобится.
 */
const CAPTION_FOOTER = '';

function buildCaption(item) {
  return [item.title, '', item.prompt, CAPTION_FOOTER].join('\n').trim();
}

/* ------------------------------------------------------------------ *
 *  Аудиодорожки
 * ------------------------------------------------------------------ */

/**
 * Читает audio/tracks.json — необязательный конфиг с точкой входа
 * в трек и длительностью нарезки:
 *   [{ "file": "montagem-rugada.mp3", "start": 32, "duration": 9 }]
 * Файлы без записи в конфиге берутся с начала и на 8 секунд.
 */
function loadTracks() {
  if (!fs.existsSync(AUDIO)) return [];
  const cfgPath = path.join(AUDIO, 'tracks.json');
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : [];
  const byFile = new Map(cfg.filter((t) => t && t.file).map((t) => [t.file, t]));

  return fs
    .readdirSync(AUDIO)
    .filter((f) => /\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(f))
    .sort()
    .map((file) => {
      const t = byFile.get(file) || {};
      const duration = Math.min(
        V.maxDuration,
        Math.max(V.minDuration, Number(t.duration) || V.defaultDuration)
      );
      // starts — список непересекающихся дропов; start оставлен
      // для совместимости со старым форматом конфига
      const starts = Array.isArray(t.starts) && t.starts.length
        ? t.starts.map(Number)
        : [Number(t.start) || 0];
      return {
        file,
        path: path.join(AUDIO, file),
        starts,
        duration,
        label: t.label || path.parse(file).name,
      };
    });
}

/**
 * Раскладывает музыку по карточкам: трек меняется на каждой карточке,
 * а при возврате к тому же треку берётся следующий его отрывок.
 * Так подряд идут разные песни, а повторы звучат по-разному.
 */
function pickCue(tracks, index) {
  if (!tracks.length) return null;
  const track = tracks[index % tracks.length];
  const round = Math.floor(index / tracks.length);
  const start = track.starts[round % track.starts.length];
  return { ...track, start };
}

/* ------------------------------------------------------------------ *
 *  Сборка одного ролика
 * ------------------------------------------------------------------ */

async function renderReel(frame, out, track) {
  const dur = track ? track.duration : V.defaultDuration;
  const frames = Math.round(dur * V.fps);

  // Линейный наезд по номеру кадра: без дрожания, которым славится zoompan
  // с накопительным zoom+inc. Источник 2160x3840 → выход 1080x1920,
  // то есть всегда уменьшение, текст остаётся резким.
  const vf =
    `zoompan=z='1+${V.zoom}*on/${frames}':` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=${frames}:s=${V.width}x${V.height}:fps=${V.fps},` +
    `fade=t=in:st=0:d=${V.fadeIn},format=yuv420p`;

  const args = ['-y', '-loop', '1', '-t', String(dur), '-i', frame];

  if (track) {
    args.push('-ss', String(track.start), '-t', String(dur), '-i', track.path);
  } else {
    // валидная тишина, чтобы у файла была звуковая дорожка
    args.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=44100:cl=stereo');
  }

  const af =
    `afade=t=in:st=0:d=${V.audioFadeIn},` +
    `afade=t=out:st=${(dur - V.audioFadeOut).toFixed(2)}:d=${V.audioFadeOut}`;

  args.push(
    '-filter_complex', `[0:v]${vf}[v];[1:a]${af}[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-level', '4.1',
    '-b:v', V.videoBitrate, '-maxrate', V.videoBitrate, '-bufsize', '12M',
    '-r', String(V.fps), '-g', String(V.fps * 2),
    '-c:a', 'aac', '-b:a', V.audioBitrate, '-ar', '44100', '-ac', '2',
    '-shortest', '-movflags', '+faststart',
    out
  );

  await run('ffmpeg', args, { maxBuffer: 1 << 26 });
  return dur;
}

async function probe(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=width,height,codec_name',
    '-of', 'json', file,
  ]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s) => s.codec_name === 'h264');
  const a = j.streams.find((s) => s.codec_name === 'aac');
  return {
    duration: Number(j.format.duration),
    width: v?.width,
    height: v?.height,
    hasAudio: !!a,
  };
}

/* ------------------------------------------------------------------ *
 *  Основной проход
 * ------------------------------------------------------------------ */

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};
const line = () => console.log(c.dim('─'.repeat(64)));

async function main() {
  const t0 = Date.now();
  const limitArg = (process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1];
  const limit = limitArg ? Number(limitArg) : Infinity;

  line();
  console.log(c.b('MHS · сборка Reels 1080×1920'));
  line();

  if (!fs.existsSync(FRAMES)) {
    console.error(c.err('Нет кадров output/cards@2x — сначала: npm run render -- --scale=2'));
    process.exit(1);
  }

  const found = findPromptsJson(projectDir);
  const { items } = validateAndFix(found.data);

  const tracks = loadTracks();
  if (tracks.length) {
    console.log(`Треков в audio/: ${c.b(String(tracks.length))}`);
    tracks.forEach((t) =>
      console.log(c.dim(`  · ${t.label} — ${t.duration}с, отрывков: ${t.starts.length}`))
    );
    const variants = tracks.reduce((s, t) => s + t.starts.length, 0);
    console.log(c.dim(`  Уникальных звуковых вариантов: ${variants}`));
  } else {
    console.log(c.warn('В audio/ нет файлов — ролики соберутся с тишиной.'));
    console.log(c.dim('  Положите туда треки и запустите заново, чтобы вшить звук.'));
  }

  ensureDir(REELS);
  if (limit === Infinity) rmrf(REELS), ensureDir(REELS);

  const queue = items.slice(0, limit === Infinity ? items.length : limit);
  const results = [];
  const problems = [];

  console.log('');
  for (const [i, item] of queue.entries()) {
    const frame = path.join(FRAMES, `secret-prompt-${pad3(item.id)}.png`);
    if (!fs.existsSync(frame)) {
      problems.push(`#${item.id}: нет кадра ${path.basename(frame)}`);
      continue;
    }
    const track = pickCue(tracks, i);
    const out = path.join(REELS, `reel-${pad3(item.id)}.mp4`);

    await renderReel(frame, out, track);
    fs.writeFileSync(path.join(REELS, `reel-${pad3(item.id)}.txt`), buildCaption(item), 'utf8');

    const info = await probe(out);
    if (info.width !== V.width || info.height !== V.height)
      problems.push(`#${item.id}: размер ${info.width}×${info.height}`);
    if (info.duration < V.minDuration - 0.2 || info.duration > V.maxDuration + 0.2)
      problems.push(`#${item.id}: длительность ${info.duration.toFixed(1)}с вне 7–10с`);
    if (!info.hasAudio) problems.push(`#${item.id}: нет звуковой дорожки`);

    results.push({
      id: item.id,
      out,
      ...info,
      track: track?.label ?? 'тишина',
      start: track?.start ?? 0,
    });
    process.stdout.write(`\r  собрано: ${results.length}/${queue.length}`);
  }
  console.log('');

  line();
  const bytes = results.reduce((s, r) => s + fs.statSync(r.out).size, 0);
  console.log(c.b('ИТОГ'));
  console.log(`  Роликов:      ${c.ok(String(results.length))} → output/reels/`);
  console.log(`  Формат:       ${V.width}×${V.height}, ${V.fps} fps, H.264 + AAC`);
  console.log(`  Длительность: ${Math.min(...results.map((r) => r.duration)).toFixed(1)}–${Math.max(
    ...results.map((r) => r.duration)
  ).toFixed(1)} с`);
  console.log(`  Подписи:      reel-XXX.txt рядом с каждым mp4`);
  console.log(`  Объём:        ${(bytes / 1048576).toFixed(1)} МБ`);
  console.log(`  Время:        ${((Date.now() - t0) / 1000).toFixed(1)} с`);

  if (problems.length) {
    console.log(c.err(`\n  Проблемы (${problems.length}):`));
    problems.slice(0, 20).forEach((p) => console.log(c.err(`   · ${p}`)));
    process.exitCode = 1;
  } else {
    console.log(c.ok('\n  Все ролики прошли проверку ffprobe.'));
  }
  line();
}

main().catch((e) => {
  console.error(c.err(`\nОшибка: ${e.message}`));
  if (e.stderr) console.error(String(e.stderr).split('\n').slice(-15).join('\n'));
  process.exit(1);
});
