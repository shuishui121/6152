import { ref, onMounted, onUnmounted } from 'vue'
import { useCompetitionStore } from '../stores/competition'

const WS_URL = 'ws://localhost:8080'
const RECONNECT_DELAY = 3000
const MAX_RECONNECT_ATTEMPTS = 10

export function useWebSocket(isJudge = false) {
  const store = useCompetitionStore()
  const ws = ref(null)
  const isConnected = ref(false)
  const reconnectCount = ref(0)
  const latency = ref(0)
  let reconnectTimer = null
  let pingTimer = null

  function connect() {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      return
    }

    try {
      store.connectionStatus = 'connecting'
      ws.value = new WebSocket(WS_URL)

      ws.value.onopen = () => {
        console.log('[WS] 连接已建立')
        isConnected.value = true
        store.connectionStatus = 'connected'
        reconnectCount.value = 0
        store.wsError = null

        if (isJudge) {
          sendMessage('register_judge')
        }

        sendMessage('get_state')
        startPing()
      }

      ws.value.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          handleMessage(msg)
        } catch (err) {
          console.error('[WS] 消息解析失败:', err)
        }
      }

      ws.value.onclose = (event) => {
        console.log(`[WS] 连接关闭: code=${event.code}, reason=${event.reason}`)
        isConnected.value = false
        store.connectionStatus = 'disconnected'
        stopPing()
        scheduleReconnect()
      }

      ws.value.onerror = (err) => {
        console.error('[WS] 连接错误:', err)
        store.wsError = '连接错误'
        store.connectionStatus = 'error'
      }
    } catch (err) {
      console.error('[WS] 连接失败:', err)
      store.connectionStatus = 'error'
      store.wsError = err.message
      scheduleReconnect()
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'state_sync':
        store.setState(msg.data)
        break

      case 'pong':
        const now = Date.now()
        latency.value = now - (msg.data?.timestamp || 0)
        break

      case 'judge_registered':
        console.log('[WS] 裁判身份已确认')
        break

      case 'error':
        console.error('[WS] 服务器错误:', msg.data?.message)
        store.wsError = msg.data?.message
        break

      default:
        console.warn('[WS] 未知消息类型:', msg.type)
    }
  }

  function sendMessage(type, data = {}) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.warn('[WS] 连接未就绪，消息未发送:', type)
      return false
    }

    try {
      ws.value.send(JSON.stringify({ type, data }))
      return true
    } catch (err) {
      console.error('[WS] 消息发送失败:', err)
      return false
    }
  }

  function startPing() {
    stopPing()
    pingTimer = setInterval(() => {
      if (isConnected.value) {
        sendMessage('ping')
      }
    }, 15000)
  }

  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }

    if (reconnectCount.value >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WS] 达到最大重连次数，停止重连')
      store.connectionStatus = 'failed'
      return
    }

    reconnectCount.value++
    const delay = RECONNECT_DELAY * Math.min(reconnectCount.value, 5)
    console.log(`[WS] ${delay / 1000}秒后尝试第 ${reconnectCount.value} 次重连...`)

    reconnectTimer = setTimeout(() => {
      connect()
    }, delay)
  }

  function disconnect() {
    stopPing()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    isConnected.value = false
    store.connectionStatus = 'disconnected'
  }

  function recordResult(athleteId, height, status) {
    return sendMessage('record_result', { athleteId, height, status })
  }

  function nextAthlete() {
    return sendMessage('next_athlete')
  }

  function setCurrentAthlete(athleteId) {
    return sendMessage('set_current_athlete', { athleteId })
  }

  function nextHeight() {
    return sendMessage('next_height')
  }

  function prevHeight() {
    return sendMessage('prev_height')
  }

  function setHeight(height) {
    return sendMessage('set_height', { height })
  }

  function switchToFinal() {
    return sendMessage('switch_to_final')
  }

  function initCompetition(name) {
    return sendMessage('init_competition', { name })
  }

  function resetCompetition() {
    return sendMessage('reset_competition')
  }

  function addAthlete(athlete) {
    return sendMessage('add_athlete', athlete)
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    ws,
    isConnected,
    latency,
    reconnectCount,
    connect,
    disconnect,
    sendMessage,
    recordResult,
    nextAthlete,
    setCurrentAthlete,
    nextHeight,
    prevHeight,
    setHeight,
    switchToFinal,
    initCompetition,
    resetCompetition,
    addAthlete
  }
}
