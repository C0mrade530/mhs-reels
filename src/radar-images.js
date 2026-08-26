import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pad3, ensureDir } from './utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');
const OUT = path.join(projectDir, 'output', 'radar-images');

/**
 * Официальная OpenGraph-картинка GitHub: она есть у любого репозитория,
 * всегда 1200x630 и показывает имя, описание, звёзды и язык.
 * Скриншотить README-гифки — лотерея: где-то битые ссылки, где-то видео.
 */
const ogUrl = (repo) => `https://opengraph.githubassets.com/mhs/${repo}`;

async function main() {
  const items = JSON.parse(
    fs.readFileSync(path.join(projectDir, 'github-radar-100.json'), 'utf8')
  );
  ensureDir(OUT);

  let ok = 0;
  const failed = [];
  for (const item of items) {
    const file = path.join(OUT, `radar-${pad3(item.id)}.png`);
    if (fs.existsSync(file) && fs.statSync(file).size > 10000) { ok++; continue; }
    try {
      const res = await fetch(ogUrl(item.repo));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10000) throw new Error('картинка подозрительно мелкая');
      fs.writeFileSync(file, buf);
      ok++;
    } catch (e) {
      failed.push(`#${item.id} ${item.repo} — ${e.message}`);
    }
    process.stdout.write(`\r  скачано: ${ok}/${items.length}`);
  }
  console.log('');
  if (failed.length) {
    console.log(`не получилось (${failed.length}):`);
    failed.forEach((f) => console.log('  ' + f));
  } else {
    console.log('все превью на месте');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
