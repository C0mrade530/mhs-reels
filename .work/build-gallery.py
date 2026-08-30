import json, base64, pathlib, html

W = pathlib.Path('.work/web')
decks = []
for f in sorted(pathlib.Path('carousel-decks').glob('deck-*.json')):
    d = json.loads(f.read_text())
    did = f"deck-{d['id']:03d}"
    slides = sorted(W.glob(f'{did}-slide-*.jpg'))
    d['imgs'] = ['data:image/jpeg;base64,' + base64.b64encode(p.read_bytes()).decode() for p in slides]
    cover = d['slides'][0]
    d['hook'] = cover.get('hook', '').replace('*', '')
    d['sub'] = cover.get('sub', '')
    decks.append(d)

RUB = {}
for d in decks:
    RUB.setdefault(d.get('rubric', '—'), 0)
    RUB[d['rubric']] += 1

def esc(s): return html.escape(str(s or ''))

cards = []
for d in decks:
    thumbs = ''.join(
        f'<button class="sl" data-deck="{d["id"]}" data-i="{i}" aria-label="Слайд {i+1}">'
        f'<img src="{src}" alt="Слайд {i+1} карусели {d["id"]}" loading="lazy">'
        f'<span class="sl-n">{i+1}</span></button>'
        for i, src in enumerate(d['imgs']))
    tags = ' '.join(d.get('hashtags', []))
    cards.append(f'''
<article class="deck" id="d{d['id']}" data-rubric="{esc(d.get('rubric'))}">
  <header class="deck-head">
    <div class="deck-id"><span class="num">{d['id']:02d}</span><span class="rub">{esc(d.get('rubric'))}</span></div>
    <div class="deck-t">
      <h2>{esc(d['hook'])}</h2>
      <p class="deck-sub">{esc(d['sub'])}</p>
    </div>
    <div class="deck-meta">
      <span class="chip">{d['slideCount']} слайдов</span>
      <span class="chip chip-q">папка deck-{d['id']:03d}</span>
    </div>
  </header>
  <div class="rail" role="list">{thumbs}</div>
  <details class="cap">
    <summary><span>Подпись к посту</span><span class="cap-len">{len(d.get('caption',''))} знаков</span></summary>
    <div class="cap-body">
      <pre id="cap{d['id']}">{esc(d.get('caption'))}

{esc(tags)}</pre>
      <button class="copy" data-cap="cap{d['id']}">Скопировать</button>
    </div>
  </details>
</article>''')

payload = json.dumps({str(d['id']): d['imgs'] for d in decks}, ensure_ascii=False)
total_slides = sum(d['slideCount'] for d in decks)
rub_chips = ''.join(f'<button class="f" data-r="{esc(k)}">{esc(k)} <b>{v}</b></button>' for k, v in RUB.items())

doc = f'''<title>Карусели @mhs.saas</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{{
  --ground:#F7F8FB; --surface:#FFFFFF; --sunk:#EDEFF6;
  --ink:#0C0E16; --ink-2:#3A4055; --muted:#6B7288;
  --line:#DFE3EE; --accent:#1B4DFF; --accent-ink:#FFFFFF; --accent-soft:rgba(27,77,255,.09);
  --shadow:0 1px 2px rgba(12,14,22,.05),0 8px 24px rgba(12,14,22,.06);
}}
@media (prefers-color-scheme:dark){{
  :root:not([data-theme="light"]){{
    --ground:#0A0C13; --surface:#12151F; --sunk:#171B27;
    --ink:#EEF0F7; --ink-2:#B6BCCF; --muted:#8189A3;
    --line:#232838; --accent:#4B79FF; --accent-ink:#06080F; --accent-soft:rgba(75,121,255,.14);
    --shadow:0 1px 2px rgba(0,0,0,.5),0 12px 32px rgba(0,0,0,.4);
  }}
}}
:root[data-theme="dark"]{{
  --ground:#0A0C13; --surface:#12151F; --sunk:#171B27;
  --ink:#EEF0F7; --ink-2:#B6BCCF; --muted:#8189A3;
  --line:#232838; --accent:#4B79FF; --accent-ink:#06080F; --accent-soft:rgba(75,121,255,.14);
  --shadow:0 1px 2px rgba(0,0,0,.5),0 12px 32px rgba(0,0,0,.4);
}}
*{{box-sizing:border-box}}
body{{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;
  font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased;
}}
.wrap{{max-width:1180px;margin:0 auto;padding:0 24px 96px}}

/* ---- шапка ---- */
.top{{padding:56px 0 28px;border-bottom:1px solid var(--line)}}
.eyebrow{{
  font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--accent);margin:0 0 14px
}}
h1{{
  font-family:Oswald,"Arial Narrow",sans-serif;font-weight:700;
  font-size:clamp(34px,6vw,60px);line-height:1.02;letter-spacing:-.01em;
  text-transform:uppercase;margin:0 0 16px;text-wrap:balance
}}
.lede{{max-width:62ch;color:var(--ink-2);font-size:17px;margin:0}}
.stats{{display:flex;flex-wrap:wrap;gap:28px;margin-top:26px}}
.stat b{{
  display:block;font-family:Oswald,sans-serif;font-weight:700;font-size:30px;
  line-height:1;font-variant-numeric:tabular-nums
}}
.stat span{{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--muted)}}

/* ---- фильтр ---- */
.bar{{
  position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
  padding:14px 0;background:color-mix(in srgb,var(--ground) 88%,transparent);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--line);margin-bottom:8px
}}
.f{{
  font:inherit;font-size:13px;padding:7px 13px;border-radius:999px;cursor:pointer;
  border:1px solid var(--line);background:var(--surface);color:var(--ink-2);
  transition:border-color .15s,color .15s
}}
.f b{{font-variant-numeric:tabular-nums;color:var(--muted);font-weight:500}}
.f:hover{{border-color:var(--accent);color:var(--ink)}}
.f[aria-pressed="true"]{{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}}
.f[aria-pressed="true"] b{{color:var(--accent-ink);opacity:.7}}

/* ---- карточка карусели ---- */
.deck{{padding:38px 0;border-bottom:1px solid var(--line)}}
.deck[hidden]{{display:none}}
.deck-head{{display:grid;grid-template-columns:64px 1fr auto;gap:22px;align-items:start;margin-bottom:20px}}
.deck-id{{display:flex;flex-direction:column;gap:6px}}
.num{{
  font-family:Oswald,sans-serif;font-weight:700;font-size:40px;line-height:.9;
  color:var(--accent);font-variant-numeric:tabular-nums
}}
.rub{{
  font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--muted);writing-mode:horizontal-tb
}}
.deck-t h2{{
  font-family:Oswald,"Arial Narrow",sans-serif;font-weight:700;
  font-size:clamp(19px,2.4vw,27px);line-height:1.12;text-transform:uppercase;
  margin:0 0 8px;letter-spacing:-.005em;text-wrap:balance
}}
.deck-sub{{margin:0;color:var(--muted);font-size:14.5px;max-width:64ch}}
.deck-meta{{display:flex;flex-direction:column;gap:6px;align-items:flex-end}}
.chip{{
  font-family:"IBM Plex Mono",monospace;font-size:11px;padding:4px 9px;
  border:1px solid var(--line);border-radius:5px;color:var(--ink-2);white-space:nowrap
}}
.chip-q{{color:var(--muted);border-style:dashed}}

/* ---- лента слайдов ---- */
.rail{{
  display:flex;gap:12px;overflow-x:auto;padding:4px 4px 16px;
  scroll-snap-type:x proximity;scrollbar-width:thin
}}
.rail::-webkit-scrollbar{{height:8px}}
.rail::-webkit-scrollbar-thumb{{background:var(--line);border-radius:99px}}
.sl{{
  position:relative;flex:0 0 auto;padding:0;border:1px solid var(--line);
  border-radius:8px;overflow:hidden;background:var(--sunk);cursor:zoom-in;
  scroll-snap-align:start;line-height:0;transition:transform .16s,border-color .16s
}}
.sl img{{width:176px;height:220px;object-fit:cover;display:block}}
.sl:hover{{transform:translateY(-3px);border-color:var(--accent)}}
.sl:focus-visible{{outline:2px solid var(--accent);outline-offset:2px}}
.sl-n{{
  position:absolute;left:6px;top:6px;font-family:"IBM Plex Mono",monospace;font-size:10px;
  padding:2px 5px;border-radius:4px;background:rgba(10,12,19,.72);color:#fff;line-height:1.4
}}

/* ---- подпись ---- */
.cap{{border:1px solid var(--line);border-radius:9px;background:var(--surface);overflow:hidden}}
.cap summary{{
  cursor:pointer;padding:12px 15px;display:flex;justify-content:space-between;
  align-items:center;font-size:13.5px;font-weight:500;list-style:none
}}
.cap summary::-webkit-details-marker{{display:none}}
.cap summary::before{{content:"▸ ";color:var(--accent)}}
.cap[open] summary::before{{content:"▾ "}}
.cap-len{{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--muted)}}
.cap-body{{padding:0 15px 15px;border-top:1px solid var(--line)}}
.cap pre{{
  white-space:pre-wrap;font-family:"IBM Plex Sans",sans-serif;font-size:14px;
  line-height:1.62;color:var(--ink-2);margin:14px 0;max-width:70ch
}}
.copy{{
  font:inherit;font-size:13px;padding:7px 15px;border-radius:6px;cursor:pointer;
  border:1px solid var(--accent);background:transparent;color:var(--accent);transition:background .15s
}}
.copy:hover{{background:var(--accent-soft)}}
.copy.done{{background:var(--accent);color:var(--accent-ink)}}

/* ---- лайтбокс ---- */
.lb{{
  position:fixed;inset:0;z-index:100;display:none;place-items:center;
  background:rgba(6,8,15,.93);padding:20px
}}
.lb[open]{{display:grid}}
.lb img{{max-width:min(92vw,560px);max-height:88vh;border-radius:10px;display:block}}
.lb-bar{{
  position:fixed;top:14px;left:0;right:0;display:flex;justify-content:center;gap:12px;align-items:center
}}
.lb-bar span{{
  font-family:"IBM Plex Mono",monospace;font-size:12px;color:#fff;opacity:.75;
  font-variant-numeric:tabular-nums
}}
.lb button{{
  font:inherit;font-size:13px;padding:6px 14px;border-radius:6px;cursor:pointer;
  border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff
}}
.lb button:hover{{border-color:#fff}}
.nav{{position:fixed;top:50%;transform:translateY(-50%);font-size:26px;padding:10px 16px}}
.nav-p{{left:16px}} .nav-n{{right:16px}}

.foot{{padding-top:34px;color:var(--muted);font-size:13.5px;max-width:68ch}}
.foot code{{
  font-family:"IBM Plex Mono",monospace;font-size:12.5px;background:var(--sunk);
  padding:2px 6px;border-radius:4px;color:var(--ink-2)
}}
@media (max-width:760px){{
  .deck-head{{grid-template-columns:48px 1fr;gap:14px}}
  .deck-meta{{grid-column:1/-1;flex-direction:row;align-items:center}}
  .sl img{{width:140px;height:175px}}
}}
@media (prefers-reduced-motion:reduce){{*{{transition:none!important}}}}
</style>

<div class="wrap">
  <header class="top">
    <p class="eyebrow">@mhs.saas · первая партия</p>
    <h1>Десять каруселей<br>к публикации</h1>
    <p class="lede">Готовые слайды 1080×1350 с подписями к постам. Каждая карусель проверена на факты,
      практическую пользу и юридическую чистоту, в конце — оффер на AI-аудит.</p>
    <div class="stats">
      <div class="stat"><b>10</b><span>каруселей</span></div>
      <div class="stat"><b>{total_slides}</b><span>слайдов</span></div>
      <div class="stat"><b>5</b><span>рубрик</span></div>
      <div class="stat"><b>1080×1350</b><span>формат</span></div>
    </div>
  </header>

  <nav class="bar" aria-label="Фильтр по рубрикам">
    <button class="f" data-r="all" aria-pressed="true">Все <b>10</b></button>
    {rub_chips}
  </nav>

  {''.join(cards)}

  <p class="foot">Оригиналы в полном разрешении лежат в проекте:
    <code>output/carousel-cards/deck-001…010/</code>. В каждой папке слайды PNG,
    <code>caption.txt</code> с подписью и хештегами и <code>about.txt</code> с обоснованием числа слайдов.
    Здесь картинки сжаты для быстрой загрузки — для публикации берите PNG из папок.</p>
</div>

<dialog class="lb" id="lb">
  <div class="lb-bar"><span id="lbc"></span><button id="lbx">Закрыть ✕</button></div>
  <button class="nav nav-p" id="lbp" aria-label="Предыдущий">‹</button>
  <img id="lbi" alt="">
  <button class="nav nav-n" id="lbn" aria-label="Следующий">›</button>
</dialog>

<script>
const IMGS = {payload};
const lb=document.getElementById('lb'), lbi=document.getElementById('lbi'), lbc=document.getElementById('lbc');
let cur={{d:null,i:0}};
function show(d,i){{
  const a=IMGS[d]; if(!a) return;
  cur={{d,i:(i+a.length)%a.length}};
  lbi.src=a[cur.i]; lbc.textContent='Карусель '+String(d).padStart(2,'0')+' · слайд '+(cur.i+1)+' из '+a.length;
  if(!lb.open) lb.showModal();
}}
document.querySelectorAll('.sl').forEach(b=>b.addEventListener('click',()=>show(b.dataset.deck,+b.dataset.i)));
document.getElementById('lbx').onclick=()=>lb.close();
document.getElementById('lbp').onclick=e=>{{e.stopPropagation();show(cur.d,cur.i-1)}};
document.getElementById('lbn').onclick=e=>{{e.stopPropagation();show(cur.d,cur.i+1)}};
lb.addEventListener('click',e=>{{if(e.target===lb)lb.close()}});
document.addEventListener('keydown',e=>{{
  if(!lb.open) return;
  if(e.key==='ArrowLeft')show(cur.d,cur.i-1);
  if(e.key==='ArrowRight')show(cur.d,cur.i+1);
}});
document.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',async()=>{{
  try{{
    await navigator.clipboard.writeText(document.getElementById(b.dataset.cap).textContent);
    b.textContent='Скопировано'; b.classList.add('done');
    setTimeout(()=>{{b.textContent='Скопировать'; b.classList.remove('done')}},1600);
  }}catch(e){{ b.textContent='Выделите вручную'; }}
}}));
document.querySelectorAll('.f').forEach(f=>f.addEventListener('click',()=>{{
  const r=f.dataset.r;
  document.querySelectorAll('.f').forEach(x=>x.setAttribute('aria-pressed',x===f?'true':'false'));
  document.querySelectorAll('.deck').forEach(d=>{{
    d.hidden = r!=='all' && d.dataset.rubric!==r;
  }});
}}));
</script>'''

out = pathlib.Path('/private/tmp/claude-501/-Users-mak-THE-MHS-content/095e6db5-a33a-4ee1-8df9-99b4991e03e2/scratchpad/carousels.html')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(doc, encoding='utf-8')
print(f'{out} — {out.stat().st_size/1024/1024:.1f} МБ, каруселей {len(decks)}, слайдов {total_slides}')
