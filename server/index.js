const { WebSocketServer } = require('ws')
const {
  createAthlete,
  recordAttempt,
  calculateRankings,
  getCurrentStatus,
  RoundType,
  AttemptStatus,
  QUALIFICATION_HEIGHTS,
  FINAL_HEIGHTS,
  getQualifiedAthletes
} = require('../src/utils/competitionRules.js')

const PORT = process.env.PORT || 8080
const HEARTBEAT_INTERVAL = 30000
const STATE_SYNC_INTERVAL = 5000
const MAX_OPERATION_HISTORY = 1000

class CompetitionState {
  constructor() {
    this.roundType = RoundType.QUALIFICATION
    this.currentHeight = QUALIFICATION_HEIGHTS[0]
    this.athletes = []
    this.currentAthleteIndex = 0
    this.isRunning = false
    this.competitionName = '全国田径锦标赛 - 跳高项目'
    this.lastUpdate = Date.now()
    this.version = 0
    this.operationHistory = []
    this.operationIdCounter = 0
  }

  get heights() {
    return this.roundType === RoundType.QUALIFICATION
      ? QUALIFICATION_HEIGHTS
      : FINAL_HEIGHTS
  }

  get activeAthletes() {
    return this.athletes.filter(a => !a.isEliminated)
  }

  get currentAthlete() {
    return this.activeAthletes[this.currentAthleteIndex] || null
  }

  get currentHeightIndex() {
    return this.heights.indexOf(this.currentHeight)
  }

  createOperation(type, data, clientId) {
    this.operationIdCounter++
    const operation = {
      id: this.operationIdCounter,
      type,
      data,
      clientId,
      timestamp: Date.now(),
      version: this.version
    }
    return operation
  }

  recordOperation(operation) {
    this.operationHistory.push(operation)
    if (this.operationHistory.length > MAX_OPERATION_HISTORY) {
      this.operationHistory.shift()
    }
  }

  bumpVersion(operation) {
    this.version++
    this.lastUpdate = Date.now()
    if (operation) {
      operation.version = this.version
      this.recordOperation(operation)
    }
  }

  getState() {
    return {
      roundType: this.roundType,
      currentHeight: this.currentHeight,
      athletes: JSON.parse(JSON.stringify(this.athletes)),
      currentAthleteIndex: this.currentAthleteIndex,
      isRunning: this.isRunning,
      competitionName: this.competitionName,
      lastUpdate: this.lastUpdate,
      version: this.version,
      rankings: calculateRankings(this.athletes)
    }
  }

  getOperationsSinceVersion(version) {
    if (version >= this.version) return []
    return this.operationHistory.filter(op => op.version > version)
  }

  initCompetition(name, clientId) {
    const op = this.createOperation('init_competition', { name }, clientId)
    if (name) this.competitionName = name
    this.roundType = RoundType.QUALIFICATION
    this.currentHeight = QUALIFICATION_HEIGHTS[0]
    this.currentAthleteIndex = 0
    this.isRunning = true
    this.bumpVersion(op)
    return op
  }

  addAthlete(id, name, team, seed, clientId) {
    const op = this.createOperation('add_athlete', { id, name, team, seed }, clientId)
    const athlete = createAthlete(id, name, team, seed)
    this.athletes.push(athlete)
    this.bumpVersion(op)
    return { op, athlete }
  }

  addAthletes(athleteList, clientId) {
    const ops = []
    athleteList.forEach((a, i) => {
      const result = this.addAthlete(
        a.id || `athlete-${Date.now()}-${i}`,
        a.name,
        a.team,
        a.seed || i + 1,
        clientId
      )
      ops.push(result.op)
    })
    return ops
  }

  recordResult(athleteId, height, status, clientId) {
    const op = this.createOperation('record_result', { athleteId, height, status }, clientId)
    const athlete = this.athletes.find(a => a.id === athleteId)
    if (!athlete) throw new Error('运动员不存在')
    recordAttempt(athlete, height, status)
    this.bumpVersion(op)
    return { op, athlete }
  }

  nextAthlete(clientId) {
    const op = this.createOperation('next_athlete', {}, clientId)
    const active = this.activeAthletes
    if (active.length === 0) return null

    this.currentAthleteIndex = (this.currentAthleteIndex + 1) % active.length

    let count = 0
    while (count < active.length) {
      const athlete = active[this.currentAthleteIndex]
      const status = getCurrentStatus(athlete, this.currentHeight)
      if (!status.completed) break
      this.currentAthleteIndex = (this.currentAthleteIndex + 1) % active.length
      count++
    }
    this.bumpVersion(op)
    return op
  }

  setCurrentAthlete(athleteId, clientId) {
    const op = this.createOperation('set_current_athlete', { athleteId }, clientId)
    const index = this.activeAthletes.findIndex(a => a.id === athleteId)
    if (index !== -1) {
      this.currentAthleteIndex = index
      this.bumpVersion(op)
      return op
    }
    return null
  }

  nextHeight(clientId) {
    const op = this.createOperation('next_height', {}, clientId)
    const index = this.currentHeightIndex
    if (index === -1 || index >= this.heights.length - 1) return null
    this.currentHeight = this.heights[index + 1]
    this.currentAthleteIndex = 0
    this.bumpVersion(op)
    return op
  }

  prevHeight(clientId) {
    const op = this.createOperation('prev_height', {}, clientId)
    const index = this.currentHeightIndex
    if (index <= 0) return null
    this.currentHeight = this.heights[index - 1]
    this.currentAthleteIndex = 0
    this.bumpVersion(op)
    return op
  }

  setHeight(height, clientId) {
    const op = this.createOperation('set_height', { height }, clientId)
    if (this.heights.includes(height)) {
      this.currentHeight = height
      this.currentAthleteIndex = 0
      this.bumpVersion(op)
      return op
    }
    return null
  }

  switchToFinal(clientId) {
    const op = this.createOperation('switch_to_final', {}, clientId)
    const qualified = getQualifiedAthletes(this.athletes, QUALIFICATION_HEIGHTS)
    this.athletes = qualified
    this.roundType = RoundType.FINAL
    this.currentHeight = FINAL_HEIGHTS[0]
    this.currentAthleteIndex = 0
    this.bumpVersion(op)
    return op
  }

  resetCompetition(clientId) {
    const op = this.createOperation('reset_competition', {}, clientId)
    this.roundType = RoundType.QUALIFICATION
    this.currentHeight = QUALIFICATION_HEIGHTS[0]
    this.athletes = []
    this.currentAthleteIndex = 0
    this.isRunning = false
    this.operationHistory = []
    this.operationIdCounter = 0
    this.bumpVersion(op)
    return op
  }
}

const state = new CompetitionState()

function initializeDemoData() {
  const demoAthletes = [
    { id: 'a1', name: '张国伟', team: '山东队', seed: 1 },
    { id: 'a2', name: '王宇', team: '北京队', seed: 2 },
    { id: 'a3', name: '白龙', team: '上海队', seed: 3 },
    { id: 'a4', name: '陈伟', team: '广东队', seed: 4 },
    { id: 'a5', name: '李明', team: '江苏队', seed: 5 },
    { id: 'a6', name: '赵强', team: '浙江队', seed: 6 },
    { id: 'a7', name: '孙磊', team: '湖北队', seed: 7 },
    { id: 'a8', name: '周凯', team: '湖南队', seed: 8 },
    { id: 'a9', name: '吴鹏', team: '福建队', seed: 9 },
    { id: 'a10', name: '郑浩', team: '四川队', seed: 10 },
    { id: 'a11', name: '钱勇', team: '辽宁队', seed: 11 },
    { id: 'a12', name: '冯斌', team: '天津队', seed: 12 },
    { id: 'a13', name: '韩磊', team: '河南队', seed: 13 },
    { id: 'a14', name: '杨涛', team: '河北队', seed: 14 },
    { id: 'a15', name: '朱峰', team: '安徽队', seed: 15 },
    { id: 'a16', name: '秦华', team: '江西队', seed: 16 }
  ]
  state.addAthletes(demoAthletes, 'system')
  state.initCompetition(undefined, 'system')
}

initializeDemoData()

const wss = new WebSocketServer({
  port: PORT,
  maxPayload: 1024 * 1024
})

const clients = new Map()
let clientIdCounter = 0
let isProcessingOperation = false
const pendingOperations = []

wss.on('connection', (ws, req) => {
  const clientId = ++clientIdCounter
  clients.set(ws, {
    id: clientId,
    isJudge: false,
    lastPing: Date.now(),
    lastKnownVersion: 0
  })

  console.log(`[WS] 客户端连接: #${clientId}, 当前连接数: ${clients.size}`)

  ws.send(JSON.stringify({
    type: 'state_sync',
    data: {
      state: state.getState(),
      isFullSync: true,
      serverVersion: state.version
    },
    clientId
  }))

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString())
      handleMessage(ws, msg)
    } catch (err) {
      console.error('[WS] 消息解析错误:', err.message)
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: '无效的消息格式' }
      }))
    }
  })

  ws.on('pong', () => {
    const client = clients.get(ws)
    if (client) {
      client.lastPing = Date.now()
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[WS] 客户端断开: #${clientId}, 当前连接数: ${clients.size}`)
  })

  ws.on('error', (err) => {
    console.error(`[WS] 客户端错误 #${clientId}:`, err.message)
    clients.delete(ws)
  })
})

function processPendingOperations() {
  if (isProcessingOperation || pendingOperations.length === 0) return

  isProcessingOperation = true
  const { ws, msg, client } = pendingOperations.shift()

  try {
    executeOperation(ws, msg, client)
  } catch (err) {
    console.error('[WS] 操作执行错误:', err.message)
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: err.message }
    }))
  } finally {
    isProcessingOperation = false
    setImmediate(processPendingOperations)
  }
}

function handleMessage(ws, msg) {
  const client = clients.get(ws)
  if (!client) return

  switch (msg.type) {
    case 'register_judge':
      client.isJudge = true
      console.log(`[WS] 客户端 #${client.id} 注册为裁判`)
      ws.send(JSON.stringify({
        type: 'judge_registered',
        data: { success: true }
      }))
      break

    case 'get_state':
      ws.send(JSON.stringify({
        type: 'state_sync',
        data: {
          state: state.getState(),
          isFullSync: true,
          serverVersion: state.version
        }
      }))
      break

    case 'sync_version':
      handleVersionSync(ws, msg.data, client)
      break

    case 'record_result':
    case 'next_athlete':
    case 'set_current_athlete':
    case 'next_height':
    case 'prev_height':
    case 'set_height':
    case 'switch_to_final':
    case 'init_competition':
    case 'reset_competition':
    case 'add_athlete':
      if (!client.isJudge) {
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: '无权限操作，请先注册为裁判' }
        }))
        return
      }
      pendingOperations.push({ ws, msg, client })
      processPendingOperations()
      break

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', data: { timestamp: Date.now() } }))
      break

    default:
      console.warn(`[WS] 未知消息类型: ${msg.type}`)
  }
}

function handleVersionSync(ws, data, client) {
  const clientVersion = data?.clientVersion || 0
  client.lastKnownVersion = clientVersion

  const operations = state.getOperationsSinceVersion(clientVersion)

  if (operations.length === 0) {
    ws.send(JSON.stringify({
      type: 'version_check',
      data: {
        inSync: true,
        serverVersion: state.version,
        clientVersion
      }
    }))
  } else if (operations.length <= 50) {
    ws.send(JSON.stringify({
      type: 'state_sync',
      data: {
        state: state.getState(),
        isFullSync: true,
        serverVersion: state.version,
        clientVersion,
        operations: operations.length
      }
    }))
  } else {
    ws.send(JSON.stringify({
      type: 'state_sync',
      data: {
        state: state.getState(),
        isFullSync: true,
        serverVersion: state.version,
        clientVersion,
        operations: operations.length
      }
    }))
  }
}

function executeOperation(ws, msg, client) {
  const clientId = client.id

  switch (msg.type) {
    case 'record_result': {
      const { athleteId, height, status, clientVersion } = msg.data
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const result = state.recordResult(athleteId, height, status, clientId)
      ws.send(JSON.stringify({
        type: 'operation_ack',
        data: {
          operationId: result.op.id,
          type: msg.type,
          serverVersion: state.version,
          success: true
        }
      }))
      broadcastState()
      break
    }

    case 'next_athlete': {
      const { clientVersion } = msg.data || {}
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const op = state.nextAthlete(clientId)
      if (op) {
        ws.send(JSON.stringify({
          type: 'operation_ack',
          data: {
            operationId: op.id,
            type: msg.type,
            serverVersion: state.version,
            success: true
          }
        }))
        broadcastState()
      }
      break
    }

    case 'set_current_athlete': {
      const { athleteId, clientVersion } = msg.data
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const op = state.setCurrentAthlete(athleteId, clientId)
      if (op) {
        ws.send(JSON.stringify({
          type: 'operation_ack',
          data: {
            operationId: op.id,
            type: msg.type,
            serverVersion: state.version,
            success: true
          }
        }))
        broadcastState()
      }
      break
    }

    case 'next_height': {
      const { clientVersion } = msg.data || {}
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const op = state.nextHeight(clientId)
      if (op) {
        ws.send(JSON.stringify({
          type: 'operation_ack',
          data: {
            operationId: op.id,
            type: msg.type,
            serverVersion: state.version,
            success: true
          }
        }))
        broadcastState()
      }
      break
    }

    case 'prev_height': {
      const { clientVersion } = msg.data || {}
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const op = state.prevHeight(clientId)
      if (op) {
        ws.send(JSON.stringify({
          type: 'operation_ack',
          data: {
            operationId: op.id,
            type: msg.type,
            serverVersion: state.version,
            success: true
          }
        }))
        broadcastState()
      }
      break
    }

    case 'set_height': {
      const { height, clientVersion } = msg.data
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const op = state.setHeight(height, clientId)
      if (op) {
        ws.send(JSON.stringify({
          type: 'operation_ack',
          data: {
            operationId: op.id,
            type: msg.type,
            serverVersion: state.version,
            success: true
          }
        }))
        broadcastState()
      }
      break
    }

    case 'switch_to_final': {
      const { clientVersion } = msg.data || {}
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const op = state.switchToFinal(clientId)
      if (op) {
        ws.send(JSON.stringify({
          type: 'operation_ack',
          data: {
            operationId: op.id,
            type: msg.type,
            serverVersion: state.version,
            success: true
          }
        }))
        broadcastState()
      }
      break
    }

    case 'init_competition': {
      const { name, clientVersion } = msg.data || {}
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const op = state.initCompetition(name, clientId)
      ws.send(JSON.stringify({
        type: 'operation_ack',
        data: {
          operationId: op.id,
          type: msg.type,
          serverVersion: state.version,
          success: true
        }
      }))
      broadcastState()
      break
    }

    case 'reset_competition': {
      const { clientVersion } = msg.data || {}
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const op = state.resetCompetition(clientId)
      initializeDemoData()
      ws.send(JSON.stringify({
        type: 'operation_ack',
        data: {
          operationId: op.id,
          type: msg.type,
          serverVersion: state.version,
          success: true
        }
      }))
      broadcastState()
      break
    }

    case 'add_athlete': {
      const { id, name, team, seed, clientVersion } = msg.data
      if (clientVersion !== undefined && clientVersion !== state.version) {
        ws.send(JSON.stringify({
          type: 'version_conflict',
          data: {
            clientVersion,
            serverVersion: state.version,
            message: '版本不匹配，请先同步状态'
          }
        }))
        return
      }
      const result = state.addAthlete(id, name, team, seed, clientId)
      ws.send(JSON.stringify({
        type: 'operation_ack',
        data: {
          operationId: result.op.id,
          type: msg.type,
          serverVersion: state.version,
          success: true
        }
      }))
      broadcastState()
      break
    }
  }
}

let lastBroadcastVersion = -1

function broadcastState() {
  if (state.version === lastBroadcastVersion) return

  const stateData = JSON.stringify({
    type: 'state_sync',
    data: {
      state: state.getState(),
      isFullSync: true,
      serverVersion: state.version
    }
  })

  lastBroadcastVersion = state.version

  let successCount = 0
  for (const [ws, client] of clients.entries()) {
    if (ws.readyState === ws.OPEN) {
      ws.send(stateData, (err) => {
        if (err) {
          console.error('[WS] 广播失败:', err.message)
        } else {
          client.lastKnownVersion = state.version
        }
      })
      successCount++
    }
  }

  if (successCount > 0) {
    console.log(`[WS] 状态广播: v${state.version}, 发送给 ${successCount} 个客户端`)
  }
}

setInterval(() => {
  broadcastState()
}, STATE_SYNC_INTERVAL)

setInterval(() => {
  const now = Date.now()
  for (const [ws, client] of clients) {
    if (now - client.lastPing > HEARTBEAT_INTERVAL * 2) {
      console.log(`[WS] 心跳超时，断开客户端 #${client.id}`)
      ws.terminate()
      clients.delete(ws)
    } else {
      if (ws.readyState === ws.OPEN) {
        ws.ping()
      }
    }
  }
}, HEARTBEAT_INTERVAL)

wss.on('listening', () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║  🏆 全国田径锦标赛 - 跳高项目实时计分系统 🏆            ║
║                                                          ║
║  WebSocket 服务已启动                                     ║
║  端口: ${PORT}                                               ║
║  支持并发: 1000+ 客户端                                    ║
║  版本控制: v2.0 (带版本冲突检测)                          ║
║                                                          ║
║  裁判端: http://localhost:3000/#/judge                   ║
║  主屏幕: http://localhost:3000/#/display                 ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `)
})

wss.on('error', (err) => {
  console.error('[WS] 服务器错误:', err)
})
