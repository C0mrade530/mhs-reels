import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findPromptsJson, validateAndFix, pad3, findDueSlot } from './utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');

try {
  process.loadEnvFile(path.join(projectDir, '.env'));
} catch {
  /* в CI переменные приходят из окружения */
}

/* ------------------------------------------------------------------ *
 *  Выгрузка роликов на YouTube
 *
 *  Те же файлы, что уходят в Instagram: вертикальные, до 10 секунд —
 *  YouTube сам засчитывает их как Shorts. Очередь своя, поэтому
 *  публикация в одну площадку не мешает другой.
 * ------------------------------------------------------------------ */

const SERIES = {
  prompts: {
    reels: path.join(projectDir, 'output', 'reels'),
    state: path.join(projectDir, 'output', 'youtube-state.json'),
    prefix: 'reel',
    load: null,
    title: (item) => cut(`${item.title} — ${firstSentence(item.prompt)}`, 100),
    tags: ['промпты', 'chatgpt', 'нейросети', 'ai', 'бизнес'],
    times: '12:00,15:00,18:00',
    timesEnv: 'YT_POST_TIMES',
  },
  radar: {
    reels: path.join(projectDir, 'output', 'radar-reels', 'r-git'),
    state: path.join(projectDir, 'output', 'youtube-radar-state.json'),
    prefix: 'radar',
    load: () =>
      JSON.parse(fs.readFileSync(path.join(projectDir, 'github-radar-100.json'), 'utf8')).map((i) => {
        const n = i.id >= 100 ? String(i.id) : String(i.id).padStart(2, '0');
        return { ...i, title: `GITHUB-НАХОДКА №${n}` };
      }),
    title: (item) => cut(`${item.headline.replace(/\n/g, ' ')} — ${item.repo}`, 100),
    tags: ['github', 'opensource', 'нейросети', 'инструменты', 'бесплатно'],
    times: '13:00,16:00,19:00',
    timesEnv: 'YT_RADAR_POST_TIMES',
  },
};

const seriesArg = (process.argv.find((a) => a.startsWith('--series=')) || '').split('=')[1] || 'prompts';
const S = SERIES[seriesArg];
if (!S) {
  console.error(`Неизвестная рубрика: ${seriesArg}. Доступны: ${Object.keys(SERIES).join(', ')}`);
  process.exit(1);
}

const CFG = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
  // Непроверенный проект Google всё равно кладёт ролики в private,
  // что ни поставь. После аудита сюда ставится public.
  privacy: process.env.YOUTUBE_PRIVACY || 'private',
  categoryId: process.env.YOUTUBE_CATEGORY || '28', // наука и техника
  // Откуда брать ролик, если рядом его нет: тот же релиз, что кормит Instagram
  mediaBase: (process.env.YT_MEDIA_BASE_URL || process.env.MEDIA_BASE_URL || '').replace(/\/+$/, ''),
  times: (process.env[S.timesEnv] || S.times).split(',').map((x) => x.trim()),
  grace: Number(process.env.SLOT_GRACE ?? 90),
  timezone: process.env.SCHEDULE_TZ || 'Europe/Moscow',
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};
const line = () => console.log(c.dim('─'.repeat(64)));

const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const firstSentence = (s) => (s.match(/^[^.!?]+[.!?]/)?.[0] || s).trim();

function loadState() {
  if (!fs.existsSync(S.state)) return { uploaded: [], failed: [] };
  return JSON.parse(fs.readFileSync(S.state, 'utf8'));
}
const saveState = (s) => fs.writeFileSync(S.state, JSON.stringify(s, null, 2) + '\n', 'utf8');

/* --------------------------- Доступ -------------------------------- */

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: CFG.clientId,
      client_secret: CFG.clientSecret,
      refresh_token: CFG.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json();
  if (!body.access_token) {
    throw new Error(`не удалось обновить доступ: ${body.error_description || body.error || 'неизвестно'}`);
  }
  return body.access_token;
}

/**
 * Качает ролик из релиза, если локальной копии нет. В облаке это дешевле,
 * чем тянуть всю сотню: нужен ровно один файл на запуск.
 */
async function ensureLocal(file) {
  if (fs.existsSync(file)) return file;
  if (!CFG.mediaBase) throw new Error(`нет файла ${path.basename(file)} и не задан адрес хостинга`);
  const url = `${CFG.mediaBase}/${path.basename(file)}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`не скачать ${path.basename(file)}: HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/* --------------------------- Загрузка ------------------------------ */

/** Возобновляемая загрузка: сначала метаданные, потом сам файл. */
async function upload(token, file, meta) {
  const size = fs.statSync(file).size;

  const start = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
        'x-upload-content-length': String(size),
        'x-upload-content-type': 'video/mp4',
      },
      body: JSON.stringify(meta),
    }
  );
  if (!start.ok) {
    const t = await start.text();
    throw new Error(`YouTube отклонил метаданные: HTTP ${start.status} ${t.slice(0, 200)}`);
  }
  const location = start.headers.get('location');
  if (!location) throw new Error('YouTube не вернул адрес для загрузки');

  const put = await fetch(location, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'content-length': String(size) },
    body: fs.readFileSync(file),
  });
  const body = await put.json().catch(() => ({}));
  if (!put.ok || !body.id) {
    throw new Error(`загрузка не прошла: HTTP ${put.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.id;
}

/* --------------------------- Очередь ------------------------------- */

function buildQueue() {
  const items = S.load ? S.load() : validateAndFix(findPromptsJson(projectDir).data).items;
  const done = new Set(loadState().uploaded.map((u) => u.id));

  return items
    .filter((i) => !done.has(i.id))
    .map((item) => {
      const file = path.join(S.reels, `${S.prefix}-${pad3(item.id)}.mp4`);
      const captionFile = path.join(S.reels, `${S.prefix}-${pad3(item.id)}.txt`);
      // В облаке рядом с mp4 подписи нет — собираем её из данных так же,
      // как это делает сборщик роликов, вместе со ссылкой на репозиторий.
      const description = fs.existsSync(captionFile)
        ? fs.readFileSync(captionFile, 'utf8').trim()
        : [
            item.title,
            '',
            item.headline ? item.headline.replace(/\n/g, ' ') : '',
            item.headline ? '' : null,
            item.prompt || item.description,
            item.repo ? '' : null,
            item.repo ? `github.com/${item.repo}` : null,
          ]
            .filter((x) => x !== null)
            .join('\n')
            .trim();
      return { id: item.id, file, exists: fs.existsSync(file), title: S.title(item), description };
    });
}

/* --------------------------- Команды ------------------------------- */

function checkConfig() {
  const missing = [];
  if (!CFG.clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!CFG.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!CFG.refreshToken) missing.push('YOUTUBE_REFRESH_TOKEN');
  return missing;
}

async function cmdCheck() {
  const missing = checkConfig();
  line();
  console.log(c.b('MHS · YouTube'));
  line();
  if (missing.length) {
    console.log(c.warn(`  Не настроено: ${missing.join(', ')}`));
    console.log(c.dim('  Разовая выдача доступа:  npm run youtube:auth'));
    line();
    process.exitCode = 1;
    return;
  }
  const token = await accessToken();
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    { headers: { authorization: `Bearer ${token}` } }
  );
  const body = await res.json();
  const ch = body.items?.[0];

  if (res.status === 403 && /scope/i.test(body.error?.message || '')) {
    // Токен выдан только на загрузку — читать канал нечем, но выгружать можно
    console.log(c.warn('  Канал показать не могу: токен выдан без права на чтение.'));
    console.log(c.dim('  Загрузка при этом работает. Чтобы видеть канал:  npm run youtube:auth'));
  } else if (!ch) {
    console.log(c.err('  Канал не найден. Возможно, у аккаунта его ещё нет,'));
    console.log(c.err('  либо канал в бренд-аккаунте — тогда выбирайте его при выдаче доступа.'));
    process.exitCode = 1;
    return;
  } else {
    console.log(`  Канал:       ${c.ok(ch.snippet.title)}`);
    console.log(`  Подписчиков: ${ch.statistics.subscriberCount}  ·  видео: ${ch.statistics.videoCount}`);
  }
  console.log(`  Приватность: ${CFG.privacy}`);
  console.log(`  Расписание:  ${CFG.times.join(', ')} ${CFG.timezone}`);
  const q = buildQueue();
  console.log(`  В очереди:   ${q.length} (${q.filter((x) => x.exists).length} файлов на месте)`);
  line();
}

async function cmdNext({ confirm, count, ifDue }) {
  let slotKey = null;
  if (ifDue) {
    const done = new Set(loadState().uploaded.map((u) => u.slot).filter(Boolean));
    const { slot, now } = findDueSlot({
      times: CFG.times, grace: CFG.grace, timezone: CFG.timezone, done,
    });
    if (!slot) {
      console.log(c.dim(`${now.clock} ${CFG.timezone} — не время. Слоты: ${CFG.times.join(', ')}`));
      return;
    }
    slotKey = slot.key;
    console.log(c.dim(`слот ${slot.time}, опоздание ${slot.late} мин`));
  }

  const missing = checkConfig();
  if (missing.length) {
    console.error(c.err(`Не настроено: ${missing.join(', ')}`));
    process.exit(1);
  }
  const queue = buildQueue().slice(0, count);
  if (!queue.length) {
    console.log(c.warn('Очередь пуста.'));
    return;
  }
  if (!confirm) {
    line();
    console.log(c.warn('ПРОБНЫЙ ПРОГОН — ничего не загружается'));
    for (const v of queue) {
      console.log(`  ${c.b(v.title)}`);
      console.log(
        c.dim(`    ${path.basename(v.file)} · ${v.exists ? 'локально' : 'скачается из релиза'} · приватность ${CFG.privacy}`)
      );
    }
    line();
    return;
  }

  const token = await accessToken();
  for (const v of queue) {
    const state = loadState();
    process.stdout.write(`${v.title.slice(0, 50)}… `);
    try {
      await ensureLocal(v.file);
      const id = await upload(token, v.file, {
        snippet: {
          title: v.title,
          description: v.description,
          tags: S.tags,
          categoryId: CFG.categoryId,
          defaultLanguage: 'ru',
        },
        status: {
          privacyStatus: CFG.privacy,
          selfDeclaredMadeForKids: false,
        },
      });
      state.uploaded.push({ id: v.id, videoId: id, at: new Date().toISOString(), slot: slotKey });
      saveState(state);
      console.log(c.ok(`готово → youtu.be/${id}`));
    } catch (e) {
      state.failed.push({ id: v.id, error: e.message, at: new Date().toISOString() });
      saveState(state);
      console.log(c.err(`ошибка: ${e.message}`));
      process.exitCode = 1;
      return;
    }
  }
}

const argv = process.argv.slice(2);
const countArg = (argv.find((a) => a.startsWith('--count=')) || '').split('=')[1];

if (argv.includes('--next'))
  await cmdNext({
    confirm: argv.includes('--confirm'),
    count: Number(countArg) || 1,
    ifDue: argv.includes('--if-due'),
  });
else await cmdCheck();
