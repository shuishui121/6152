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

  bumpVersion() {
    this.version++
    this.lastUpdate = Date.now()
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

  initCompetition(name) {
    if (name) this.competitionName = name
    this.roundType = RoundType.QUALIFICATION
    this.currentHeight = QUALIFICATION_HEIGHTS[0]
    this.currentAthleteIndex = 0
    this.isRunning = true
    this.bumpVersion()
  }

  addAthlete(id, name, team, seed) {
    const athlete = createAthlete(id, name, team, seed)
    this.athletes.push(athlete)
    this.bumpVersion()
    return athlete
  }

  addAthletes(athleteList) {
    athleteList.forEach((a, i) => {
      this.addAthlete(a.id || `athlete-${Date.now()}-${i}`, a.name, a.team, a.seed || i + 1)
    })
  }

  recordResult(athleteId, height, status) {
    const athlete = this.athletes.find(a => a.id === athleteId)
    if (!athlete) throw new Error('运动员不存在')
    recordAttempt(athlete, height, status)
    this.bumpVersion()
    return athlete
  }

  nextAthlete() {
    const active = this.activeAthletes
    if (active.length === 0) return

    this.currentAthleteIndex = (this.currentAthleteIndex + 1) % active.length

    let count = 0
    while (count < active.length) {
      const athlete = active[this.currentAthleteIndex]
      const status = getCurrentStatus(athlete, this.currentHeight)
      if (!status.completed) break
      this.currentAthleteIndex = (this.currentAthleteIndex + 1) % active.length
      count++
    }
    this.bumpVersion()
  }

  setCurrentAthlete(athleteId) {
    const index = this.activeAthletes.findIndex(a => a.id === athleteId)
    if (index !== -1) {
      this.currentAthleteIndex = index
      this.bumpVersion()
    }
  }

  nextHeight() {
    const index = this.currentHeightIndex
    if (index === -1 || index >= this.heights.length - 1) return
    this.currentHeight = this.heights[index + 1]
    this.currentAthleteIndex = 0
    this.bumpVersion()
  }

  prevHeight() {
    const index = this.currentHeightIndex
    if (index <= 0) return
    this.currentHeight = this.heights[index - 1]
    this.currentAthleteIndex = 0
    this.bumpVersion()
  }

  setHeight(height) {
    if (this.heights.includes(height)) {
      this.currentHeight = height
      this.currentAthleteIndex = 0
      this.bumpVersion()
    }
  }

  switchToFinal() {
    const qualified = getQualifiedAthletes(this.athletes, QUALIFICATION_HEIGHTS)
    this.athletes = qualified
    this.roundType = RoundType.FINAL
    this.currentHeight = FINAL_HEIGHTS[0]
    this.currentAthleteIndex = 0
    this.bumpVersion()
  }

  resetCompetition() {
    this.roundType = RoundType.QUALIFICATION
    this.currentHeight = QUALIFICATION_HEIGHTS[0]
    this.athletes = []
    this.currentAthleteIndex = 0
    this.isRunning = false
    this.bumpVersion()
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
  state.addAthletes(demoAthletes)
  state.initCompetition()
}

initializeDemoData()

const wss = new WebSocketServer({
  port: PORT,
  maxPayload: 1024 * 1024
})

const clients = new Map()
let clientIdCounter = 0

wss.on('connection', (ws, req) => {
  const clientId = ++clientIdCounter
  clients.set(ws, {
    id: clientId,
    isJudge: false,
    lastPing: Date.now()
  })

  console.log(`[WS] 客户端连接: #${clientId}, 当前连接数: ${clients.size}`)

  ws.send(JSON.stringify({
    type: 'state_sync',
    data: state.getState(),
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
        data: state.getState()
      }))
      break

    case 'record_result':
      if (!client.isJudge) {
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: '无权限操作，请先注册为裁判' }
        }))
        return
      }
      try {
        const { athleteId, height, status } = msg.data
        state.recordResult(athleteId, height, status)
        broadcastState()
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: err.message }
        }))
      }
      break

    case 'next_athlete':
      if (!client.isJudge) return
      state.nextAthlete()
      broadcastState()
      break

    case 'set_current_athlete':
      if (!client.isJudge) return
      state.setCurrentAthlete(msg.data.athleteId)
      broadcastState()
      break

    case 'next_height':
      if (!client.isJudge) return
      state.nextHeight()
      broadcastState()
      break

    case 'prev_height':
      if (!client.isJudge) return
      state.prevHeight()
      broadcastState()
      break

    case 'set_height':
      if (!client.isJudge) return
      state.setHeight(msg.data.height)
      broadcastState()
      break

    case 'switch_to_final':
      if (!client.isJudge) return
      state.switchToFinal()
      broadcastState()
      break

    case 'init_competition':
      if (!client.isJudge) return
      state.initCompetition(msg.data?.name)
      broadcastState()
      break

    case 'reset_competition':
      if (!client.isJudge) return
      state.resetCompetition()
      initializeDemoData()
      broadcastState()
      break

    case 'add_athlete':
      if (!client.isJudge) return
      state.addAthlete(
        msg.data.id,
        msg.data.name,
        msg.data.team,
        msg.data.seed
      )
      broadcastState()
      break

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', data: { timestamp: Date.now() } }))
      break

    default:
      console.warn(`[WS] 未知消息类型: ${msg.type}`)
  }
}

let lastBroadcastVersion = -1

function broadcastState() {
  if (state.version === lastBroadcastVersion) return

  const stateData = JSON.stringify({
    type: 'state_sync',
    data: state.getState()
  })

  lastBroadcastVersion = state.version

  let successCount = 0
  for (const ws of clients.keys()) {
    if (ws.readyState === ws.OPEN) {
      ws.send(stateData, (err) => {
        if (err) {
          console.error('[WS] 广播失败:', err.message)
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
