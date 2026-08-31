import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');

try {
  process.loadEnvFile(path.join(projectDir, '.env'));
} catch {
  /* .env может отсутствовать — тогда переменные берём из окружения */
}

/* ------------------------------------------------------------------ *
 *  Комментарий → личное сообщение.
 *
 *  Instagram разрешает ответить в директ на комментарий («private reply»),
 *  и только так: писать в личку человеку, который вам не писал, нельзя.
 *  Правила Meta, которые определяют всю конструкцию ниже:
 *    · один приватный ответ на один комментарий, второй раз — отказ;
 *    · только в течение 7 суток с момента комментария;
 *    · нужны права instagram_business_manage_comments и
 *      instagram_business_manage_messages;
 *    · в приложении Instagram: Настройки → Сообщения → Подключённые
 *      инструменты → доступ к сообщениям должен быть включён.
 *
 *  Поэтому скрипт делит комментарии на два ведра: свежие уходят в директ
 *  сами, протухшие попадают в отчёт — их либо забирают публичным ответом
 *  под комментарием, либо руками с телефона.
 * ------------------------------------------------------------------ */

const STATE = path.join(projectDir, 'output', 'dm-state.json');
const QUEUE = path.join(projectDir, 'output', 'dm-queue.json');
const WINDOW_DAYS = 7;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};

/* Токен для директа держим отдельно от токена публикации. Права на
   сообщения выдаются отдельно, и перевыпуск ради них не должен трогать
   то, что уже годами исправно постит рилсы. Нет своего — берём общий. */
const TOKEN = process.env.IG_DM_TOKEN || process.env.IG_ACCESS_TOKEN;

const CFG = {
  token: TOKEN,
  userId: process.env.IG_USER_ID,
  pageId: process.env.PAGE_ID, // подхватывается сам, см. resolveMe
  version: process.env.GRAPH_VERSION || 'v23.0',
  host: process.env.GRAPH_HOST
    ? process.env.GRAPH_HOST.replace(/^https?:\/\//, '')
    : String(TOKEN || '').startsWith('IGAA')
      ? 'graph.instagram.com'
      : 'graph.facebook.com',
  keyword: (val('keyword', process.env.DM_KEYWORD || 'skill')).toLowerCase(),
  // Сколько постов проверять с конца ленты. Комментарии старше недели всё
  // равно недоступны для директа, глубже лезть незачем.
  posts: Number(val('posts', 25)),
  send: has('--send'),
  // Публичный ответ под комментарием обязателен: без него директ от
  // незнакомого аккаунта падает в «Запросы» и человек его не видит.
  // Флаг оставлен только на случай разбора аварии.
  reply: !has('--no-reply'),
  limit: Number(val('limit', 0)) || Infinity,
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

async function call(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    const err = new Error(
      `Graph API ${res.status}: ${e.message || 'неизвестная ошибка'}${e.code ? ` (code ${e.code})` : ''}`
    );
    // Коды нужны выше по стеку: по ним отличают «у человека закрыт директ»
    // от «сломался наш токен», а это два совершенно разных сценария.
    err.status = res.status;
    err.code = e.code;
    err.subcode = e.error_subcode;
    throw err;
  }
  return body;
}

function loadState() {
  if (!fs.existsSync(STATE)) return { sent: [], failed: [] };
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

function saveState(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n', 'utf8');
}

/** Текст письма. Правится в dm-message.txt, без захода в код. */
function messageFor(comment) {
  const file = path.join(projectDir, 'dm-message.txt');
  const raw = process.env.DM_TEXT || (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  const text = raw.trim();
  if (!text) throw new Error('пустой текст сообщения: заполните dm-message.txt или DM_TEXT в .env');
  // Ссылку с меткой источника подставляем сами: в боте будет видно,
  // что человек пришёл из комментариев, а не из шапки профиля.
  const bot = (process.env.TG_BOT_URL || '').trim();
  /* Письмо без ссылки — худший исход из возможных: приватный ответ на
     комментарий даётся один раз, второго шанса написать этому человеку
     не будет. Поэтому лучше упасть до отправки. */
  if (text.includes('{{link}}') && !bot) {
    throw new Error('в тексте есть {{link}}, но TG_BOT_URL не задан — письмо ушло бы без ссылки');
  }
  const tagged = bot ? `${bot}${bot.includes('?') ? '&' : '?'}start=ig_comment` : '';
  return text
    .replaceAll('{{username}}', comment.username ? '@' + comment.username : '')
    .replaceAll('{{link}}', tagged)
    .trim();
}

/* Два вида публичного ответа под комментарием.
   dm  — директ ушёл, зовём человека его прочитать;
   closed — директ не доставить (закрытые сообщения), просим написать нам. */
const REPLY_KIND = {
  dm: { file: 'dm-reply.txt', env: 'DM_REPLY_TEXT' },
  closed: { file: 'dm-closed.txt', env: 'DM_CLOSED_TEXT' },
};

/**
 * Текст публичного ответа под комментарием. Правится в dm-reply.txt и
 * dm-closed.txt, каждая непустая строка — отдельный вариант.
 *
 * Вариантов несколько не для красоты: одинаковый комментарий, размноженный
 * под десятками постов, Instagram считает спамом и глушит показы. Выбор
 * привязан к id комментария, а не к случайности, — при повторном запуске
 * человек увидит ту же фразу, что и в первый раз.
 */
function replyFor(comment, kind = 'dm') {
  const k = REPLY_KIND[kind] || REPLY_KIND.dm;
  const file = path.join(projectDir, k.file);
  const raw = process.env[k.env] || (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  const variants = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!variants.length) {
    throw new Error(`пустой текст ответа: заполните ${k.file} или ${k.env} в .env`);
  }
  let h = 0;
  for (const ch of String(comment.comment_id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return variants[h % variants.length].replaceAll(
    '{{username}}',
    comment.username ? '@' + comment.username : ''
  );
}

/**
 * Кто мы такие. Развилка та же, что и с хостом.
 *
 * Instagram Login: токен принадлежит самому Instagram-аккаунту, спрашивать
 * нечего.
 *
 * Facebook Login: токен принадлежит Странице или пользователю, а нужен
 * связанный с ней Instagram-аккаунт — с него читаются посты. И отдельно
 * нужен id Страницы: приватные ответы уходят от её имени, а не от имени
 * Instagram-аккаунта. Оба вытаскиваем сами, чтобы их не пришлось искать
 * руками в Graph API Explorer и вписывать в секреты.
 */
async function resolveMe() {
  const tok = encodeURIComponent(CFG.token);

  if (CFG.host === 'graph.instagram.com') {
    const body = await call(API(`${CFG.userId || 'me'}?fields=id,username&access_token=${tok}`));
    CFG.userId = body.id;
    return body;
  }

  const me = await call(
    API(`me?fields=id,name,username,instagram_business_account{id,username}&access_token=${tok}`)
  );

  // Токен Страницы: Instagram-аккаунт висит на ней полем.
  if (me.instagram_business_account) {
    CFG.pageId = CFG.pageId || me.id;
    CFG.userId = CFG.userId || me.instagram_business_account.id;
    return me.instagram_business_account;
  }

  // Токен пользователя: перебираем его Страницы и берём первую с Instagram.
  const pages = await call(
    API(`me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${tok}`)
  );
  const page = (pages.data || []).find((p) => p.instagram_business_account);
  if (!page) {
    throw new Error(
      'к этому токену не привязан Instagram-аккаунт: проверьте, что Страница связана с профилем и что выданы права pages_show_list и instagram_basic'
    );
  }
  CFG.pageId = CFG.pageId || page.id;
  CFG.userId = CFG.userId || page.instagram_business_account.id;
  return page.instagram_business_account;
}

/** Лента постов, от свежих к старым, с пагинацией. */
async function fetchMedia(limit) {
  const out = [];
  let url = API(
    `${CFG.userId}/media?fields=id,caption,permalink,timestamp,comments_count&limit=25&access_token=${encodeURIComponent(CFG.token)}`
  );
  while (url && out.length < limit) {
    const body = await call(url);
    out.push(...(body.data || []));
    url = body.paging?.next || null;
  }
  return out.slice(0, limit);
}

/** Комментарии под одним постом вместе с ветками ответов. */
async function fetchComments(mediaId) {
  const out = [];
  let url = API(
    `${mediaId}/comments?fields=id,text,username,timestamp,replies{id,text,username,timestamp}&limit=50&access_token=${encodeURIComponent(CFG.token)}`
  );
  while (url) {
    const body = await call(url);
    out.push(...(body.data || []));
    url = body.paging?.next || null;
  }
  return out;
}

/**
 * Приватный ответ на комментарий. Адресат задаётся не человеком, а
 * комментарием — своего id получателя знать не нужно и нельзя.
 */
async function privateReply(commentId, text) {
  // На токене Instagram Login отправитель — сам аккаунт, на токене через
  // Facebook Login — связанная Страница.
  let sender = 'me';
  if (CFG.host !== 'graph.instagram.com') {
    if (!CFG.pageId) {
      throw new Error(
        'не найден id Страницы, а через Facebook Login директ уходит от её имени — задайте PAGE_ID'
      );
    }
    sender = CFG.pageId;
  }
  return call(API(`${sender}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
      access_token: CFG.token,
    }),
  });
}

/**
 * Публичный ответ веткой под комментарием. Ограничения семи суток здесь
 * нет — это обычный комментарий, а не сообщение.
 */
async function publicReply(commentId, text) {
  const params = new URLSearchParams({ message: text, access_token: CFG.token });
  return call(API(`${commentId}/replies`), { method: 'POST', body: params });
}

/*
 * Отказ на отправке директа бывает двух пород, и путать их нельзя.
 *
 * Системный — сломался токен, не выданы права, упёрлись в лимит, лежит сам
 * Instagram. Такой отказ прилетит на каждом получателе подряд, человек тут
 * ни при чём, и писать ему «напишите нам сами» было бы враньём.
 *
 * Адресный — конкретный человек не принимает сообщения: закрыт директ,
 * ограничены сообщения от незнакомых, аккаунт заблокировал нас. Вот тут и
 * нужен публичный ответ с просьбой написать первым.
 *
 * Перечислены системные коды, всё остальное считаем адресным. Так безопаснее:
 * системный сбой ловится на первом же получателе и останавливает прогон
 * целиком — до второго человека дело не дойдёт.
 */
const SYSTEMIC_CODES = new Set([
  1, 2, // временный сбой платформы
  4, 17, 32, 613, // лимиты запросов
  3, 10, 200, 299, // нет прав у приложения
  102, 190, 463, 467, // токен протух или отозван
]);

/* Коды 200 и 10 двусмысленны: под ними Meta отдаёт и «приложению не выданы
   права», и «этот человек не принимает от вас сообщения». Различаем по
   тексту ошибки — он у адресных отказов узнаваемый. */
const ADDRESSED = /isn'?t available|not available|cannot receive|can'?t receive|isn'?t receiving|not receiving|no longer receiving|blocked|недоступ|не может получать|не принимает/i;

function isSystemic(err) {
  if (ADDRESSED.test(err.message || '')) return false;
  if (err.status >= 500) return true;
  if (err.code === undefined) return true; // сеть не ответила — не вина человека
  return SYSTEMIC_CODES.has(Number(err.code));
}

const ageDays = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

async function main() {
  if (!CFG.token) {
    console.error(c.err('Нет IG_ACCESS_TOKEN — заполните .env'));
    process.exit(1);
  }

  line();
  console.log(c.b(`  Комментарии со словом «${CFG.keyword}» → директ`));
  line();

  const me = await resolveMe();
  console.log(
    c.dim(
      `  аккаунт: ${me.username ? '@' + me.username : me.id}  ·  ${CFG.host}` +
        (CFG.pageId ? `  ·  Страница ${CFG.pageId}` : '')
    )
  );

  const media = await fetchMedia(CFG.posts);
  console.log(c.dim(`  постов проверяем: ${media.length}`));

  const state = loadState();
  const done = new Set(state.sent.map((s) => s.comment_id));

  /* Instagram отдаёт счётчик комментариев прямо в посте. Сверяем его с тем,
     что реально пришло: расхождение означает, что комментарии есть, а нам их
     не показывают — совсем другая болезнь, чем «их просто нет». */
  const counted = media.reduce((n, m) => n + Number(m.comments_count || 0), 0);
  const withComments = media.filter((m) => Number(m.comments_count || 0) > 0).length;

  const fresh = [];
  const stale = [];
  let scanned = 0;

  for (const m of media) {
    let comments = [];
    try {
      comments = await fetchComments(m.id);
    } catch (e) {
      console.log(c.warn(`  пост ${m.id}: ${e.message}`));
      continue;
    }
    // Ответы в ветках — тоже комментарии, слово может быть и там.
    const flat = comments.flatMap((x) => [x, ...((x.replies && x.replies.data) || [])]);
    for (const cm of flat) {
      scanned++;
      if (!cm.text || !cm.text.toLowerCase().includes(CFG.keyword)) continue;
      if (cm.username && me.username && cm.username === me.username) continue; // свои же ответы
      if (done.has(cm.id)) continue;
      const rec = {
        comment_id: cm.id,
        username: cm.username || null,
        text: cm.text,
        timestamp: cm.timestamp,
        age_days: Number(ageDays(cm.timestamp).toFixed(1)),
        permalink: m.permalink,
      };
      (rec.age_days < WINDOW_DAYS ? fresh : stale).push(rec);
    }
  }

  fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
  fs.writeFileSync(
    QUEUE,
    JSON.stringify({ keyword: CFG.keyword, scanned, fresh, stale }, null, 2) + '\n',
    'utf8'
  );

  line();
  console.log(`  постов с комментариями: ${c.b(withComments)} из ${media.length}`);
  console.log(`  комментариев по счётчику Instagram: ${c.b(counted)}`);
  console.log(`  просмотрено комментариев: ${c.b(scanned)}`);
  if (counted > 0 && scanned === 0) {
    console.log(
      c.warn('  Счётчик не пуст, а комментарии не пришли — похоже на нехватку прав на чтение.')
    );
  }
  console.log(`  со словом «${CFG.keyword}»: ${c.b(fresh.length + stale.length)}`);
  console.log(`  ${c.ok('можно в директ')} (моложе ${WINDOW_DAYS} суток): ${c.b(fresh.length)}`);
  console.log(`  ${c.warn('окно закрыто')} (старше ${WINDOW_DAYS} суток): ${c.b(stale.length)}`);
  console.log(`  уже отвечено раньше: ${c.b(done.size)}`);
  console.log(c.dim(`  разбор целиком: ${path.relative(projectDir, QUEUE)}`));

  if (!CFG.send) {
    /* Показываем тексты ровно в том виде, в каком они уйдут. Опечатку или
       пустую ссылку видно здесь и бесплатно, а не после полусотни писем,
       которые уже не переписать. */
    const sample = fresh[0] || { comment_id: 'demo', username: 'username' };
    line();
    console.log(c.b('  В директ уйдёт:'));
    /* Незаполненная ссылка или пустой файл — повод громко предупредить, но не
       повод обрывать разведку: она ничего не отправляет, а посчитать очередь
       полезно и до того, как тексты доведены до ума. На отправке тот же
       вызов упадёт по-настоящему и остановит рассылку. */
    try {
      console.log(messageFor(sample).split('\n').map((s) => '    ' + s).join('\n'));
    } catch (e) {
      console.log(c.warn(`    ✗ ${e.message}`));
      console.log(c.warn('    Отправка с таким текстом работать не будет.'));
    }
    for (const kind of ['dm', 'closed']) {
      console.log(c.b(`\n  Под комментарием (${kind === 'dm' ? 'директ ушёл' : 'директ закрыт'}):`));
      try {
        console.log('    ' + replyFor(sample, kind));
      } catch (e) {
        console.log(c.warn(`    ✗ ${e.message}`));
      }
    }
    line();
    console.log(c.dim('  Это разведка, ничего не отправлено.'));
    console.log(c.dim('  Отправить свежим:  npm run dm -- --send'));
    line();
    return;
  }

  // Пауза между обращениями: лимиты Meta считаются на аккаунт, и ровная
  // очередь выглядит живее, чем залп в одну секунду.
  const pause = () => new Promise((r) => setTimeout(r, 1500));

  /* Директ ушёл, а публичный ответ мог не уйти — сеть, лимит, что угодно.
     Повторно слать директ на тот же комментарий Instagram не даст, поэтому
     хвост доносим отдельным проходом, до основной рассылки. */
  const pending = CFG.reply ? state.sent.filter((s) => s.replied === false) : [];
  if (pending.length) {
    line();
    console.log(c.b(`  Досылаем ${pending.length} публичных ответов с прошлого раза`));
    for (const rec of pending) {
      const who = rec.username ? '@' + rec.username : rec.comment_id;
      try {
        await publicReply(rec.comment_id, replyFor(rec, rec.kind));
        rec.replied = true;
        saveState(state);
        console.log(`  ${c.ok('✓')} ${who}`);
      } catch (e) {
        console.log(`  ${c.warn('·')} ${who} — ${e.message}`);
      }
      await pause();
    }
  }

  line();
  const batch = fresh.slice(0, CFG.limit);
  console.log(c.b(`  Отправляем ${batch.length} сообщений`));

  let ok = 0;
  let closed = 0;
  let replied = 0;

  /** Публичный ответ + отметка в состоянии. Сбой здесь не теряется:
      запись остаётся с replied: false и доедет следующим запуском. */
  const sayPublicly = async (entry, who) => {
    if (!CFG.reply) return;
    await pause();
    try {
      await publicReply(entry.comment_id, replyFor(entry, entry.kind));
      entry.replied = true;
      replied++;
      console.log(`  ${c.ok('✓ ответ ')} ${who}`);
    } catch (e) {
      console.log(`  ${c.warn('· ответ не ушёл')} ${who} — ${e.message}`);
    }
    saveState(state);
  };

  for (const rec of batch) {
    const who = rec.username ? '@' + rec.username : rec.comment_id;
    let entry;
    try {
      await privateReply(rec.comment_id, messageFor(rec));
      /* Ответ под комментарием — не украшение: сообщение от аккаунта, которому
         человек никогда не писал, ложится в «Запросы» и остаётся непрочитанным.
         Публичная строчка «ответили в директ» — единственное, что заставляет
         человека туда заглянуть. */
      entry = { ...rec, kind: 'dm', sent_at: new Date().toISOString(), replied: false };
      ok++;
      console.log(`  ${c.ok('✓ директ')} ${who}`);
    } catch (e) {
      if (isSystemic(e)) {
        /* Сломано у нас, а не у человека: токен, права, лимит. Такой отказ
           повторится на каждом следующем получателе, поэтому останавливаемся
           здесь же — иначе разложим одну свою поломку на всю очередь. */
        state.failed.push({ ...rec, error: e.message, at: new Date().toISOString() });
        saveState(state);
        line();
        console.error(c.err(`  Отправка остановлена на ${who}: ${e.message}`));
        console.error(c.dim('  Это сбой на нашей стороне — проверьте токен, права и лимиты.'));
        console.error(c.dim(`  Успели отправить: ${ok}. Остальные не тронуты, запустите позже.`));
        line();
        process.exit(1);
      }
      /* У человека закрыт директ или он не принимает сообщения от незнакомых.
         Молча пройти мимо нельзя — он оставил комментарий и чего-то ждёт.
         Пишем публично: напишите нам первым, тогда личка откроется. */
      entry = {
        ...rec,
        kind: 'closed',
        error: e.message,
        sent_at: new Date().toISOString(),
        replied: false,
      };
      closed++;
      console.log(`  ${c.warn('· закрыт директ')} ${who} — ${e.message}`);
    }

    state.sent.push(entry);
    saveState(state);
    await sayPublicly(entry, who);

    /* Три отказа подряд в самом начале — почти наверняка наша поломка,
       которую классификатор не распознал. Лучше остановиться, чем развесить
       под постами два десятка публичных «напишите нам сами». */
    if (ok === 0 && closed >= 3) {
      line();
      console.error(c.err('  Три отказа подряд и ни одной удачной отправки.'));
      console.error(c.dim('  Похоже на сбой у нас, а не на закрытые директы. Остановились.'));
      line();
      process.exit(1);
    }
    await pause();
  }

  line();
  console.log(`  директ отправлен: ${c.ok(ok)} из ${batch.length}`);
  if (closed) console.log(`  закрытый директ, позвали написать нам: ${c.warn(closed)}`);
  if (CFG.reply) console.log(`  ответ под комментарием: ${c.ok(replied)} из ${ok + closed}`);
  line();
}

main().catch((e) => {
  console.error(c.err(`\n  ${e.message}\n`));
  process.exit(1);
});
