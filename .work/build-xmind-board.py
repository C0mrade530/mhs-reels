# -*- coding: utf-8 -*-
import json, zipfile, os, hashlib

OUT_DIR = "/Users/mak/THE MHS content/xmind"
NAME    = "THE MHS — Эпизод 1 — Настройка ChatGPT"

BLUE, RED, GREEN, GREY = "#3B74FF", "#E5484D", "#2FB27C", "#8A9099"
INK, DIM, PANEL = "#FFFFFF", "#C9CED6", "#14161C"

_n = [0]
def uid(seed):
    _n[0] += 1
    return hashlib.md5((seed + str(_n[0])).encode()).hexdigest()[:26]

def style(props):
    return {"id": uid("st"), "properties": props}

def topic(title, children=None, notes=None, level=2, accent=BLUE, marker=None, label=None):
    t = {"id": uid(title), "class": "topic", "title": title}
    if level == 0:
        t["style"] = style({
            "svg:fill": BLUE, "fo:color": "#FFFFFF", "fo:font-size": "30pt",
            "fo:font-weight": "bold", "fo:font-family": "PingFang SC",
            "shape-class": "org.xmind.topicShape.roundedRect",
            "border-line-width": "0pt", "line-color": accent, "line-width": "3pt",
        })
    elif level == 1:
        t["style"] = style({
            "svg:fill": PANEL, "fo:color": INK, "fo:font-size": "17pt", "fo:font-weight": "bold",
            "shape-class": "org.xmind.topicShape.roundedRect",
            "border-line-color": accent, "border-line-width": "2pt",
            "line-color": accent, "line-width": "2pt",
        })
    elif level == 2:
        t["style"] = style({
            "svg:fill": "#0F1116", "fo:color": INK, "fo:font-size": "13pt",
            "shape-class": "org.xmind.topicShape.roundedRect",
            "border-line-color": "#2A2F3A", "border-line-width": "1pt",
            "line-color": accent, "line-width": "1.5pt",
        })
    else:
        t["style"] = style({
            "svg:fill": "none", "fo:color": DIM, "fo:font-size": "12pt",
            "shape-class": "org.xmind.topicShape.underline",
            "border-line-width": "0pt", "line-color": "#39404C", "line-width": "1pt",
        })
    if notes:
        t["notes"] = {"plain": {"content": notes}}
    if marker:
        t["markers"] = [{"markerId": marker}]
    if label:
        t["labels"] = [label]
    if children:
        t["structureClass"] = "org.xmind.ui.logic.right"
        t["children"] = {"attached": children}
    return t

def branch(title, kids, accent=BLUE, notes=None, marker=None, label=None):
    return topic(title, kids, notes=notes, level=1, accent=accent, marker=marker, label=label)

def leaf(title, kids=None, accent=BLUE, notes=None, lvl=2):
    return topic(title, kids, notes=notes, level=lvl, accent=accent)

# ─────────────────────────────────────────────────────────────
B = []

B.append(branch("00 · Открытие", [
    leaf("Кому это видео", [
        leaf("«Устраивает до конца карьеры делать одну и ту же монотонную работу — закрывайте», accent=RED".replace(', accent=RED',''), accent=RED, lvl=3),
        leaf("Эта серия — для тех, кто хочет вырваться", accent=RED, lvl=3),
    ], accent=RED,
    notes="Если вас устраивает до конца своей карьеры выполнять одну и ту же скучную, монотонную работу — можете закрывать это видео.\nПотому что эта серия видео для тех, кто хочет из этого вырваться."),
    leaf("Что вы получите", [
        leaf("Работать быстрее", accent=RED, lvl=3),
        leaf("Учиться быстрее", accent=RED, lvl=3),
        leaf("Освободить своё время", accent=RED, lvl=3),
    ], accent=RED),
    leaf("Цель серии — собственный Джарвис", accent=RED,
         notes="И постепенно прийти к тому, что когда-то казалось фантастикой: создать собственного Джарвиса. Прямо как в фильмах про Железного человека."),
    leaf("Канал THE MHS · IT-стартап-студия", accent=RED),
], accent=RED, marker="flag-red"))

B.append(branch("01 · Демонстрация: два ChatGPT", [
    leaf("ЭКРАН: два окна ChatGPT, один вопрос", accent=RED,
         notes="«Стоит ли мне сейчас запускать новый проект по созданию искусственного интеллекта, который будет делать прогнозы на ставки?»"),
    leaf("Окно 1 — знает о вас почти ничего", [
        leaf("«Да, это отличный продукт, и вот как его правильно запускать»", accent=RED, lvl=3),
        leaf("Всё правильно. И абсолютно бесполезно.", accent=RED, lvl=3),
    ], accent=RED),
    leaf("Окно 2 — знает цели, проекты, приоритеты", [
        leaf("«Нет. Этот проект не ведёт тебя к твоей основной цели»", accent=GREEN, lvl=3),
        leaf("«Это не лучшее вложение твоего времени»", accent=GREEN, lvl=3),
    ], accent=GREEN),
    leaf("Вывод: разница не в модели, а в контексте", accent=GREEN),
], accent=RED))

B.append(branch("02 · Три апгрейда за это видео", [
    leaf("01 — ChatGPT понимает, кто вы и чем занимаетесь", accent=BLUE),
    leaf("02 — использует накопленный контекст в следующих разговорах", accent=BLUE),
    leaf("03 — перестаёт бездумно соглашаться и проверяет идеи на прочность", accent=BLUE),
    leaf("Порядок важен: третий без первых двух почти не работает", accent=GREY, lvl=3),
], accent=BLUE, marker="priority-1"))

B.append(branch("03 · АПГРЕЙД 1 · Контекст", [
    leaf("Аналогия: гениальный ассистент, которому вы ничего не рассказали", [
        leaf("Не знает, кто вы", accent=RED, lvl=3),
        leaf("Не знает, чем занимаетесь", accent=RED, lvl=3),
        leaf("Не знает ваш уровень знаний", accent=RED, lvl=3),
        leaf("Не знает ваши цели", accent=RED, lvl=3),
        leaf("Не знает, какие ответы вы любите и что раздражает", accent=RED, lvl=3),
        leaf("→ усреднённые ответы для усреднённого человека", accent=RED, lvl=3),
    ], accent=BLUE,
    notes="Он быстро пишет. Умеет анализировать огромные объёмы информации. Доступен 24 часа в сутки. Но вы ничего ему о себе не рассказали."),
    leaf("ПУТЬ: Настройки → Персонализация → Пользовательские инструкции", accent=BLUE,
         notes="Показать на экране весь путь по меню целиком."),
    leaf("Проблема: большинство не понимает, что туда писать", accent=RED),
], accent=BLUE, marker="priority-1", label="Апгрейд 1"))

B.append(branch("04 · Промпт-интервьюер", [
    leaf("Вставляете промпт — он сам вас опрашивает", [
        leaf("Чем вы занимаетесь", lvl=3),
        leaf("Какие задачи решаете", lvl=3),
        leaf("Какой у вас уровень знаний", lvl=3),
        leaf("Какие у вас цели", lvl=3),
        leaf("В каком формате удобно получать информацию", lvl=3),
        leaf("Насколько подробно объяснять", lvl=3),
        leaf("Нужно ли с вами спорить", lvl=3),
        leaf("Какие ваши основные проекты", lvl=3),
    ], accent=BLUE),
    leaf("На основе ответов собирает готовую инструкцию", accent=BLUE),
    leaf("Пример: маркетолог", [
        leaf("БЫЛО: «Расскажи, что такое воронка продаж»", accent=RED, lvl=3),
        leaf("СТАЛО: «Передо мной маркетолог — сразу к архитектуре, экономике, практике»", accent=GREEN, lvl=3),
    ], accent=BLUE),
    leaf("Мы не сделали модель умнее — мы дали ей контекст", accent=GREEN),
    leaf("Промпт бесплатно в Telegram THE MHS, ссылка под видео", accent=GREY, lvl=3,
         notes="Но не уходите туда прямо сейчас — сначала досмотрите настройку целиком, потому что одной пользовательской инструкции недостаточно."),
], accent=BLUE))

B.append(branch("05 · АПГРЕЙД 2 · Память", [
    leaf("Инструкция — это то, что вы сказали сегодня", accent=BLUE),
    leaf("А что с завтрашней информацией?", [
        leaf("«Я больше не хочу работать с этим сегментом клиентов»", lvl=3),
        leaf("«Мы изменили позиционирование продукта»", lvl=3),
    ], accent=BLUE),
    leaf("ПУТЬ: Настройки → Персонализация → Память", accent=BLUE,
         notes="Очень важно, чтобы галочка была включена. В зависимости от аккаунта рядом будут сохранённые воспоминания и использование истории чатов."),
    leaf("Метафора", [
        leaf("Инструкция = бриф сотруднику в первый день", lvl=3),
        leaf("Память = контекст, накопленный в совместной работе", lvl=3),
    ], accent=BLUE),
], accent=BLUE, marker="priority-2", label="Апгрейд 2"))

B.append(branch("06 · Ревизия памяти", [
    leaf("Спросить: «Что ты помнишь обо мне?»", accent=BLUE),
    leaf("Сверить с реальностью", accent=BLUE),
    leaf("Устаревшее — удалять, неточное — исправлять", accent=BLUE),
    leaf("Повторять периодически", accent=BLUE),
    leaf("Вы строите вокруг ChatGPT точный контекст своей жизни и работы", accent=GREEN),
], accent=BLUE))

B.append(branch("07 · ОПАСНОСТЬ · Соглашательство", [
    leaf("Персональный ChatGPT убедительнее подтверждает вашу ошибку", accent=RED),
    leaf("Один и тот же вопрос — два разных чата", [
        leaf("«Мне кажется, это гениальная идея» → 5 причин, почему да", accent=RED, lvl=3),
        leaf("«Мне кажется, идея ужасная» → 5 причин, почему нет", accent=RED, lvl=3),
    ], accent=RED),
    leaf("Почему: у модели нет своей позиции", accent=RED,
         notes="Она генерирует наиболее подходящий ответ в контексте вашего разговора. Модели действительно могут проявлять склонность чрезмерно соглашаться с пользователем."),
    leaf("Разработчики моделей отдельно работают над уменьшением этого", accent=GREY, lvl=3),
], accent=RED, marker="symbol-exclam"))

B.append(branch("08 · АПГРЕЙД 3 · Критическое мышление", [
    leaf("Правило в пользовательские инструкции", [
        leaf("Не соглашайся со мной автоматически", lvl=3),
        leaf("Слабые предположения и ошибочная логика — скажи прямо", lvl=3),
        leaf("Отделяй факты от предположений", lvl=3),
        leaf("Ищи сильнейший контраргумент моей позиции", lvl=3),
        leaf("Не хватает информации — скажи, чего именно", lvl=3),
        leaf("Задача — не подтвердить мнение, а прийти к точному выводу", lvl=3),
    ], accent=BLUE,
    notes="«Не соглашайся со мной автоматически.\nЕсли мои предположения слабые, противоречат фактам или строятся на ошибочной логике — прямо скажи об этом.\nОтделяй факты от предположений.\nИщи сильнейший контраргумент моей позиции.\nЕсли для уверенного вывода недостаточно информации — скажи, чего именно не хватает.\nТвоя задача не подтвердить моё мнение, а помочь мне прийти к наиболее точному выводу.»"),
    leaf("Разница на экране", [
        leaf("Обычный режим — сразу строит план", accent=RED, lvl=3),
        leaf("Наш режим — «Стоп. Эта идея противоречит твоим целям»", accent=GREEN, lvl=3),
    ], accent=BLUE),
    leaf("Полная версия инструкции — под видео", accent=GREY, lvl=3),
], accent=BLUE, marker="priority-3", label="Апгрейд 3"))

B.append(branch("09 · Адвокат дьявола", [
    leaf("Мне не нужен тот, кто круглосуточно говорит «ты красавчик»", accent=BLUE),
    leaf("Нужен человек, который иногда говорит «Нет, здесь ты ошибаешься»", accent=GREEN),
    leaf("Скиллы для ChatGPT — что это", accent=BLUE,
         notes="Готовые наборы инструкций, которые задают модели конкретный способ работы: роль, правила, последовательность действий, формат ответа и использование инструментов."),
    leaf("Адвокат дьявола — что это", accent=BLUE,
         notes="Режим критического мышления: специально ищешь слабые места в утверждении, выдвигаешь сильные контраргументы и проверяешь, выдерживает ли вывод критику. Цель — не спор ради спора, а уменьшение ошибок и самообмана."),
], accent=BLUE))

B.append(branch("10 · Проверка фактов", [
    leaf("Модель врёт — и внизу страницы об этом честно предупреждают", accent=RED),
    leaf("ПРАВИЛО 30 СЕКУНД", accent=RED,
         notes="Всё, что можно проверить за тридцать секунд, надо проверять за тридцать секунд."),
    leaf("Что проверять всегда", [
        leaf("Цифры", lvl=3), leaf("Даты", lvl=3), leaf("Фамилии", lvl=3),
        leaf("Номера законов", lvl=3), leaf("Названия книг", lvl=3),
    ], accent=RED),
], accent=RED, marker="symbol-exclam"))

B.append(branch("11 · Итог: было / стало", [
    leaf("БЫЛО", [
        leaf("Не знает, кто вы", accent=RED, lvl=3),
        leaf("Забывает всё между чатами", accent=RED, lvl=3),
        leaf("Соглашается с любой идеей", accent=RED, lvl=3),
        leaf("Уверенно выдаёт непроверенные факты", accent=RED, lvl=3),
    ], accent=RED),
    leaf("СТАЛО", [
        leaf("Знает постоянный контекст о вас", accent=GREEN, lvl=3),
        leaf("Использует полезное из прошлых разговоров", accent=GREEN, lvl=3),
        leaf("Не обязан автоматически соглашаться", accent=GREEN, lvl=3),
        leaf("Умеет атаковать ваши гипотезы", accent=GREEN, lvl=3),
        leaf("Получил протокол проверки фактов", accent=GREEN, lvl=3),
    ], accent=GREEN),
    leaf("Но это только фундамент", accent=GREEN),
], accent=GREEN, marker="task-done"))

B.append(branch("12 · Финал и CTA", [
    leaf("Следующий эпизод", [
        leaf("Почему большинство неправильно пишет промпты", lvl=3),
        leaf("Структура, которой пользуюсь сам", lvl=3),
        leaf("Сложные задачи по алгоритму", lvl=3),
        leaf("Подборка 50 лучших скиллов", lvl=3),
        leaf("Где искать скиллы и как писать свои", lvl=3),
    ], accent=GREEN),
    leaf("Подписывайтесь на канал THE MHS", accent=GREEN),
    leaf("Материалы бесплатно по ссылке в описании", [
        leaf("Промпт-интервьюер", lvl=3),
        leaf("Инструкция критического мышления", lvl=3),
        leaf("Адвокат дьявола", lvl=3),
    ], accent=GREEN),
    leaf("Владельцам бизнеса — контакты под видео", accent=GREEN),
    leaf("«Это была первая ступень. Увидимся в следующей»", accent=GREEN),
], accent=GREEN))


# ══════════════════ ЛИСТ 1 · КАРТА ══════════════════
root = topic("ЭПИЗОД 1\nВаш ChatGPT вас не знает", B, level=0, accent=BLUE)
root["structureClass"] = "org.xmind.ui.map.unbalanced"

def make_theme():
    return {
        "id": uid("theme"), "title": "THE MHS Dark",
        "map": {"id": uid("m"), "type": "map", "properties": {
            "svg:fill": "#08090B", "multi-line-colors": "none", "line-tapered": "none"}},
        "centralTopic": {"id": uid("c"), "type": "topic", "properties": {
            "svg:fill": BLUE, "fo:color": "#FFFFFF", "fo:font-size": "30pt", "fo:font-weight": "bold",
            "shape-class": "org.xmind.topicShape.roundedRect", "border-line-width": "0pt"}},
        "mainTopic": {"id": uid("mt"), "type": "topic", "properties": {
            "svg:fill": PANEL, "fo:color": INK, "fo:font-size": "17pt", "fo:font-weight": "bold",
            "shape-class": "org.xmind.topicShape.roundedRect", "border-line-width": "2pt"}},
        "subTopic": {"id": uid("sub"), "type": "topic", "properties": {
            "svg:fill": "#0F1116", "fo:color": INK, "fo:font-size": "13pt",
            "shape-class": "org.xmind.topicShape.roundedRect",
            "border-line-color": "#2A2F3A", "border-line-width": "1pt"}},
        "floatingTopic": {"id": uid("ft"), "type": "topic", "properties": {
            "svg:fill": PANEL, "fo:color": INK, "shape-class": "org.xmind.topicShape.roundedRect"}},
        "summaryTopic": {"id": uid("sm"), "type": "topic", "properties": {"svg:fill": PANEL, "fo:color": INK}},
        "calloutTopic": {"id": uid("ct"), "type": "topic", "properties": {"svg:fill": BLUE, "fo:color": "#FFFFFF"}},
        "boundary": {"id": uid("b"), "type": "boundary", "properties": {
            "svg:fill": "#12151B", "svg:stroke": BLUE, "fo:color": DIM}},
        "summary": {"id": uid("s"), "type": "summary", "properties": {"svg:stroke": BLUE}},
        "relationship": {"id": uid("r"), "type": "relationship", "properties": {"svg:stroke": GREY, "fo:color": DIM}},
        "importantTopic": {"id": uid("it"), "type": "topic", "properties": {"svg:fill": RED, "fo:color": "#FFFFFF"}},
        "minorTopic": {"id": uid("nt"), "type": "topic", "properties": {"svg:fill": PANEL, "fo:color": DIM}},
    }

sheet1 = {
    "id": uid("sheet1"), "class": "sheet", "title": "1 · Карта сценария",
    "rootTopic": root,
    "style": {"id": uid("ss"), "properties": {"svg:fill": "#08090B"}},
    "theme": make_theme(), "topicPositioning": "fixed", "topicOverlapping": "overlap",
}

# ══════════════════ ЛИСТ 2 · ДОСКА ══════════════════
IMAGES = {"g1": (760, 337), "g2": (760, 337), "g3": (760, 282), "g4": (760, 282)}

def card(title, lines=None, image=None, accent=BLUE, big=False, notes=None):
    """Блок доски: заголовок, при желании картинка, снизу — тезисы списком."""
    kids = []
    for ln in (lines or []):
        if isinstance(ln, tuple):
            kids.append(topic(ln[0], None, notes=(ln[1] if len(ln) > 1 else None),
                              level=2, accent=accent))
        else:
            kids.append(topic(ln, None, level=2, accent=accent))
    t = topic(title, kids or None, notes=notes, level=1, accent=accent)
    t["style"] = style({
        "svg:fill": PANEL, "fo:color": INK,
        "fo:font-size": ("26pt" if big else "19pt"), "fo:font-weight": "bold",
        "fo:text-align": "left",
        "shape-class": "org.xmind.topicShape.roundedRect",
        "border-line-color": accent, "border-line-width": ("3pt" if big else "2pt"),
        "line-color": accent, "line-width": "1.5pt",
    })
    if image:
        w, h = IMAGES[image]
        t["image"] = {"src": "xap:resources/%s.png" % image, "width": w, "height": h, "align": "bottom"}
    if kids:
        t["structureClass"] = "org.xmind.ui.logic.right"
    return t

CARDS = [
    (1, card("01 · Демонстрация", image="g1", lines=[
        "Показать оба окна на экране целиком",
        "Вывод: разница не в модели, а в контексте",
    ], accent=RED)),

    (2, card("02 · Три апгрейда", [
        "01 · КОНТЕКСТ — понимает, кто вы и чем занимаетесь",
        "02 · ПАМЯТЬ — переносит накопленное в новые чаты",
        "03 · КРИТИКА — перестаёт бездумно соглашаться",
        "Порядок важен: третий без первых двух не работает",
    ], accent=BLUE)),

    (3, card("Что меняется во времени", image="g2", lines=[
        "Инструкция — разовый скачок",
        "Память — накопление",
    ], accent=BLUE)),

    (4, card("03 · АПГРЕЙД 1 · Контекст", [
        "ПУТЬ: Настройки → Персонализация → Пользовательские инструкции",
        "Аналогия: гениальный ассистент, которому вы ничего не рассказали",
        "Не знает: кто вы · чем заняты · уровень · цели · что раздражает",
        "Итог без настройки: усреднённые ответы для усреднённого человека",
    ], accent=BLUE)),

    (5, card("04 · Промпт-интервьюер", [
        "Вставляете промпт — он сам вас опрашивает",
        "8 вопросов: занятие, задачи, уровень, цели, формат, глубина, спорить ли, проекты",
        "БЫЛО: «Расскажи, что такое воронка продаж»",
        "СТАЛО: «Передо мной маркетолог — сразу к архитектуре и экономике»",
        "Промпт бесплатно в Telegram THE MHS",
    ], accent=BLUE)),

    (6, card("05 · АПГРЕЙД 2 · Память", [
        "ПУТЬ: Настройки → Персонализация → Память · галочка включена",
        "Инструкция = бриф в первый день",
        "Память = контекст, накопленный в работе",
        "Пример: «Мы изменили позиционирование продукта»",
    ], accent=BLUE)),

    (7, card("06 · Ревизия памяти", [
        "Спросить: «Что ты помнишь обо мне?»",
        "Сверить с реальностью",
        "Устаревшее удалять, неточное исправлять",
        "Повторять периодически",
    ], accent=BLUE)),

    (8, card("07 · Опасность: соглашательство", image="g3", lines=[
        "Одна идея, два чата — противоположные ответы",
        "У модели нет позиции: она достраивает ваш контекст",
    ], accent=RED)),

    (9, card("08 · АПГРЕЙД 3 · Критическое мышление", [
        "Не соглашайся со мной автоматически",
        "Отделяй факты от предположений",
        "Ищи сильнейший контраргумент моей позиции",
        "Не хватает информации — скажи, чего именно",
        "Задача — точный вывод, а не подтверждение мнения",
        "Обычный режим строит план · наш говорит «Стоп»",
    ], accent=BLUE,
    notes="Полный текст правила — на листе «Карта сценария», ветка 08.")),

    (10, card("09 · Адвокат дьявола", [
        "Скилл — готовый набор инструкций: роль, правила, порядок, формат",
        "Адвокат дьявола — режим поиска слабых мест в утверждении",
        "Цель — меньше ошибок и самообмана",
    ], accent=BLUE)),

    (11, card("10 · Проверка фактов", image="g4", lines=[
        "Модель врёт уверенно — внизу страницы предупреждают",
    ], accent=RED)),

    (12, card("11 · Было / Стало", [
        "БЫЛО: не знает вас · забывает · соглашается · выдаёт непроверенное",
        "СТАЛО: знает контекст · помнит · спорит · атакует гипотезы · проверяет факты",
        "И это только фундамент",
    ], accent=GREEN)),

    (13, card("12 · Финал и CTA", [
        "Эпизод 2: структура промптов, алгоритмы, 50 скиллов",
        "Подписка на канал THE MHS",
        "Материалы бесплатно по ссылке в описании",
        "Владельцам бизнеса — контакты под видео",
    ], accent=GREEN)),
]

# вертикальная раскладка сверху вниз
Y = 340
detached = []
for idx, c in CARDS:
    c["position"] = {"x": 0, "y": Y}
    detached.append(c)
    n_kids = len(c.get("children", {}).get("attached", []))
    height = (290 if "image" in c else 0) + 40 + n_kids * 38
    Y += height + 165

board_root = topic("ВАШ CHATGPT ВАС НЕ ЗНАЕТ", None, level=0, accent=BLUE)
board_root["title"] = "ВАШ CHATGPT\nВАС НЕ ЗНАЕТ"
board_root["labels"] = ["THE MHS · эпизод 1 · три апгрейда"]
board_root["structureClass"] = "org.xmind.ui.map.unbalanced"
board_root["children"] = {"detached": detached}

sheet2 = {
    "id": uid("sheet2"), "class": "sheet", "title": "2 · Доска",
    "rootTopic": board_root,
    "style": {"id": uid("ss2"), "properties": {"svg:fill": "#08090B"}},
    "theme": make_theme(), "topicPositioning": "free", "topicOverlapping": "overlap",
}

# ══════════════════ СБОРКА ══════════════════
content = [sheet1, sheet2]
metadata = {"creator": {"name": "Xmind", "version": "26.04.01327"}, "activeSheetId": sheet2["id"]}
entries = {"content.json": {}, "metadata.json": {}}
GFX = "/private/tmp/claude-501/-Users-mak-THE-MHS-content/ccc11010-866c-45b3-a694-0ccefa9bb78a/scratchpad/gfx"
for k in IMAGES:
    entries["resources/%s.png" % k] = {}
manifest = {"file-entries": entries}

os.makedirs(OUT_DIR, exist_ok=True)
path = os.path.join(OUT_DIR, NAME + ".xmind")
with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("content.json", json.dumps(content, ensure_ascii=False))
    z.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False))
    z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
    for k in IMAGES:
        z.write(os.path.join(GFX, k + ".png"), "resources/%s.png" % k)

def count(t):
    n = 1
    for c in t.get("children", {}).get("attached", []) + t.get("children", {}).get("detached", []):
        n += count(c)
    return n

print("файл:", path)
print("лист 1 — тем:", count(root))
print("лист 2 — блоков:", len(CARDS), "· высота доски:", Y)
