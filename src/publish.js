import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findPromptsJson, validateAndFix, pad3 } from './utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');
/* Рубрики публикуются независимо: у каждой свои файлы, своя очередь
   и своё расписание. Хостинг общий — имена роликов не пересекаются. */
const SERIES = {
  prompts: {
    reels: path.join(projectDir, 'output', 'reels'),
    state: path.join(projectDir, 'output', 'publish-state.json'),
    prefix: 'reel',
    times: '12:00,15:00,18:00',
    timesEnv: 'POST_TIMES',
    title: 'Секретный промпт',
    load: null,
  },
  radar: {
    reels: path.join(projectDir, 'output', 'radar-reels'),
    state: path.join(projectDir, 'output', 'radar-publish-state.json'),
    prefix: 'radar',
    times: '13:00,16:00,19:00',
    timesEnv: 'RADAR_POST_TIMES',
    title: 'GitHub-находка',
    load: () => {
      const items = JSON.parse(
        fs.readFileSync(path.join(projectDir, 'github-radar-100.json'), 'utf8')
      );
      return items.map((i) => {
        const n = i.id >= 100 ? String(i.id) : String(i.id).padStart(2, '0');
        return { ...i, title: `GITHUB-НАХОДКА №${n}` };
      });
    },
  },
};

const seriesArg = (process.argv.find((a) => a.startsWith('--series=')) || '').split('=')[1] || 'prompts';
const S = SERIES[seriesArg];
if (!S) {
  console.error(`Неизвестная рубрика: ${seriesArg}. Доступны: ${Object.keys(SERIES).join(', ')}`);
  process.exit(1);
}
const REELS = S.reels;
const STATE = S.state;

/* ------------------------------------------------------------------ *
 *  Конфигурация — только из окружения.
 *  Токен живёт в .env, который вы создаёте сами; в коде и в репозитории
 *  его нет и быть не должно.
 * ------------------------------------------------------------------ */

try {
  process.loadEnvFile(path.join(projectDir, '.env'));
} catch {
  /* .env может отсутствовать — тогда переменные берём из окружения */
}

/**
 * Хост API зависит от того, каким способом выпущен токен:
 *   IGAA… — Instagram API with Instagram Login → graph.instagram.com
 *   EAA…  — Instagram API with Facebook Login  → graph.facebook.com
 * Определяем сами, чтобы не гадать; GRAPH_HOST перебивает автоопределение.
 */
function detectHost(token) {
  if (process.env.GRAPH_HOST) return process.env.GRAPH_HOST.replace(/^https?:\/\//, '');
  return String(token || '').startsWith('IGAA') ? 'graph.instagram.com' : 'graph.facebook.com';
}

const CFG = {
  userId: process.env.IG_USER_ID,
  token: process.env.IG_ACCESS_TOKEN,
  baseUrl: (process.env.MEDIA_BASE_URL || '').replace(/\/+$/, ''),
  version: process.env.GRAPH_VERSION || 'v23.0',
  times: (process.env[S.timesEnv] || S.times).split(',').map((s) => s.trim()),
  shareToFeed: process.env.SHARE_TO_FEED !== 'false',
  host: detectHost(process.env.IG_ACCESS_TOKEN),
  // Кадр для обложки, миллисекунды от начала ролика. По умолчанию нулевой
  // кадр — а он у нас чёрный из-за фейда на старте, и в сетке профиля
  // обложка выглядит пустой. Секунда — уже полностью проявившаяся карточка.
  thumbOffset: Number(process.env.THUMB_OFFSET ?? 1000),
};

const API = (p) => `https://${CFG.host}/${CFG.version}/${p}`;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};
const line = () => console.log(c.dim('─'.repeat(64)));

/* ------------------------------------------------------------------ *
 *  Состояние очереди
 * ------------------------------------------------------------------ */

function loadState() {
  if (!fs.existsSync(STATE)) return { published: [], failed: [] };
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

function saveState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n', 'utf8');
}

/* ------------------------------------------------------------------ *
 *  Graph API: контейнер → ожидание обработки → публикация
 * ------------------------------------------------------------------ */

async function call(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    throw new Error(`Graph API ${res.status}: ${e.message || 'неизвестная ошибка'}${e.code ? ` (code ${e.code})` : ''}`);
  }
  return body;
}

/** ID аккаунта можно не задавать руками — токен знает, кому принадлежит. */
async function resolveUserId() {
  if (CFG.userId) return CFG.userId;
  const body = await call(
    API(`me?fields=id,username&access_token=${encodeURIComponent(CFG.token)}`)
  );
  CFG.userId = body.id;
  console.log(c.dim(`  аккаунт: ${body.username ? '@' + body.username : body.id}`));
  return CFG.userId;
}

/**
 * Перед публикацией проверяем ссылку сами: Instagram на недоступном
 * видео вернёт невнятный ERROR через минуту ожидания, а так мы узнаем
 * причину сразу и по-человечески.
 */
async function ensureReachable(url) {
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!res.ok) throw new Error(`видео недоступно по ссылке: HTTP ${res.status} на ${url}`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('video/')) {
    throw new Error(`по ссылке отдаётся не видео, а ${type || 'неизвестный тип'}: ${url}`);
  }
}

/** Шаг 1. Создаём контейнер: Instagram сам скачает видео по ссылке. */
async function createContainer(videoUrl, caption) {
  const params = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: String(CFG.shareToFeed),
    thumb_offset: String(CFG.thumbOffset),
    access_token: CFG.token,
  });
  const body = await call(API(`${CFG.userId}/media`), { method: 'POST', body: params });
  return body.id;
}

/** Шаг 2. Ждём, пока Instagram обработает видео. Обычно 20–60 секунд. */
async function waitReady(containerId, { timeout = 300000, interval = 5000 } = {}) {
  const started = Date.now();
  for (;;) {
    const body = await call(
      API(`${containerId}?fields=status_code,status&access_token=${encodeURIComponent(CFG.token)}`)
    );
    if (body.status_code === 'FINISHED') return;
    if (body.status_code === 'ERROR' || body.status_code === 'EXPIRED') {
      throw new Error(`Контейнер в статусе ${body.status_code}: ${body.status || ''}`);
    }
    if (Date.now() - started > timeout) throw new Error('Instagram не обработал видео за 5 минут');
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Шаг 3. Публикуем. */
async function publishContainer(containerId) {
  const params = new URLSearchParams({ creation_id: containerId, access_token: CFG.token });
  const body = await call(API(`${CFG.userId}/media_publish`), { method: 'POST', body: params });
  return body.id;
}

/* ------------------------------------------------------------------ *
 *  Проверка готовности окружения
 * ------------------------------------------------------------------ */

function checkConfig({ requireCreds }) {
  const problems = [];
  if (requireCreds) {
    if (!CFG.token) problems.push('нет IG_ACCESS_TOKEN');
    if (!CFG.baseUrl) problems.push('нет MEDIA_BASE_URL');
    else if (!/^https:\/\//.test(CFG.baseUrl)) problems.push('MEDIA_BASE_URL должен быть https');
  }
  // Локальные mp4 нужны только когда неоткуда взять ссылку: Instagram
  // всё равно скачивает видео с хостинга, а не из этой папки. На
  // GitHub Actions папки нет и быть не должно — видео в репозиторий не едет.
  if (!CFG.baseUrl && !fs.existsSync(REELS)) {
    problems.push('нет ни MEDIA_BASE_URL, ни локальной output/reels');
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 *  Очередь
 * ------------------------------------------------------------------ */

function buildQueue() {
  const items = S.load ? S.load() : validateAndFix(findPromptsJson(projectDir).data).items;
  const state = loadState();
  const done = new Set(state.published.map((p) => p.id));

  return items
    .filter((item) => !done.has(item.id))
    .map((item) => {
      const file = `${S.prefix}-${pad3(item.id)}.mp4`;
      const localPath = path.join(REELS, file);
      const captionFile = path.join(REELS, `${S.prefix}-${pad3(item.id)}.txt`);
      // Подпись берём из файла рядом с роликом, а если его нет —
      // собираем из JSON ровно в том же виде, что и при сборке рилсов.
      const caption = fs.existsSync(captionFile)
        ? fs.readFileSync(captionFile, 'utf8').trim()
        : [item.title, '', item.prompt || item.description, '', item.repo ? `github.com/${item.repo}` : '']
            .join('\n')
            .trim();
      return {
        id: item.id,
        title: item.title,
        file,
        localPath,
        hasLocal: fs.existsSync(localPath),
        url: `${CFG.baseUrl}/${file}`,
        caption,
      };
    });
}

/* ------------------------------------------------------------------ *
 *  Команды
 * ------------------------------------------------------------------ */

function cmdStatus() {
  const state = loadState();
  const queue = buildQueue();
  const perDay = CFG.times.length;

  line();
  console.log(c.b(`MHS · очередь публикации · «${S.title}»`));
  line();
  console.log(`  Опубликовано:  ${c.ok(String(state.published.length))}`);
  console.log(`  В очереди:     ${c.b(String(queue.length))}`);
  console.log(`  Ошибок:        ${state.failed.length ? c.err(String(state.failed.length)) : '0'}`);
  console.log(`  Расписание:    ${CFG.times.join(', ')} ${c.dim(`(${perDay} раза в день, ${Intl.DateTimeFormat().resolvedOptions().timeZone})`)}`);
  console.log(`  Хост API:      ${CFG.host} ${c.dim(CFG.token ? '(по типу токена)' : '')}`);
  console.log(`  Обложка:       кадр на ${(CFG.thumbOffset / 1000).toFixed(1)} с`);
  if (queue.length) {
    console.log(`  Хватит на:     ${Math.ceil(queue.length / perDay)} дн.`);
    console.log(`  Следующий:     ${queue[0].title} ${c.dim(`→ ${queue[0].file}`)}`);
  }

  const problems = checkConfig({ requireCreds: true });
  if (problems.length) {
    console.log(c.warn(`\n  Не настроено: ${problems.join(', ')}`));
    console.log(c.dim('  Скопируйте .env.example в .env и заполните.'));
  } else {
    console.log(c.ok('\n  Окружение настроено.'));
  }
  line();
}

async function cmdNext({ confirm, count }) {
  const problems = checkConfig({ requireCreds: confirm });
  if (problems.length) {
    console.error(c.err(`Не готово: ${problems.join(', ')}`));
    process.exit(1);
  }

  const queue = buildQueue().slice(0, count);
  if (!queue.length) {
    console.log(c.warn('Очередь пуста — всё опубликовано.'));
    return;
  }

  if (confirm) await resolveUserId();

  for (const reel of queue) {
    if (!confirm) {
      line();
      console.log(c.warn('ПРОБНЫЙ ПРОГОН — ничего не публикуется'));
      console.log(`  ${c.b(reel.title)}`);
      const size = reel.hasLocal
        ? `(${(fs.statSync(reel.localPath).size / 1048576).toFixed(1)} МБ)`
        : '(локальной копии нет — берётся с хостинга)';
      console.log(`  файл:    ${reel.file} ${c.dim(size)}`);
      console.log(`  ссылка:  ${reel.url || c.err('MEDIA_BASE_URL не задан')}`);
      console.log(`  подпись: ${reel.caption.slice(0, 90).replace(/\n/g, ' ')}…`);
      console.log(`  обложка: кадр на ${(CFG.thumbOffset / 1000).toFixed(1)} с`);
      console.log(c.dim('\n  Опубликовать по-настоящему: npm run publish -- --next --confirm'));
      line();
      continue;
    }

    process.stdout.write(`${reel.title} · контейнер…`);
    const state = loadState();
    try {
      await ensureReachable(reel.url);
      const containerId = await createContainer(reel.url, reel.caption);
      process.stdout.write(' обработка…');
      await waitReady(containerId);
      process.stdout.write(' публикация…');
      const mediaId = await publishContainer(containerId);

      state.published.push({ id: reel.id, mediaId, file: reel.file, at: new Date().toISOString() });
      saveState(state);
      console.log(c.ok(` готово (${mediaId})`));
    } catch (e) {
      state.failed.push({ id: reel.id, file: reel.file, error: e.message, at: new Date().toISOString() });
      saveState(state);
      console.log(c.err(` ошибка: ${e.message}`));
      process.exitCode = 1;
      return; // не долбим API дальше, если что-то сломалось
    }
  }
}

function cmdSchedule() {
  const node = process.execPath;
  const script = path.join(projectDir, 'src', 'publish.js');

  line();
  console.log(c.b('Расписание: 3 публикации в день'));
  line();
  console.log('Вариант 1 — cron (машина должна быть включена и не спать):\n');
  console.log(c.dim('  crontab -e, затем вставить:\n'));
  for (const t of CFG.times) {
    const [h, m] = t.split(':');
    console.log(`  ${Number(m)} ${Number(h)} * * *  cd ${JSON.stringify(projectDir)} && ${node} ${JSON.stringify(script)} --next --confirm >> output/publish.log 2>&1`);
  }
  console.log('\nВариант 2 — launchd (надёжнее на macOS, догоняет пропущенный запуск):\n');
  console.log(c.dim(`  npm run publish -- --schedule --plist > ~/Library/LaunchAgents/com.mhs.publish.plist`));
  console.log(c.dim('  launchctl load ~/Library/LaunchAgents/com.mhs.publish.plist'));
  line();

  if (process.argv.includes('--plist')) {
    const intervals = CFG.times
      .map((t) => {
        const [h, m] = t.split(':').map(Number);
        return `    <dict><key>Hour</key><integer>${h}</integer><key>Minute</key><integer>${m}</integer></dict>`;
      })
      .join('\n');
    console.log(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.mhs.publish</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${script}</string>
    <string>--next</string>
    <string>--confirm</string>
  </array>
  <key>WorkingDirectory</key><string>${projectDir}</string>
  <key>StartCalendarInterval</key>
  <array>
${intervals}
  </array>
  <key>StandardOutPath</key><string>${projectDir}/output/publish.log</string>
  <key>StandardErrorPath</key><string>${projectDir}/output/publish.log</string>
</dict></plist>`);
  }
}

/* ------------------------------------------------------------------ *
 *  Точка входа
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const confirm = argv.includes('--confirm');
const countArg = (argv.find((a) => a.startsWith('--count=')) || '').split('=')[1];

if (argv.includes('--schedule')) cmdSchedule();
else if (argv.includes('--next')) await cmdNext({ confirm, count: Number(countArg) || 1 });
else cmdStatus();
