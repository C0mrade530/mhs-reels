import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');
const OUT = path.join(projectDir, 'output', 'radar-candidates.json');

/* ------------------------------------------------------------------ *
 *  Сбор кандидатов для рубрики «GitHub-находка»
 *
 *  Ищем не «популярные репозитории вообще», а то, что закрывает
 *  конкретные интересы рубрики: халява вместо платных сервисов,
 *  автоматизация рутины, AI под рукой, инструменты для заработка.
 * ------------------------------------------------------------------ */

const QUERIES = [
  // бесплатные замены платным сервисам
  'topic:self-hosted stars:>4000 pushed:>2026-01-01',
  'topic:open-source-alternative stars:>2000 pushed:>2026-01-01',
  'alternative to stars:>6000 pushed:>2026-01-01 in:description',
  // AI, который можно запустить у себя
  'topic:llm stars:>6000 pushed:>2026-02-01',
  'topic:ai-agent stars:>4000 pushed:>2026-02-01',
  'topic:chatgpt stars:>5000 pushed:>2026-01-01',
  'topic:stable-diffusion stars:>5000 pushed:>2026-01-01',
  'local llm stars:>5000 pushed:>2026-02-01 in:description',
  // автоматизация рутины
  'topic:automation stars:>5000 pushed:>2026-01-01',
  'topic:workflow-automation stars:>3000 pushed:>2026-01-01',
  'topic:web-scraping stars:>4000 pushed:>2026-01-01',
  'topic:browser-automation stars:>4000 pushed:>2026-01-01',
  // инструменты, из которых делают продукт
  'topic:no-code stars:>3000 pushed:>2026-01-01',
  'topic:low-code stars:>4000 pushed:>2026-01-01',
  'topic:video-editing stars:>3000 pushed:>2026-01-01',
  'topic:text-to-speech stars:>4000 pushed:>2026-01-01',
  'topic:pdf stars:>3000 pushed:>2026-01-01',
  'topic:productivity stars:>5000 pushed:>2026-01-01',
];

/** Мусор, который технически подходит под запрос, но рубрике не годится. */
const REJECT_NAME = /^(awesome|free-programming|coding-interview|system-design|build-your-own|project-based|30-days|the-book|developer-roadmap|public-apis)/i;
const REJECT_DESC = /(курс|roadmap|list of|collection of|curated list|interview|cheat ?sheet|tutorial|learning|книг)/i;

async function search(q, perPage = 40) {
  const { stdout } = await run('gh', [
    'api',
    '-X', 'GET',
    'search/repositories',
    '-f', `q=${q}`,
    '-f', 'sort=stars',
    '-f', 'order=desc',
    '-F', `per_page=${perPage}`,
    '--jq',
    '.items[] | {full_name, description, stars: .stargazers_count, language, topics, url: .html_url, homepage, pushed_at, archived, license: .license.spdx_id}',
  ], { maxBuffer: 1 << 26 });

  return stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function isUsable(r) {
  if (!r.description || r.description.length < 20) return false;
  if (r.archived) return false;
  const [, name] = r.full_name.split('/');
  if (REJECT_NAME.test(name) || REJECT_NAME.test(r.full_name)) return false;
  if (REJECT_DESC.test(r.description)) return false;
  return true;
}

async function main() {
  const seen = new Map();
  console.log('Ищу репозитории по темам рубрики…\n');

  for (const q of QUERIES) {
    try {
      const items = await search(q);
      let fresh = 0;
      for (const r of items) {
        if (seen.has(r.full_name)) continue;
        if (!isUsable(r)) continue;
        seen.set(r.full_name, r);
        fresh++;
      }
      console.log(`  ${String(fresh).padStart(3)} новых  ${q.slice(0, 52)}`);
    } catch (e) {
      console.log(`  ошибка запроса: ${q.slice(0, 40)} — ${e.message.split('\n')[0]}`);
    }
  }

  const all = [...seen.values()].sort((a, b) => b.stars - a.stars);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2) + '\n', 'utf8');

  console.log(`\nСобрано кандидатов: ${all.length}`);
  console.log(`Звёзды: ${all[all.length - 1]?.stars}–${all[0]?.stars}`);
  console.log(`Записано в ${path.relative(projectDir, OUT)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
