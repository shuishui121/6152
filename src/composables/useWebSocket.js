import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useCompetitionStore } from '../stores/competition'

const WS_URL = 'ws://localhost:8080'
const INITIAL_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const MAX_RECONNECT_ATTEMPTS = 20
const PING_INTERVAL = 15000

export function useWebSocket(isJudge = false) {
  const store = useCompetitionStore()
  const ws = ref(null)
  const isConnected = ref(false)
  const reconnectCount = ref(0)
  const latency = ref(0)
  const clientId = ref(null)
  const pendingOperations = ref([])
  const hasPendingOperations = computed(() => pendingOperations.value.length > 0)
  const isReconnecting = ref(false)
  const lastDisconnectTime = ref(null)

  let reconnectTimer = null
  let pingTimer = null
  let reconnectDelay = INITIAL_RECONNECT_DELAY

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
        reconnectDelay = INITIAL_RECONNECT_DELAY
        store.wsError = null
        isReconnecting.value = false

        if (isJudge) {
          sendMessage('register_judge')
        }

        if (store.version > 0) {
          sendMessage('sync_version', { clientVersion: store.version })
        } else {
          sendMessage('get_state')
        }

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
        lastDisconnectTime.value = Date.now()
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
        handleStateSync(msg.data)
        if (msg.clientId) {
          clientId.value = msg.clientId
        }
        break

      case 'version_check':
        handleVersionCheck(msg.data)
        break

      case 'version_conflict':
        handleVersionConflict(msg.data)
        break

      case 'operation_ack':
        handleOperationAck(msg.data)
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

  function handleStateSync(data) {
    const { state, isFullSync, serverVersion, operations } = data

    if (isFullSync) {
      const hasVersionMismatch = store.version > 0 && store.version !== serverVersion
      const hasPending = pendingOperations.value.length > 0

      store.setState(state)
      store.version = serverVersion

      if (hasVersionMismatch && isJudge) {
        console.log(`[WS] 状态已同步: v${store.version}, 服务端领先 ${operations || 0} 个操作`)
      }

      if (hasPending && isJudge) {
        store.hasUnsubmittedOperations = true
      }
    }
  }

  function handleVersionCheck(data) {
    const { inSync, serverVersion, clientVersion } = data
    if (inSync) {
      console.log('[WS] 版本一致，无需同步')
      store.version = serverVersion
    } else {
      sendMessage('get_state')
    }
  }

  function handleVersionConflict(data) {
    const { clientVersion, serverVersion, message } = data
    console.warn(`[WS] 版本冲突: 客户端v${clientVersion}, 服务端v${serverVersion}`)
    store.wsError = message || '版本冲突，正在同步...'
    sendMessage('get_state')
  }

  function handleOperationAck(data) {
    const { operationId, type, serverVersion, success } = data
    if (success) {
      store.version = serverVersion
      const index = pendingOperations.value.findIndex(op => op.tempId === operationId)
      if (index !== -1) {
        pendingOperations.value.splice(index, 1)
      }
      if (pendingOperations.value.length === 0) {
        store.hasUnsubmittedOperations = false
      }
    }
  }

  function sendMessage(type, data = {}) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.warn('[WS] 连接未就绪，消息未发送:', type)
      return false
    }

    try {
      const message = { type, data }
      ws.value.send(JSON.stringify(message))
      return true
    } catch (err) {
      console.error('[WS] 消息发送失败:', err)
      return false
    }
  }

  function queueOperation(type, data = {}) {
    if (!isJudge) return false

    const tempId = Date.now() + Math.random()
    const operation = {
      tempId,
      type,
      data: { ...data, clientVersion: store.version },
      timestamp: Date.now()
    }

    if (isConnected.value) {
      const sent = sendMessage(type, { ...data, clientVersion: store.version })
      if (!sent) {
        pendingOperations.value.push(operation)
        store.hasUnsubmittedOperations = true
      }
    } else {
      pendingOperations.value.push(operation)
      store.hasUnsubmittedOperations = true
    }

    return true
  }

  function submitPendingOperations() {
    if (!isConnected.value || pendingOperations.value.length === 0) return

    console.log(`[WS] 提交 ${pendingOperations.value.length} 个待处理操作`)

    const operations = [...pendingOperations.value]
    pendingOperations.value = []

    operations.forEach((op, index) => {
      setTimeout(() => {
        if (isConnected.value) {
          sendMessage(op.type, { ...op.data, clientVersion: store.version })
        } else {
          pendingOperations.value.push(op)
        }
      }, index * 100)
    })
  }

  function clearPendingOperations() {
    pendingOperations.value = []
    store.hasUnsubmittedOperations = false
  }

  function startPing() {
    stopPing()
    pingTimer = setInterval(() => {
      if (isConnected.value) {
        sendMessage('ping')
      }
    }, PING_INTERVAL)
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
    const delay = reconnectDelay
    console.log(`[WS] ${(delay / 1000).toFixed(1)}秒后尝试第 ${reconnectCount.value} 次重连...`)

    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)

    reconnectTimer = setTimeout(() => {
      isReconnecting.value = true
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

  function forceSync() {
    if (isConnected.value) {
      sendMessage('get_state')
    }
  }

  function recordResult(athleteId, height, status) {
    return queueOperation('record_result', { athleteId, height, status })
  }

  function nextAthlete() {
    return queueOperation('next_athlete', {})
  }

  function setCurrentAthlete(athleteId) {
    return queueOperation('set_current_athlete', { athleteId })
  }

  function nextHeight() {
    return queueOperation('next_height', {})
  }

  function prevHeight() {
    return queueOperation('prev_height', {})
  }

  function setHeight(height) {
    return queueOperation('set_height', { height })
  }

  function switchToFinal() {
    return queueOperation('switch_to_final', {})
  }

  function initCompetition(name) {
    return queueOperation('init_competition', { name })
  }

  function resetCompetition() {
    return queueOperation('reset_competition', {})
  }

  function addAthlete(athlete) {
    return queueOperation('add_athlete', athlete)
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
    clientId,
    pendingOperations,
    hasPendingOperations,
    isReconnecting,
    lastDisconnectTime,
    connect,
    disconnect,
    forceSync,
    sendMessage,
    submitPendingOperations,
    clearPendingOperations,
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
