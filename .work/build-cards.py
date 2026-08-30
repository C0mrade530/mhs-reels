# -*- coding: utf-8 -*-
"""Карточки-картинки для доски: одна карточка — одна мысль."""
import os, subprocess, html

OUT = os.path.dirname(os.path.abspath(__file__))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 1600, 1000

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:%dpx;height:%dpx;background:#08090B;
     font-family:"SF Pro Display","Helvetica Neue",Helvetica,Arial,sans-serif;
     -webkit-font-smoothing:antialiased}
.card{position:absolute;inset:26px;background:#0F1116;border:1px solid #242832;border-radius:8px;
      padding:56px 60px;display:flex;flex-direction:column;gap:38px}
.head{display:flex;flex-direction:column;gap:10px;flex:none}
.eyebrow{font-size:17px;letter-spacing:3.4px;text-transform:uppercase;color:#575D67;font-weight:600;
         display:flex;align-items:center;gap:14px}
.eyebrow::before{content:"";width:26px;height:3px;background:var(--acc);flex:none}
h1{font-size:52px;font-weight:800;letter-spacing:-1.4px;color:#F2F4F7;line-height:1.04}
h1.sm{font-size:44px}
.sub{font-size:24px;color:#828892;line-height:1.35}
.body{flex:1;display:flex;flex-direction:column;gap:26px;justify-content:center}
.foot{font-size:21px;color:#6B717B;flex:none;line-height:1.4}

.tiles{display:grid;gap:24px}
.tile{background:#181B22;border:1px solid #262A33;border-radius:8px;padding:34px 30px;
      display:flex;flex-direction:column;justify-content:center;gap:12px;min-height:250px;text-align:center}
.tile .n{font-size:19px;letter-spacing:2.6px;color:var(--acc);font-weight:700}
.tile .b{font-size:34px;font-weight:800;color:#F2F4F7;line-height:1.15;letter-spacing:-.5px}
.tile .s{font-size:20px;color:#828892;line-height:1.35}
.tile.acc{background:rgba(59,116,255,.13);border-color:rgba(59,116,255,.45)}
.tile.acc .b{color:#B9CCFF}
.tile.bad{background:rgba(229,72,77,.11);border-color:rgba(229,72,77,.42)}
.tile.bad .b{color:#FF9EA1}
.tile.good{background:rgba(47,178,124,.11);border-color:rgba(47,178,124,.42)}
.tile.good .b{color:#7CE0B6}

.row{background:#14161C;border:1px solid #2A2F3A;border-radius:6px;padding:26px 32px;
     display:flex;flex-direction:column;gap:7px}
.row .t{font-size:29px;font-weight:700;color:#F2F4F7;letter-spacing:-.4px}
.row .s{font-size:21px;color:#8A9099}
.row.blue{border-color:rgba(59,116,255,.5)} .row.blue .t{color:#9DB9FF}
.row.red{border-color:rgba(229,72,77,.5);background:rgba(229,72,77,.08)} .row.red .t{color:#FF9EA1}
.row.green{border-color:rgba(47,178,124,.5);background:rgba(47,178,124,.08)} .row.green .t{color:#7CE0B6}
.row.solid{background:#1C2029;border-color:#333947}
.row.punch{background:#171A21;border:0;border-left:4px solid var(--acc);border-radius:4px}
.row.punch .t{font-size:31px}
.row.fill-blue{background:#1B3A86;border-color:#1B3A86} .row.fill-blue .t,.row.fill-blue .s{color:#fff}
.row.fill-red{background:#7E2124;border-color:#7E2124} .row.fill-red .t,.row.fill-red .s{color:#fff}
.row.fill-green{background:#17553C;border-color:#17553C} .row.fill-green .t,.row.fill-green .s{color:#fff}

.path{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.path span{font-family:"SF Mono",Menlo,monospace;font-size:24px;color:#D3D8DF;background:#14161C;
           border:1px solid #2A2F3A;border-radius:5px;padding:20px 28px}
.path span.last{border-color:rgba(59,116,255,.6);color:#B9CCFF;background:rgba(59,116,255,.12)}
.path i{color:#4A515E;font-style:normal;font-size:26px}

.mono{font-family:"SF Mono",Menlo,monospace;font-size:23px;line-height:1.75;color:#C9CED6;
      background:#0A0C10;border:1px solid #262A33;border-left:4px solid var(--acc);
      border-radius:5px;padding:32px 36px;white-space:pre-wrap}

.two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.col{display:flex;flex-direction:column;gap:16px}
.col .h{font-size:19px;letter-spacing:2.6px;text-transform:uppercase;font-weight:700}
.col .h.r{color:#E5484D} .col .h.g{color:#2FB27C}
.li{display:flex;gap:14px;align-items:flex-start;font-size:22px;color:#A8AEB8;line-height:1.35}
.li b{font-size:23px;color:#D3D8DF;font-weight:600}
.mk{flex:none;font-size:22px;line-height:1.2;font-weight:700}
.mk.r{color:#E5484D} .mk.g{color:#2FB27C} .mk.b{color:#3B74FF}
.chips{display:flex;flex-wrap:wrap;gap:16px}
.chip{border:1px solid #2A2F3A;border-radius:999px;padding:16px 30px;font-size:24px;color:#C9CED6;background:#14161C}
svg{display:block}
""" % (W, H)


def esc(s):
    return html.escape(s).replace("&lt;br&gt;", "<br>").replace("\n", "<br>")


def tiles(items, cols=3, kind=""):
    cells = []
    for it in items:
        cls = "tile " + it.get("cls", kind)
        parts = []
        if it.get("n"):
            parts.append('<div class="n">%s</div>' % esc(it["n"]))
        parts.append('<div class="b">%s</div>' % esc(it["b"]))
        if it.get("s"):
            parts.append('<div class="s">%s</div>' % esc(it["s"]))
        cells.append('<div class="%s">%s</div>' % (cls.strip(), "".join(parts)))
    return '<div class="tiles" style="grid-template-columns:repeat(%d,1fr)">%s</div>' % (cols, "".join(cells))


def rows(items):
    out = []
    for it in items:
        cls = "row " + it.get("cls", "")
        s = '<div class="s">%s</div>' % esc(it["s"]) if it.get("s") else ""
        out.append('<div class="%s"><div class="t">%s</div>%s</div>' % (cls.strip(), esc(it["t"]), s))
    return "".join(out)


def path(steps):
    parts = []
    for i, s in enumerate(steps):
        parts.append('<span class="%s">%s</span>' % ("last" if i == len(steps) - 1 else "", esc(s)))
        if i < len(steps) - 1:
            parts.append("<i>&rsaquo;</i>")
    return '<div class="path">%s</div>' % "".join(parts)


def col(title, cls, items, marker):
    lis = "".join('<div class="li"><span class="mk %s">%s</span><span>%s</span></div>'
                  % (cls, marker, esc(x)) for x in items)
    return '<div class="col"><div class="h %s">%s</div>%s</div>' % (cls, esc(title), lis)


def chips(items):
    return '<div class="chips">%s</div>' % "".join('<span class="chip">%s</span>' % esc(x) for x in items)

BLUE, RED, GREEN = "#3B74FF", "#E5484D", "#2FB27C"

CHART_KNOW = """
<svg viewBox="0 0 1440 400" style="width:100%;height:100%">
  <text x="0" y="16" fill="#575D67" font-size="17" letter-spacing="2.6" font-weight="600">ТОЧНОСТЬ ОТВЕТОВ</text>
  <line x1="44" y1="44" x2="44" y2="330" stroke="#2A2F3A" stroke-width="2"/>
  <line x1="44" y1="330" x2="1420" y2="330" stroke="#2A2F3A" stroke-width="2"/>
  <text x="1420" y="368" text-anchor="end" fill="#575D67" font-size="17" letter-spacing="2.6" font-weight="600">ВРЕМЯ РАБОТЫ</text>
  <line x1="44" y1="286" x2="1400" y2="286" stroke="#E5484D" stroke-width="3" stroke-dasharray="9 8"/>
  <text x="1390" y="266" text-anchor="end" fill="#E5484D" font-size="22">Без настройки — ничего не меняется</text>
  <line x1="330" y1="60" x2="330" y2="330" stroke="#39404C" stroke-width="1.5" stroke-dasharray="5 6"/>
  <line x1="620" y1="60" x2="620" y2="330" stroke="#39404C" stroke-width="1.5" stroke-dasharray="5 6"/>
  <path d="M44 286 L330 286 L330 176 L620 176 L700 156 L850 132 L1000 110 L1180 88 L1400 68"
        stroke="#3B74FF" stroke-width="4" fill="none" stroke-linejoin="round"/>
  <circle cx="330" cy="176" r="8" fill="#3B74FF"/><circle cx="620" cy="176" r="8" fill="#3B74FF"/>
  <circle cx="1400" cy="68" r="8" fill="#3B74FF"/>
  <text x="348" y="224" fill="#9DB9FF" font-size="24" font-weight="700">Апгрейд 1</text>
  <text x="348" y="252" fill="#828892" font-size="21">Инструкция — разовый скачок</text>
  <text x="640" y="248" fill="#9DB9FF" font-size="24" font-weight="700">Апгрейд 2</text>
  <text x="640" y="276" fill="#828892" font-size="21">Память копит дальше</text>
</svg>"""

CHART_SCALE = """
<svg viewBox="0 0 1440 320" style="width:100%;height:100%">
  <defs><linearGradient id="gr" x1="0" x2="1"><stop offset="0" stop-color="#E5484D"/><stop offset="1" stop-color="#2FB27C"/></linearGradient>
  <marker id="ar" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto"><path d="M0 0 L10 5.5 L0 11 z" fill="#3B74FF"/></marker></defs>
  <rect x="40" y="176" width="1360" height="12" rx="6" fill="url(#gr)" opacity=".9"/>
  <text x="40" y="150" fill="#E5484D" font-size="27" font-weight="700">«Ты красавчик»</text>
  <text x="40" y="248" fill="#828892" font-size="21">Подтверждает любую идею</text>
  <text x="1400" y="150" text-anchor="end" fill="#2FB27C" font-size="27" font-weight="700">«Нет. Здесь ты ошибаешься»</text>
  <text x="1400" y="248" text-anchor="end" fill="#828892" font-size="21">Ищет сильнейший контраргумент</text>
  <line x1="250" y1="142" x2="250" y2="222" stroke="#E5484D" stroke-width="4"/>
  <circle cx="250" cy="182" r="15" fill="#0F1116" stroke="#E5484D" stroke-width="4"/>
  <text x="250" y="298" text-anchor="middle" fill="#FF9EA1" font-size="21">по умолчанию</text>
  <line x1="1160" y1="142" x2="1160" y2="222" stroke="#2FB27C" stroke-width="4"/>
  <circle cx="1160" cy="182" r="15" fill="#0F1116" stroke="#2FB27C" stroke-width="4"/>
  <text x="1160" y="298" text-anchor="middle" fill="#7CE0B6" font-size="21">после апгрейда 3</text>
  <path d="M284 96 L1126 96" stroke="#3B74FF" stroke-width="2.5" stroke-dasharray="8 8" marker-end="url(#ar)"/>
  <text x="705" y="76" text-anchor="middle" fill="#9DB9FF" font-size="23">правило критического мышления</text>
</svg>"""

DIAL = """
<svg viewBox="0 0 220 220" style="width:270px;height:270px;flex:none">
  <circle cx="110" cy="110" r="92" fill="none" stroke="#2A2F3A" stroke-width="4"/>
  <path d="M110 18 A92 92 0 1 1 54.6 128" fill="none" stroke="#E5484D" stroke-width="6" stroke-linecap="round"/>
  <g stroke="#39404C" stroke-width="4">
    <line x1="110" y1="24" x2="110" y2="38"/><line x1="196" y1="110" x2="182" y2="110"/>
    <line x1="110" y1="196" x2="110" y2="182"/><line x1="24" y1="110" x2="38" y2="110"/></g>
  <text x="110" y="104" text-anchor="middle" fill="#F2F4F7" font-size="58" font-weight="800"
        font-family="SF Mono,Menlo,monospace">30</text>
  <text x="110" y="140" text-anchor="middle" fill="#828892" font-size="20" letter-spacing="4">СЕК</text>
</svg>"""

ARROW_UP = """
<svg viewBox="0 0 120 150" style="width:110px;height:138px;flex:none">
  <path d="M60 4 L110 66 L82 66 L82 146 L38 146 L38 66 L10 66 Z" fill="#F2F4F7"/>
</svg>"""

CARDS = [
# ── 01 ─────────────────────────────────────────────
dict(id="c01", acc=BLUE, eyebrow="THE MHS · IT-стартап-студия · эпизод 1",
     h1="Ваш ChatGPT<br>вас не знает", sub="Три апгрейда, после которых он начинает работать на вас",
     body=tiles([
        dict(n="01", b="Контекст", s="Кто вы и чем заняты"),
        dict(n="02", b="Память", s="Что изменилось с тех пор"),
        dict(n="03", b="Критика", s="Проверка идей на прочность"),
     ], 3)),

# ── 02 ─────────────────────────────────────────────
dict(id="c02", acc=RED, eyebrow="Узнаёте?", h1="Знакомо?", sub="Как выглядит ChatGPT без настройки",
     body=tiles([
        dict(b="Ответы,<br>которые подошли бы<br>кому угодно"),
        dict(b="Каждый чат<br>начинается<br>с нуля"),
        dict(b="Соглашается<br>со всем,<br>что вы скажете", cls="acc"),
     ], 3),
     foot="Каждый раз одна и та же история. Дело не в модели — дело в контексте."),

# ── 03 ─────────────────────────────────────────────
dict(id="c03", acc=RED, eyebrow="Демонстрация · два окна", h1="Один вопрос.<br>Два разных ответа.",
     body='<div class="mono" style="--acc:%s">«Стоит ли мне запускать новый проект — ИИ, который делает прогнозы на ставки?»</div>' % RED
          + '<div class="two">'
          + rows([dict(t="«Отличный продукт. Вот как его правильно запускать.»", s="Окно 1 · знает о вас ничего", cls="red")])
          + rows([dict(t="«Нет. Этот проект не ведёт тебя к основной цели.»", s="Окно 2 · знает цели и проекты", cls="green")])
          + "</div>",
     foot="Правильно и абсолютно бесполезно — против ответа, который меняет решение."),

# ── 04 ─────────────────────────────────────────────
dict(id="c04", acc=BLUE, eyebrow="Карта эпизода", h1="Три апгрейда",
     body=tiles([
        dict(n="01", b="Контекст", s="Один раз объясняем, кто вы и какие ответы вам нужны"),
        dict(n="02", b="Память", s="Всё новое переезжает в следующие разговоры"),
        dict(n="03", b="Критика", s="Модель перестаёт поддакивать"),
     ], 3) + rows([dict(t="Порядок важен", s="Третий апгрейд без первых двух почти не работает.", cls="punch")])),

# ── 05 ─────────────────────────────────────────────
dict(id="c05", acc=BLUE, eyebrow="Апгрейд 01 · Контекст", h1="Информация о вас",
     sub="Представьте, что вы наняли невероятно умного ассистента",
     body='<div style="display:flex;gap:44px;align-items:center">' + ARROW_UP
          + '<div class="col" style="flex:1;gap:16px">'
          + rows([dict(t="Он быстро пишет и доступен круглосуточно", s="Анализирует любые объёмы информации.", cls="blue"),
                  dict(t="Но вы ничего ему о себе не рассказали", s="Кто вы · чем заняты · уровень · цели · что раздражает."),
                  dict(t="Усреднённые ответы", s="для усреднённого человека.", cls="fill-red")])
          + "</div></div>"),

# ── 06 ─────────────────────────────────────────────
dict(id="c06", acc=BLUE, eyebrow="Апгрейд 01 · где включается", h1="Пользовательские<br>инструкции", sub="Путь по меню",
     body=path(["Настройки", "Персонализация", "Пользовательские инструкции"])
          + rows([dict(t="Здесь задаётся постоянная информация о вас", s="Её ChatGPT учитывает во всех разговорах.", cls="punch")]),
     foot="Проблема: большинство людей не понимает, что сюда писать."),

# ── 07 ─────────────────────────────────────────────
dict(id="c07", acc=BLUE, eyebrow="Апгрейд 01 · инструмент", h1="Промпт-интервьюер",
     sub="Вставляете его в ChatGPT — он сам вас опрашивает",
     body=tiles([
        dict(b="Чем вы<br>занимаетесь"), dict(b="Какие задачи<br>решаете"),
        dict(b="Какой уровень<br>знаний"), dict(b="Какие<br>цели"),
        dict(b="В каком формате<br>отвечать"), dict(b="Насколько<br>подробно"),
        dict(b="Нужно ли<br>с вами спорить"), dict(b="Основные<br>проекты"),
     ], 4)
     + rows([dict(t="На основе ответов собирает готовую инструкцию", s="Промпт бесплатно в Telegram-канале THE MHS.", cls="fill-blue")])),

# ── 08 ─────────────────────────────────────────────
dict(id="c08", acc=GREEN, eyebrow="Апгрейд 01 · результат", h1="Что меняется в ответах",
     sub="Пример: человек занимается маркетингом",
     body='<div class="two">'
          + rows([dict(t="«Расскажи, что такое воронка продаж»", s="БЫЛО · объясняет с азов", cls="red")])
          + rows([dict(t="«Передо мной маркетолог — сразу к архитектуре, экономике и практике»", s="СТАЛО · пропускает базу", cls="green")])
          + "</div>"
          + rows([dict(t="Мы не сделали модель умнее", s="Мы дали ей правильный контекст.", cls="fill-green")])),

# ── 09 ─────────────────────────────────────────────
dict(id="c09", acc=BLUE, eyebrow="Апгрейд 02 · Память", h1="Инструкция — это сегодня.<br>А что с завтра?",
     body='<div class="two">'
          + rows([dict(t="«Я больше не хочу работать с этим сегментом клиентов»", s="Через неделю")])
          + rows([dict(t="«Мы изменили позиционирование продукта»", s="Через месяц")])
          + "</div>"
          + path(["Настройки", "Персонализация", "Память"]),
     foot="Галочка должна быть включена. Рядом — сохранённые воспоминания и история чатов."),

# ── 10 ─────────────────────────────────────────────
dict(id="c10", acc=BLUE, eyebrow="Апгрейд 02 · в чём разница", h1="Бриф и накопленный опыт",
     body='<div class="two">'
          + rows([dict(t="Пользовательская инструкция", s="Бриф, который вы выдали сотруднику в первый день.", cls="blue")])
          + rows([dict(t="Память", s="Контекст, который накопился, пока вы работали вместе.", cls="blue")])
          + "</div>"
          + '<div style="height:340px">%s</div>' % CHART_KNOW),

# ── 11 ─────────────────────────────────────────────
dict(id="c11", acc=BLUE, eyebrow="Апгрейд 02 · регламент", h1="Памятью нужно управлять",
     body='<div class="mono" style="--acc:%s;font-size:30px">Что ты помнишь обо мне?</div>' % BLUE
          + tiles([
              dict(n="ШАГ 1", b="Спросить", s="Сверить его представление о вас с реальностью"),
              dict(n="ШАГ 2", b="Почистить", s="Устаревшее удалить, неточное исправить"),
              dict(n="ШАГ 3", b="Повторять", s="Часть информации со временем протухает"),
          ], 3),
     foot="Вы постепенно строите вокруг ChatGPT точный контекст своей жизни и работы."),

# ── 12 ─────────────────────────────────────────────
dict(id="c12", acc=RED, eyebrow="Самая опасная часть видео", h1="Он убедительнее<br>подтверждает вашу ошибку",
     body='<div class="two">'
          + rows([dict(t="«Мне кажется, это гениальная идея»", s="→ пять причин, почему она интересная", cls="red")])
          + rows([dict(t="«Мне кажется, идея ужасная»", s="→ пять причин, почему она ужасная", cls="red")])
          + "</div>"
          + rows([dict(t="У модели нет своей позиции", s="Она достраивает наиболее подходящий ответ в контексте вашего разговора.", cls="fill-red")]),
     foot="Проблема настолько реальная, что разработчики моделей отдельно работают над её уменьшением."),

# ── 13 ─────────────────────────────────────────────
dict(id="c13", acc=BLUE, eyebrow="Апгрейд 03 · Критическое мышление", h1="Правило, которое я добавляю<br>в инструкции", h1sm=True,
     body='<div class="mono" style="--acc:%s">Не соглашайся со мной автоматически.\nЕсли мои предположения слабые, противоречат фактам\nили строятся на ошибочной логике — прямо скажи об этом.\n\nОтделяй факты от предположений.\nИщи сильнейший контраргумент моей позиции.\nЕсли информации не хватает — скажи, чего именно.\n\nТвоя задача не подтвердить моё мнение,\nа помочь мне прийти к наиболее точному выводу.</div>' % BLUE),

# ── 14 ─────────────────────────────────────────────
dict(id="c14", acc=GREEN, eyebrow="Апгрейд 03 · что меняется", h1="Разница на экране",
     body='<div class="two">'
          + rows([dict(t="Сразу начинает строить план", s="Обычный режим", cls="red")])
          + rows([dict(t="«Стоп. Эта идея противоречит твоим целям»", s="Наш режим", cls="green")])
          + "</div>"
          + '<div style="height:270px">%s</div>' % CHART_SCALE),

# ── 15 ─────────────────────────────────────────────
dict(id="c15", acc=BLUE, eyebrow="Апгрейд 03 · усиление", h1="Адвокат дьявола",
     sub="Мне не нужен тот, кто круглосуточно говорит «ты красавчик»",
     body='<div class="two">'
          + rows([dict(t="Скилл", s="Готовый набор инструкций: роль, правила, последовательность действий, формат ответа.", cls="blue")])
          + rows([dict(t="Адвокат дьявола", s="Режим, где специально ищешь слабые места и проверяешь, выдерживает ли вывод критику.", cls="blue")])
          + "</div>"
          + rows([dict(t="Нужен человек по ту сторону стола", s="Который иногда говорит: «Нет. Здесь ты ошибаешься».", cls="fill-blue")]),
     foot="Цель — не спор ради спора, а меньше ошибок и самообмана."),

# ── 16 ─────────────────────────────────────────────
dict(id="c16", acc=RED, eyebrow="Держать в голове постоянно", h1="Модель врёт.<br>Правило тридцати секунд",
     body='<div style="display:flex;align-items:center;gap:48px">' + DIAL
          + '<div class="col" style="flex:1;gap:22px">'
          + '<div class="s" style="font-size:26px;color:#A8AEB8;line-height:1.4">Всё, что можно проверить за тридцать секунд, надо проверять за тридцать секунд.</div>'
          + chips(["цифры", "даты", "фамилии", "номера законов", "названия книг"])
          + '</div></div>',
     foot="Именно на этом модели спотыкаются чаще всего — и внизу страницы об этом честно предупреждают."),

# ── 17 ─────────────────────────────────────────────
dict(id="c17", acc=GREEN, eyebrow="Итог первой ступени", h1="Было / Стало",
     body='<div class="two">'
          + '<div class="row red" style="gap:18px">'
          + col("В начале видео", "r", ["Не знает, кто вы", "Забывает всё между чатами",
                                        "Соглашается с любой идеей", "Выдаёт непроверенные факты"], "✕")
          + "</div>"
          + '<div class="row green" style="gap:18px">'
          + col("Сейчас", "g", ["Знает постоянный контекст о вас", "Использует прошлые разговоры",
                                "Не обязан соглашаться", "Атакует ваши гипотезы", "Проверяет факты"], "✓")
          + "</div></div>",
     foot="И это только фундамент."),

# ── 18 ─────────────────────────────────────────────
dict(id="c18", acc=GREEN, eyebrow="Эпизод 2", h1="Дальше — промпты",
     sub="Почему большинство до сих пор пишет их неправильно",
     body=tiles([
        dict(b="Структура<br>промпта", s="Которой пользуюсь сам"),
        dict(b="50 лучших<br>скиллов", s="Готовая подборка"),
        dict(b="Свои<br>скиллы", s="Где искать и как писать"),
     ], 3)
     + rows([dict(t="Промпт-интервьюер · инструкция критики · адвокат дьявола",
                  s="Бесплатно по ссылке в описании. Бизнесу — контакты под видео.", cls="fill-green")])),
]


def render(c):
    parts = ['<style>%s</style>' % CSS, '<div class="card" style="--acc:%s">' % c["acc"]]
    parts.append('<div class="head">')
    if c.get("eyebrow"):
        parts.append('<div class="eyebrow">%s</div>' % esc(c["eyebrow"]))
    parts.append('<h1%s>%s</h1>' % (' class="sm"' if c.get("h1sm") else "", c["h1"]))
    if c.get("sub"):
        parts.append('<div class="sub">%s</div>' % esc(c["sub"]))
    parts.append("</div>")
    parts.append('<div class="body">%s</div>' % c["body"])
    if c.get("foot"):
        parts.append('<div class="foot">%s</div>' % esc(c["foot"]))
    parts.append("</div>")
    return "".join(parts)


for c in CARDS:
    p = os.path.join(OUT, c["id"] + ".html")
    open(p, "w", encoding="utf-8").write(render(c))
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=2", "--screenshot=" + os.path.join(OUT, c["id"] + ".png"),
                    "--window-size=%d,%d" % (W, H), "--default-background-color=08090B",
                    "file://" + p], capture_output=True)

print("карточек отрисовано:", len(CARDS))
for c in CARDS:
    f = os.path.join(OUT, c["id"] + ".png")
    print(" ", c["id"], os.path.getsize(f) // 1024, "КБ" if os.path.exists(f) else "НЕТ")
