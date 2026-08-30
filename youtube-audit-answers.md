# Заявка на аудит YouTube API

Форма: https://support.google.com/youtube/contact/yt_api_form

Ниже — заготовки ответов под наш случай. Проверьте цифры проекта перед
отправкой: номер и название берутся из Google Cloud Console → Overview.

---

## Что спрашивают и что отвечать

**API Project Number / ID**

    391607440018

**API Project Name**

    My First Project

Переименуйте проект в `THE MHS Publisher` — так заявка выглядит осмысленной,
а не заготовкой по умолчанию.

---

**Describe your API Client and its core functionality**

    A private automation tool for a single YouTube channel that we own
    (THE MHS — @THE_MHS). It uploads our own short-form videos on a fixed
    daily schedule: three videos in the morning-to-evening window.

    The videos are original material we produce ourselves — rendered
    text cards about AI tools and business prompts, combined with music
    we hold the rights to. Nothing is sourced from other channels.

    The tool is used only by the channel owner. It has no end users,
    no sign-up, and it never accesses any account other than our own.

---

**Which APIs and scopes do you use, and why**

    YouTube Data API v3.

    - youtube.upload — publishes our own videos to our own channel.
    - youtube.readonly — verifies the destination channel before upload,
      so an upload cannot go to the wrong account.
    - youtube.force-ssl — sets the privacy status of the videos we
      uploaded ourselves. We do not read or modify anything belonging
      to other users.

---

**How often do you call the API**

    Six uploads per day at most — three for each of our two content
    series. Roughly 9,600 quota units daily, within the default limit.
    No bulk operations, no polling loops.

---

**Is the client publicly available?**

    No. It runs as a scheduled job in our own private infrastructure
    and authenticates as the channel owner only.

---

**Where can we see the client in action?**

    The channel itself: https://www.youtube.com/@THE_MHS

    The tool has no interface — it is a scheduled script. We can supply
    a screen recording of a run and the source code on request.

---

## О чём стоит подумать до отправки

Google смотрит на аудит не только с технической стороны. Сотня роликов
одного шаблона, выходящих механически по расписанию, — это тот профиль
контента, который правила YouTube описывают как повторяющийся. Риск не в
самом аудите, а в том, что канал попадёт под ограничения по переиспользуемому
контенту, и это скажется на охватах и монетизации.

Снижается это тем, чем обычно: разные заголовки и озвучка, живые вставки,
реальная польза в описании. У нас заголовки уже все разные, музыка
чередуется между 42 отрывками — это лучше, чем шаблон в лоб, но всё
равно стоит держать в голове.

Заявку это не блокирует. Просто знайте заранее.
