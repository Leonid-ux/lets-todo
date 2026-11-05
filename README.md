# Lets Todo

**Lets Todo** — минималистичное приложение для управления задачами, отслеживания привычек, событий и учёта времени.

[![Downloads](https://img.shields.io/github/downloads/Leonid-ux/lets-todo/total?style=flat-square&color=blue&label=Downloads)](https://github.com/Leonid-ux/lets-todo/releases)
[![Version](https://img.shields.io/github/v/release/Leonid-ux/lets-todo?style=flat-square&color=green&label=Version)](https://github.com/Leonid-ux/lets-todo/releases/latest)
[![Stars](https://img.shields.io/github/stars/Leonid-ux/lets-todo?style=flat-square&color=orange&label=Stars)](https://github.com/Leonid-ux/lets-todo/stargazers)

## Платформа и совместимость

[![Windows](https://img.shields.io/badge/Platform-Windows-0078D4?style=flat-square&logo=windows11&logoColor=white)](https://github.com/Leonid-ux/lets-todo/releases/latest)

## Технологии

[![Electron](https://img.shields.io/badge/Electron-35-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-663399?style=flat-square&logo=css&logoColor=white)](https://developer.mozilla.org/docs/Web/CSS)

## Возможности

- **Задачи** — создание задач и подзадач с датами, приоритетами, тегами и повторениями.
- **Умный ввод** — распознавание дат и времени из естественного языка. Например, «Встреча завтра в 15:00».
- **Привычки** — отслеживание ежедневных привычек, количества выполнений и истории прогресса.
- **Таймеры** — учёт времени с ручным запуском и остановкой.
- **События** — ведение календаря и регистрация событий.
- **Личные записи** — возможность скрывать личные задачи и привычки.
- **Статистика** — просмотр активности и прогресса.
- **Уведомления** — напоминания о запланированных задачах.
- **Обновления** — проверка и установка новых версий через GitHub.

## Скачать

**[Скачать последнюю версию для Windows](https://github.com/Leonid-ux/lets-todo/releases/latest)**

Загрузите установщик `.exe` из последнего релиза. Также доступна portable-версия, если она опубликована в выбранном релизе.

## Разработка

Для локального запуска необходимы Node.js и npm.

```bash
git clone https://github.com/Leonid-ux/lets-todo.git
cd lets-todo
npm install
npm start
```

## Поддержать проект

Lets Todo — независимый проект, который развивается в свободное время. Если приложение оказалось полезным, вы можете поддержать его дальнейшую разработку.

[![DonationAlerts](https://img.shields.io/badge/Поддержать-DonationAlerts-FF7F00?style=flat-square)](https://www.donationalerts.com/r/leonid_ux)

Также можно воспользоваться QR-кодом:

<a href="https://www.donationalerts.com/r/leonid_ux">
  <img src="https://files.donationalerts.com/uploads/qr/11750644/qr_d3265ffca371884a4c0e9167371b7393.png" alt="QR-код DonationAlerts" width="160">
</a>

## Автор

**Leonid Tsvetkov / Lets Design**

[ВКонтакте](https://vk.ru/leonidts) · [Instagram](https://www.instagram.com/leonid.tsv/) · [X](https://x.com/leonid_tsv) · [Telegram](https://t.me/Leonid_ts) · [Сайт](https://leonidts.tilda.ws/)

**Email:** [leonidts@vk.com](mailto:leonidts@vk.com)

---

*Lets Todo — независимый проект для персонального управления задачами и привычками.*

## Запуск в режиме разработки

`npm start` открывает рабочий профиль установленной версии. Обе версии читают и сохраняют данные в этом профиле, поэтому перед переключением полностью закройте запущенную версию, в том числе через меню в трее, если она там свёрнута.

Для запуска с отдельным профилем разработки используйте `npm start -- --isolated-profile`. Так можно открыть списки, созданные в режиме разработки до перехода на общий профиль.
