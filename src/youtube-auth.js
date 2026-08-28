import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');
const ENV = path.join(projectDir, '.env');

/* ------------------------------------------------------------------ *
 *  Разовая выдача доступа к YouTube
 *
 *  Скрипт поднимает локальный сервер, открывает страницу согласия
 *  Google и ловит ответ. Полученный refresh token дописывается в .env
 *  на этой машине. Ни секрет, ни токен нигде больше не появляются.
 * ------------------------------------------------------------------ */

// Порт можно сменить, если 8788 занят: OAUTH_PORT=8899 npm run youtube:auth
const PORT = Number(process.env.OAUTH_PORT) || 8788;
const REDIRECT = `http://localhost:${PORT}`;
// upload — то, ради чего всё затевалось; readonly нужен только чтобы
// перед выгрузкой показать, на какой канал она пойдёт.
const SCOPE = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

function readEnv() {
  if (!fs.existsSync(ENV)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    out[k.trim()] = rest.join('=').trim();
  }
  return out;
}

/** Дописывает или заменяет одну переменную, не трогая остальные. */
function upsertEnv(key, value) {
  let text = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text)
    ? text.replace(re, `${key}=${value}`)
    : text.replace(/\n*$/, '\n') + `${key}=${value}\n`;
  fs.writeFileSync(ENV, text, 'utf8');
}

async function main() {
  const env = readEnv();
  const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(c.err('В .env нет GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.'));
    console.error(c.dim('Впишите их и запустите снова:  open -e "' + ENV + '"'));
    process.exit(1);
  }

  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
    });

  console.log(c.b('Адрес возврата, который должен быть разрешён в Google:'));
  console.log('  ' + c.ok(REDIRECT));
  console.log(
    c.dim(
      '  Клиент типа Web application: Cloud Console → Credentials → ваш OAuth client\n' +
        '  → Authorized redirect URIs → Add URI → вставить строку выше → Save.\n' +
        '  Клиент типа Desktop app: ничего прописывать не нужно.\n'
    )
  );

  console.log(c.b('Открываю страницу согласия Google…'));
  console.log(c.dim('Если не открылась, перейдите вручную:\n' + url + '\n'));
  execFile('open', [url], () => {});

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const q = new URL(req.url, REDIRECT).searchParams;
      const body = q.get('code')
        ? 'Доступ выдан. Можно закрыть вкладку и вернуться в терминал.'
        : `Не получилось: ${q.get('error') || 'нет кода'}`;
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(body);
      server.close();
      q.get('code') ? resolve(q.get('code')) : reject(new Error(q.get('error') || 'нет кода'));
    });
    server.listen(PORT);
    server.on('error', (e) =>
      reject(
        new Error(
          e.code === 'EADDRINUSE'
            ? `порт ${PORT} занят — запустите с другим: OAUTH_PORT=8899 npm run youtube:auth`
            : e.message
        )
      )
    );
    setTimeout(() => {
      server.close();
      reject(new Error('за 5 минут доступ не выдали'));
    }, 300000);
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const body = await res.json();
  if (!body.refresh_token) {
    console.error(c.err(`Google не выдал refresh token: ${body.error_description || JSON.stringify(body)}`));
    process.exit(1);
  }

  upsertEnv('YOUTUBE_REFRESH_TOKEN', body.refresh_token);

  console.log(c.ok('\nГотово. Токен записан в .env — на экран не печатаю.\n'));
  console.log('Теперь то же самое нужно положить в GitHub Secrets, чтобы работало без вашего мака:');
  console.log(c.dim('  https://github.com/C0mrade530/mhs-reels/settings/secrets/actions\n'));
  console.log('  GOOGLE_CLIENT_ID       — из Google Cloud Console');
  console.log('  GOOGLE_CLIENT_SECRET   — оттуда же');
  console.log('  YOUTUBE_REFRESH_TOKEN  — открыть .env и скопировать значение\n');
  console.log(c.dim('Проверить локально:  npm run youtube -- --check'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(c.err(e.message));
    process.exit(1);
  });
}
