const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const mineflayer = require('./index.js')
const path = require('path')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const BOT_CONFIG = {
  host: 'theworldland.aternos.me',
  port: 17417,
  username: 'myboted0',
  hideErrors: false,
  auth: 'offline'
}

const logBuffer = []
function serverLog (level, ...args) {
  const text = args.join(' ')
  const entry = { level, text, time: new Date().toLocaleTimeString('ru-RU') }
  logBuffer.push(entry)
  if (logBuffer.length > 200) logBuffer.shift()
  io.emit('log', entry)
  if (level === 'error') {
    console.error(`[${level.toUpperCase()}]`, text)
  } else {
    console.log(`[${level.toUpperCase()}]`, text)
  }
}

let bot = null
const VIEWER_PORT = 3000
let viewerStarted = false
let botStatus = 'disconnected'
let reconnectTimer = null

function getBotData () {
  if (!bot || botStatus !== 'connected') {
    return { status: botStatus, health: 0, food: 0, inventory: [], position: null }
  }

  const inventory = []
  if (bot.inventory) {
    bot.inventory.items().forEach(item => {
      inventory.push({
        slot: item.slot,
        name: item.name,
        displayName: item.displayName || item.name,
        count: item.count,
        type: item.type
      })
    })
  }

  return {
    status: botStatus,
    health: bot.health || 0,
    food: bot.food || 0,
    inventory,
    position: bot.entity ? {
      x: Math.round(bot.entity.position.x * 10) / 10,
      y: Math.round(bot.entity.position.y * 10) / 10,
      z: Math.round(bot.entity.position.z * 10) / 10
    } : null
  }
}

function startViewerIfNeeded () {
  if (viewerStarted) return
  try {
    const { mineflayer: mineflayerViewer } = require('prismarine-viewer')
    const viewerInstance = mineflayerViewer(bot, { port: VIEWER_PORT, firstPerson: true })
    if (viewerInstance && viewerInstance.on) {
      viewerInstance.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          serverLog('warn', `Viewer port ${VIEWER_PORT} already in use, skipping`)
          viewerStarted = true
        } else {
          serverLog('error', 'Viewer error: ' + err.message)
        }
      })
    }
    viewerStarted = true
    serverLog('info', `3D viewer started on port ${VIEWER_PORT}`)
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      viewerStarted = true
      serverLog('warn', `Viewer port ${VIEWER_PORT} already in use, reusing existing`)
    } else {
      serverLog('error', 'Failed to start viewer: ' + err.message)
    }
  }
}

function createBot () {
  serverLog('info', `Подключение к ${BOT_CONFIG.host}:${BOT_CONFIG.port} как ${BOT_CONFIG.username} (автоопределение версии)...`)
  botStatus = 'connecting'
  io.emit('status', { status: botStatus })

  try {
    bot = mineflayer.createBot(BOT_CONFIG)
  } catch (err) {
    serverLog('error', 'Не удалось создать бота: ' + err.message)
    botStatus = 'error'
    io.emit('status', { status: botStatus, error: err.message })
    scheduleReconnect()
    return
  }

  let loggedIn = false

  bot.on('login', () => {
    serverLog('info', `Бот вошёл на сервер как ${BOT_CONFIG.username}`)
    botStatus = 'connected'
    loggedIn = false
    io.emit('status', { status: botStatus })
    setTimeout(startViewerIfNeeded, 3000)
    // Авторегистрация через nLogin
    setTimeout(() => {
      if (bot) {
        serverLog('info', 'Попытка регистрации (/reg)...')
        bot.chat('/reg BotBotBotBot BotBotBotBot')
      }
    }, 1500)
  })

  bot.on('health', () => { io.emit('stats', getBotData()) })
  bot.on('playerCollect', () => { io.emit('stats', getBotData()) })

  bot.on('message', (message) => {
    const text = message.toString()
    serverLog('chat', text)
    io.emit('chat', { message: text, timestamp: Date.now() })

    // Автологин если аккаунт уже зарегистрирован
    const lower = text.toLowerCase()
    if (!loggedIn && (
      lower.includes('already') ||
      lower.includes('уже зарегистр') ||
      lower.includes('logged in') ||
      lower.includes('вошли') ||
      lower.includes('login') && lower.includes('password')
    )) {
      setTimeout(() => {
        if (bot) {
          serverLog('info', 'Автологин (/login)...')
          bot.chat('/login BotBotBotBot')
        }
      }, 500)
    }
    if (!loggedIn && (
      lower.includes('successfully registered') ||
      lower.includes('успешно зарегистр') ||
      lower.includes('successfully logged') ||
      lower.includes('успешно вошли') ||
      lower.includes('добро пожаловать')
    )) {
      loggedIn = true
      serverLog('info', 'Автологин выполнен успешно!')
    }
  })

  bot.on('error', (err) => {
    serverLog('error', 'Ошибка бота: ' + err.message)
    botStatus = 'error'
    io.emit('status', { status: botStatus, error: err.message })
  })

  bot.on('end', (reason) => {
    serverLog('warn', 'Бот отключён: ' + reason)
    botStatus = 'disconnected'
    io.emit('status', { status: botStatus })
    scheduleReconnect()
  })

  bot.on('kicked', (reason) => {
    const reasonStr = typeof reason === 'object' ? JSON.stringify(reason) : String(reason)
    serverLog('warn', 'Бот кикнут: ' + reasonStr)
    botStatus = 'kicked'
    io.emit('status', { status: botStatus, error: reasonStr })
    scheduleReconnect()
  })
}

function scheduleReconnect () {
  if (reconnectTimer) return
  serverLog('info', 'Переподключение через 15 секунд...')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    createBot()
  }, 15000)
}

function forceReconnect () {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (bot) {
    try { bot.quit() } catch (_) {}
    bot = null
  }
  serverLog('info', 'Принудительное переподключение...')
  createBot()
}

setInterval(() => {
  if (bot && botStatus === 'connected') {
    io.emit('stats', getBotData())
  }
}, 1000)

app.get('/api/status', (req, res) => { res.json(getBotData()) })

app.get('/api/viewer-url', (req, res) => {
  const devDomain = process.env.REPLIT_DEV_DOMAIN
  if (devDomain) {
    res.json({ url: `https://${VIEWER_PORT}-${devDomain}` })
  } else {
    res.json({ url: null })
  }
})

app.post('/api/chat', (req, res) => {
  const { message } = req.body
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' })
  if (!bot || botStatus !== 'connected') return res.status(503).json({ error: 'Bot is not connected' })
  try {
    bot.chat(message.trim())
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/restart', (req, res) => {
  serverLog('info', 'Ручной перезапуск через API')
  forceReconnect()
  res.json({ success: true })
})

app.get('/api/logs', (req, res) => { res.json(logBuffer) })

app.get('/ping', (req, res) => { res.json({ alive: true, timestamp: Date.now() }) })

io.on('connection', (socket) => {
  serverLog('info', 'Браузер подключился к панели управления')
  socket.emit('stats', getBotData())
  socket.emit('log_history', logBuffer)

  socket.on('chat', ({ message }) => {
    if (!message || !message.trim()) return
    if (!bot || botStatus !== 'connected') {
      socket.emit('chat_error', { error: 'Bot is not connected' })
      return
    }
    try { bot.chat(message.trim()) } catch (err) {
      socket.emit('chat_error', { error: err.message })
    }
  })

  socket.on('restart', () => {
    serverLog('info', 'Принудительный перезапуск через WebSocket')
    forceReconnect()
  })

  socket.on('disconnect', () => {
    console.log('[WS] Client disconnected')
  })
})

const PORT = process.env.PORT || 5000
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://0.0.0.0:${PORT}`)
  createBot()
  startKeepAlive()
})

function startKeepAlive () {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args))

  let selfUrl = null
  if (process.env.REPLIT_DEV_DOMAIN) {
    selfUrl = `https://${process.env.REPLIT_DEV_DOMAIN}/ping`
  } else if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    selfUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/ping`
  }

  if (!selfUrl) {
    console.log('[KeepAlive] No external URL found, self-ping disabled')
    return
  }

  const pingers = [
    { name: 'Pinger-A', interval: 60 * 1000 },
    { name: 'Pinger-B', interval: 2 * 60 * 1000 },
    { name: 'Pinger-C', interval: 3 * 60 * 1000 }
  ]

  pingers.forEach(({ name, interval }) => {
    setTimeout(() => {
      setInterval(async () => {
        try {
          const res = await fetch(selfUrl, { signal: AbortSignal.timeout(8000) })
          if (res.ok) console.log(`[${name}] ping ok`)
          else console.log(`[${name}] ping HTTP ${res.status}`)
        } catch (err) {
          console.log(`[${name}] ping failed: ${err.message}`)
        }
      }, interval)
    }, Math.random() * 30000)
  })

  console.log(`[KeepAlive] 3 pingers started → ${selfUrl}`)
}
