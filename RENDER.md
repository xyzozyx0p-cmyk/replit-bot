# Деплой на Render.com — пошаговая инструкция

## Что нужно
- Аккаунт на https://render.com (бесплатно, через GitHub или Google)
- Этот ZIP архив

## Шаги

### 1. Загрузи код на GitHub
1. Зайди на https://github.com и создай новый репозиторий (New repository)
2. Назови его `minecraft-bot` (или любое другое имя)
3. Сделай его **Private** (приватным) — там хранится ник бота
4. Распакуй ZIP архив на компьютере
5. Загрузи все файлы в репозиторий через кнопку **"uploading an existing file"**

### 2. Создай сервис на Render
1. Зайди на https://render.com
2. Нажми **"New +"** → **"Web Service"**
3. Выбери **"Connect a repository"** → подключи свой GitHub
4. Выбери репозиторий `minecraft-bot`
5. Заполни поля:
   - **Name**: minecraft-bot (любое)
   - **Region**: Frankfurt (EU Central) — ближе к серверу
   - **Branch**: main
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: **Free**
6. Нажми **"Create Web Service"**

### 3. Готово!
Render автоматически:
- Установит все зависимости (`npm install`)
- Запустит сервер (`node server.js`)
- Выдаст тебе URL вида `https://minecraft-bot-XXXX.onrender.com`

По этому URL будет твой дашборд — открывается в любом браузере.

## Важные замечания
- **Бесплатный план Render** переходит в спящий режим через 15 минут без запросов
- Для постоянной работы 24/7 зарегистрируйся на https://uptimerobot.com и добавь туда свой Render URL
- **3D вид от первого лица** доступен только при запуске на Replit (из-за ограничений портов на Render)

## Настройка никнейма/сервера
Если нужно изменить настройки бота — отредактируй файл `server.js`, строки 14-21:
```js
const BOT_CONFIG = {
  host: 'theworldland.aternos.me',  // адрес сервера
  port: 17417,                       // порт
  username: 'myboted0',              // ник
  version: '1.21.10',               // версия Minecraft
  auth: 'offline'
}
```
