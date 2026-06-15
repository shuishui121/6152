<template>
  <div class="judge-view">
    <header class="header">
      <div class="header-left">
        <h1 class="title">🏆 {{ store.competitionName }}</h1>
        <div class="header-tags">
          <span class="round-badge" :class="store.roundType">
            {{ store.roundType === 'qualification' ? '资格赛' : '决赛' }}
          </span>
          <span class="height-badge">
            当前高度: <b>{{ store.currentHeight.toFixed(2) }}m</b>
          </span>
          <span class="version-badge" v-if="store.version > 0">
            v{{ store.version }}
          </span>
        </div>
      </div>
      <div class="header-right">
        <div class="quick-actions">
          <button class="q-btn" @click="handlePrevHeight" :disabled="!canPrevHeight || !ws.isConnected.value">← 上一高度</button>
          <button class="q-btn primary" @click="handleNextHeight" :disabled="!canNextHeight || !ws.isConnected.value">下一高度 →</button>
        </div>
        <div class="connection-status" :class="statusClass" @click="handleStatusClick">
          <span class="status-dot"></span>
          {{ statusText }}
          <span v-if="ws.pendingOperations.value.length > 0" class="pending-badge">
            {{ ws.pendingOperations.value.length }}
          </span>
        </div>
      </div>
    </header>

    <div v-if="showReconnectDialog" class="reconnect-overlay">
      <div class="reconnect-dialog">
        <div class="dialog-icon">⚠️</div>
        <h3 class="dialog-title">网络已恢复</h3>
        <p class="dialog-desc">
          检测到您在断网期间有 <b>{{ ws.pendingOperations.value.length }}</b> 条操作未提交。
          服务端状态已更新到 v{{ store.version }}。
        </p>
        <div class="dialog-actions">
          <button class="dialog-btn cancel" @click="handleDiscardOperations">
            丢弃操作
          </button>
          <button class="dialog-btn confirm" @click="handleResubmitOperations">
            重新提交
          </button>
        </div>
      </div>
    </div>

    <div class="main-content">
      <div class="top-panel">
        <div class="athlete-focus" :class="{ active: !!store.currentAthlete && !store.currentAthlete.isEliminated }">
          <div class="focus-label">正在试跳</div>
          <div v-if="store.currentAthlete" class="focus-body">
            <div class="focus-rank" :class="getRankClass(currentRank)">
              <span v-if="currentRank <= 3 && currentRank >= 1">{{ ['🥇','🥈','🥉'][currentRank-1] }}</span>
              <span v-else>#{{ currentRank }}</span>
            </div>
            <div class="focus-info">
              <div class="focus-name">{{ store.currentAthlete.name }}</div>
              <div class="focus-team">{{ store.currentAthlete.team }} · 种子 #{{ store.currentAthlete.seed }}</div>
            </div>
            <div class="focus-stats">
              <div class="stat">
                <span class="s-label">最佳</span>
                <span class="s-val">{{ store.currentAthlete.bestHeight > 0 ? store.currentAthlete.bestHeight.toFixed(2) : '—' }}m</span>
              </div>
              <div class="stat">
                <span class="s-label">失败</span>
                <span class="s-val" :class="{ danger: store.currentAthlete.totalFailures >= 2 }">{{ store.currentAthlete.totalFailures }}/3</span>
              </div>
            </div>
            <div class="focus-attempts">
              <div class="fa-title">本高度试跳</div>
              <div class="fa-dots">
                <div v-for="i in 3" :key="i" class="fa-dot" :class="getFaDotClass(i - 1)">
                  <span>{{ getFaDotIcon(i - 1) }}</span>
                </div>
              </div>
            </div>
            <div class="focus-actions">
              <button class="fa-btn success" @click="handleSuccess" :disabled="!canRecord" :title="快捷键提示">✓ 成功 (1)</button>
              <button class="fa-btn danger" @click="handleFailure" :disabled="!canRecord" :title="快捷键提示">✗ 失败 (2)</button>
              <button class="fa-btn warning" @click="handlePass" :disabled="!canPass" :title="快捷键提示">– 免跳 (3)</button>
              <button class="fa-btn next" @click="handleNextAthlete" :title="快捷键提示">下一位 (Enter)</button>
            </div>
          </div>
          <div v-else class="focus-empty">
            <span v-if="store.athletes.length === 0">请先添加运动员</span>
            <span v-else-if="store.activeAthletes.length === 0">所有运动员已淘汰</span>
            <span v-else>请在右侧选择运动员</span>
          </div>
        </div>

        <div class="height-selector">
          <div class="hs-label">高度选择</div>
          <div class="hs-grid">
            <span
              v-for="h in store.heights"
              :key="h"
              class="hs-item"
              :class="{ active: h === store.currentHeight, done: h < store.currentHeight }"
              @click="handleSetHeight(h)"
            >
              {{ h.toFixed(2) }}
            </span>
          </div>
        </div>

        <div class="side-controls">
          <div class="ctrl-row">
            <button
              v-if="store.roundType === 'qualification'"
              class="ctrl-btn accent"
              @click="handleSwitchToFinal"
            >
              🏅 进入决赛
            </button>
            <button class="ctrl-btn ghost" @click="handleReset">🔄 重置比赛</button>
          </div>
          <div class="info-row">
            <div class="info-item">
              <span class="i-label">剩余选手</span>
              <span class="i-val blue">{{ store.activeAthletes.length }}</span>
            </div>
            <div class="info-item">
              <span class="i-label">总计</span>
              <span class="i-val">{{ store.athletes.length }}</span>
            </div>
            <div class="info-item">
              <span class="i-label">达标线</span>
              <span class="i-val green">{{ QUALIFICATION_STANDARD.toFixed(2) }}m</span>
            </div>
          </div>
        </div>
      </div>

      <div class="bottom-panel">
        <div class="athletes-table">
          <div class="table-header">
            <h3>📋 运动员成绩录入手册 <span class="hint">（点击姓名切换当前运动员 · 点击右侧按钮直接录入）</span></h3>
          </div>
          <div class="table-scroll">
            <table class="at-table">
              <thead>
                <tr>
                  <th class="c-rank">排名</th>
                  <th class="c-name">运动员</th>
                  <th class="c-team">单位</th>
                  <th class="c-seed">种子</th>
                  <th
                    v-for="h in tableHeights"
                    :key="h"
                    class="c-height"
                    :class="{ cur: h === store.currentHeight }"
                  >
                    {{ h.toFixed(2) }}m
                  </th>
                  <th class="c-best">最佳</th>
                  <th class="c-fail">失败</th>
                  <th class="c-actions" v-if="!store.currentAthlete?.isEliminated">快速录入</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="athlete in store.rankings"
                  :key="athlete.id"
                  :class="{
                    cur: store.currentAthlete?.id === athlete.id,
                    out: athlete.isEliminated,
                    qual: athlete.bestHeight >= QUALIFICATION_STANDARD && store.roundType === 'qualification'
                  }"
                  @click="handleSelectAthlete(athlete)"
                >
                  <td class="c-rank">
                    <span class="rank-cell" :class="getRankClass(athlete.rank)">
                      <span v-if="athlete.rank <= 3 && athlete.rank >= 1">{{ ['🥇','🥈','🥉'][athlete.rank-1] }}</span>
                      <span v-else>{{ athlete.rank }}</span>
                      <span v-if="athlete.tied" class="t">T</span>
                    </span>
                  </td>
                  <td class="c-name">
                    <span class="name">{{ athlete.name }}</span>
                    <span v-if="store.currentAthlete?.id === athlete.id" class="cur-tag">试跳中</span>
                  </td>
                  <td class="c-team">{{ athlete.team }}</td>
                  <td class="c-seed">#{{ athlete.seed }}</td>
                  <td
                    v-for="h in tableHeights"
                    :key="h"
                    class="c-height"
                    :class="{ cur: h === store.currentHeight }"
                    @click.stop
                  >
                    <span class="result-badge" :class="getResultBadgeClass(athlete, h)">
                      {{ getResultBadgeText(athlete, h) }}
                    </span>
                  </td>
                  <td class="c-best">
                    <span class="best-cell" :class="{ has: athlete.bestHeight > 0 }">
                      {{ athlete.bestHeight > 0 ? athlete.bestHeight.toFixed(2) : '—' }}
                    </span>
                  </td>
                  <td class="c-fail">
                    <span class="fail-cell" :class="{ warn: athlete.totalFailures >= 2, over: athlete.isEliminated }">
                      {{ athlete.totalFailures }}/3
                    </span>
                  </td>
                  <td class="c-actions" v-if="!store.currentAthlete?.isEliminated" @click.stop>
                    <div class="row-actions" v-if="canRecordFor(athlete)">
                      <button class="ra-btn success" @click="handleQuickSuccess(athlete)" title="成功">✓</button>
                      <button class="ra-btn danger" @click="handleQuickFailure(athlete)" title="失败">✗</button>
                      <button class="ra-btn warning" @click="handleQuickPass(athlete)" :disabled="!canPassFor(athlete)" title="免跳">–</button>
                      <button class="ra-btn set" @click="handleSetAsCurrent(athlete)" title="设为当前">→</button>
                    </div>
                    <span v-else-if="athlete.isEliminated" class="out-label">已淘汰</span>
                    <span v-else class="done-label">已完成</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useCompetitionStore } from '../stores/competition'
import { useWebSocket } from '../composables/useWebSocket'
import {
  AttemptStatus,
  getCurrentStatus,
  ATTEMPTS_PER_HEIGHT,
  QUALIFICATION_STANDARD
} from '../utils/competitionRules'

const store = useCompetitionStore()
const ws = useWebSocket(true)
const selectedAthleteId = ref(null)
const showReconnectDialog = ref(false)
const wasDisconnected = ref(false)

const statusClass = computed(() => store.connectionStatus)
const statusText = computed(() => {
  const map = {
    connected: '已连接',
    connecting: '连接中...',
    disconnected: '已断开',
    error: '连接错误',
    failed: '连接失败'
  }
  return map[store.connectionStatus] || store.connectionStatus
})

watch(() => store.connectionStatus, (newStatus, oldStatus) => {
  if (oldStatus === 'disconnected' && newStatus === 'connected' && wasDisconnected.value) {
    if (ws.pendingOperations.value.length > 0) {
      showReconnectDialog.value = true
    }
    wasDisconnected.value = false
  }
  if (newStatus === 'disconnected') {
    wasDisconnected.value = true
  }
})

function handleStatusClick() {
  if (store.connectionStatus === 'disconnected' || store.connectionStatus === 'failed') {
    ws.connect()
  }
}

function handleDiscardOperations() {
  ws.clearPendingOperations()
  showReconnectDialog.value = false
}

function handleResubmitOperations() {
  ws.submitPendingOperations()
  showReconnectDialog.value = false
}

const canPrevHeight = computed(() => store.currentHeightIndex > 0)
const canNextHeight = computed(() => store.currentHeightIndex < store.heights.length - 1)

const currentStatus = computed(() => {
  if (!store.currentAthlete) return null
  return getCurrentStatus(store.currentAthlete, store.currentHeight)
})

const currentRank = computed(() => {
  if (!store.currentAthlete) return 0
  const ranking = store.rankings.find(r => r.id === store.currentAthlete.id)
  return ranking ? ranking.rank : 0
})

const canRecord = computed(() => {
  if (!store.currentAthlete || store.currentAthlete.isEliminated) return false
  if (!currentStatus.value) return false
  return !currentStatus.value.completed && currentStatus.value.attempts.length < ATTEMPTS_PER_HEIGHT
})

const canPass = computed(() => {
  if (!store.currentAthlete || store.currentAthlete.isEliminated) return false
  if (!currentStatus.value) return false
  return !currentStatus.value.completed && currentStatus.value.attempts.length === 0
})

const tableHeights = computed(() => {
  const heights = store.heights
  const cur = store.currentHeightIndex
  const start = Math.max(0, cur - 2)
  const end = Math.min(heights.length, cur + 5)
  return heights.slice(start, end)
})

const 快捷键提示 = '快捷键'

function getRankClass(rank) {
  if (rank === 1) return 'r1'
  if (rank === 2) return 'r2'
  if (rank === 3) return 'r3'
  return 'rn'
}

function getFaDotClass(i) {
  if (!currentStatus.value) return 'pending'
  if (currentStatus.value.passed) return 'pass'
  const a = currentStatus.value.attempts[i]
  return a || 'pending'
}

function getFaDotIcon(i) {
  if (!currentStatus.value) return ''
  if (currentStatus.value.passed) return '–'
  const a = currentStatus.value.attempts[i]
  if (!a) return ''
  if (a === AttemptStatus.SUCCESS) return '✓'
  if (a === AttemptStatus.FAILURE) return '✗'
  return ''
}

function getResultBadgeClass(athlete, height) {
  const s = getCurrentStatus(athlete, height)
  if (!s || (s.attempts.length === 0 && !s.passed)) {
    if (height > store.currentHeight) return 'future'
    if (height === store.currentHeight) return 'now'
    return 'none'
  }
  if (s.passed) return 'pass'
  if (s.success) return 'ok'
  return 'bad'
}

function getResultBadgeText(athlete, height) {
  const s = getCurrentStatus(athlete, height)
  if (!s || (s.attempts.length === 0 && !s.passed)) {
    if (height > store.currentHeight) return ''
    if (height === store.currentHeight) return '·'
    return '—'
  }
  if (s.passed) return '–'
  const fails = s.attempts.filter(x => x === AttemptStatus.FAILURE).length
  if (s.success) {
    return fails > 0 ? 'X'.repeat(fails) + 'O' : 'O'
  }
  return 'X'.repeat(fails)
}

function canRecordFor(athlete) {
  if (athlete.isEliminated) return false
  const s = getCurrentStatus(athlete, store.currentHeight)
  return s && !s.completed
}

function canPassFor(athlete) {
  if (athlete.isEliminated) return false
  const s = getCurrentStatus(athlete, store.currentHeight)
  return s && !s.completed && s.attempts.length === 0
}

function handleSuccess() {
  if (!store.currentAthlete) return
  ws.recordResult(store.currentAthlete.id, store.currentHeight, AttemptStatus.SUCCESS)
}

function handleFailure() {
  if (!store.currentAthlete) return
  ws.recordResult(store.currentAthlete.id, store.currentHeight, AttemptStatus.FAILURE)
}

function handlePass() {
  if (!store.currentAthlete) return
  ws.recordResult(store.currentAthlete.id, store.currentHeight, AttemptStatus.PASS)
}

function handleQuickSuccess(athlete) {
  ws.recordResult(athlete.id, store.currentHeight, AttemptStatus.SUCCESS)
}

function handleQuickFailure(athlete) {
  ws.recordResult(athlete.id, store.currentHeight, AttemptStatus.FAILURE)
}

function handleQuickPass(athlete) {
  ws.recordResult(athlete.id, store.currentHeight, AttemptStatus.PASS)
}

function handleSetAsCurrent(athlete) {
  ws.setCurrentAthlete(athlete.id)
}

function handleNextAthlete() {
  ws.nextAthlete()
}

function handlePrevHeight() {
  ws.prevHeight()
}

function handleNextHeight() {
  ws.nextHeight()
}

function handleSetHeight(h) {
  ws.setHeight(h)
}

function handleSelectAthlete(athlete) {
  selectedAthleteId.value = athlete.id
  ws.setCurrentAthlete(athlete.id)
}

function handleSwitchToFinal() {
  if (confirm('确定要进入决赛轮次吗？资格赛成绩将被重置。')) {
    ws.switchToFinal()
  }
}

function handleReset() {
  if (confirm('确定要重置比赛吗？所有数据将被清除。')) {
    ws.resetCompetition()
  }
}

function onKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === '1' || e.key === 'Enter') {
    if (e.key === '1' && canRecord.value) {
      e.preventDefault()
      handleSuccess()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleNextAthlete()
    }
  } else if (e.key === '2' && canRecord.value) {
    e.preventDefault()
    handleFailure()
  } else if (e.key === '3' && canPass.value) {
    e.preventDefault()
    handlePass()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.judge-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0a0e1a 0%, #1a1f3a 100%);
  overflow: hidden;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.35);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 18px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(90deg, var(--primary), var(--secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
}

.header-tags {
  display: flex;
  gap: 10px;
}

.round-badge, .height-badge {
  padding: 5px 14px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 600;
}

.round-badge.qualification {
  background: rgba(59, 130, 246, 0.18);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.round-badge.final {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.height-badge {
  background: rgba(0, 212, 255, 0.12);
  color: var(--text-primary);
  border: 1px solid rgba(0, 212, 255, 0.25);
}

.height-badge b {
  color: var(--primary);
  margin-left: 4px;
}

.version-badge {
  padding: 5px 12px;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
  border: 1px solid rgba(148, 163, 184, 0.2);
  font-family: monospace;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.quick-actions {
  display: flex;
  gap: 8px;
}

.q-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-primary);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.q-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.18);
}

.q-btn.primary {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  border: none;
  color: white;
}

.q-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.08);
  cursor: pointer;
  transition: all 0.15s;
}

.connection-status:hover {
  background: rgba(148, 163, 184, 0.15);
}

.pending-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--warning);
  color: white;
  font-size: 10px;
  font-weight: 700;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-secondary);
}

.connection-status.connected .status-dot {
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
}

.connection-status.connecting .status-dot {
  background: var(--warning);
  animation: blink 1.2s infinite;
}

.connection-status.error .status-dot,
.connection-status.failed .status-dot {
  background: var(--danger);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 16px;
  min-height: 0;
}

.top-panel {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.athlete-focus {
  flex: 1.4;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 16px;
  backdrop-filter: blur(8px);
  position: relative;
  overflow: hidden;
}

.athlete-focus::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--primary), transparent);
  opacity: 0;
  transition: opacity 0.3s;
}

.athlete-focus.active::before {
  opacity: 1;
}

.focus-label {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--primary);
  text-transform: uppercase;
  margin-bottom: 8px;
  font-weight: 600;
}

.focus-body {
  display: grid;
  grid-template-columns: auto 1fr auto auto 1fr;
  align-items: center;
  gap: 14px;
}

.focus-rank {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 800;
  flex-shrink: 0;
}

.focus-rank.r1 {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: white;
  box-shadow: 0 2px 10px rgba(251, 191, 36, 0.3);
}
.focus-rank.r2 {
  background: linear-gradient(135deg, #94a3b8, #64748b);
  color: white;
}
.focus-rank.r3 {
  background: linear-gradient(135deg, #d97706, #b45309);
  color: white;
}
.focus-rank.rn {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-secondary);
}

.focus-info {
  min-width: 0;
}

.focus-name {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 2px;
}

.focus-team {
  font-size: 12px;
  color: var(--text-secondary);
}

.focus-stats {
  display: flex;
  gap: 16px;
  margin-right: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.s-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.s-val {
  font-size: 16px;
  font-weight: 700;
  color: var(--success);
}

.s-val.danger {
  color: var(--danger);
}

.focus-attempts {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-right: 12px;
}

.fa-title {
  font-size: 10px;
  color: var(--text-secondary);
}

.fa-dots {
  display: flex;
  gap: 6px;
}

.fa-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(148, 163, 184, 0.2);
  background: rgba(148, 163, 184, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: transparent;
  transition: all 0.2s;
}

.fa-dot.success {
  background: linear-gradient(135deg, var(--success), #059669);
  border-color: var(--success);
  color: white;
}

.fa-dot.failure {
  background: linear-gradient(135deg, var(--danger), #dc2626);
  border-color: var(--danger);
  color: white;
}

.fa-dot.pass {
  background: linear-gradient(135deg, var(--warning), #d97706);
  border-color: var(--warning);
  color: white;
}

.focus-actions {
  display: flex;
  gap: 6px;
}

.fa-btn {
  padding: 10px 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  color: white;
  white-space: nowrap;
}

.fa-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.fa-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.fa-btn.success {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 2px 10px rgba(16, 185, 129, 0.25);
}

.fa-btn.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 2px 10px rgba(239, 68, 68, 0.25);
}

.fa-btn.warning {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.25);
}

.fa-btn.next {
  background: rgba(0, 212, 255, 0.12);
  color: var(--primary);
  border: 1px solid rgba(0, 212, 255, 0.3);
}

.focus-empty {
  padding: 16px 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.height-selector {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 14px;
}

.hs-label {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--text-secondary);
  text-transform: uppercase;
  margin-bottom: 10px;
  font-weight: 600;
}

.hs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 6px;
}

.hs-item {
  padding: 7px 4px;
  text-align: center;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  background: rgba(148, 163, 184, 0.06);
  color: var(--text-secondary);
  border: 1px solid transparent;
}

.hs-item:hover {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-primary);
}

.hs-item.active {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: white;
  border-color: var(--primary);
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.3);
}

.hs-item.done {
  opacity: 0.5;
}

.side-controls {
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ctrl-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ctrl-btn {
  padding: 9px 12px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  color: white;
}

.ctrl-btn.accent {
  background: linear-gradient(135deg, var(--secondary), #6d28d9);
  box-shadow: 0 2px 10px rgba(124, 58, 237, 0.25);
}

.ctrl-btn.ghost {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.ctrl-btn:hover {
  transform: translateY(-1px);
}

.info-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px;
}

.info-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.i-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.i-val {
  font-size: 15px;
  font-weight: 700;
}

.i-val.blue { color: var(--primary); }
.i-val.green { color: var(--success); }

.bottom-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.athletes-table {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.table-header {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.table-header h3 {
  font-size: 14px;
  font-weight: 700;
}

.table-header .hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
  margin-left: 10px;
}

.table-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.at-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}

.at-table thead th {
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.97);
  backdrop-filter: blur(4px);
  padding: 8px 6px;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 11px;
  text-align: center;
  z-index: 10;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.at-table thead th.cur {
  color: var(--primary);
  background: rgba(0, 212, 255, 0.1);
}

.c-rank { width: 56px; }
.c-name { min-width: 120px; text-align: left !important; }
.c-team { min-width: 110px; text-align: left !important; }
.c-seed { width: 50px; }
.c-height { width: 64px; }
.c-best { width: 58px; }
.c-fail { width: 52px; }
.c-actions { width: 160px; }

.at-table tbody tr {
  transition: background 0.15s;
  cursor: pointer;
}

.at-table tbody tr:hover {
  background: rgba(148, 163, 184, 0.05);
}

.at-table tbody tr.cur {
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.1), transparent);
}

.at-table tbody tr.cur td:first-child {
  box-shadow: inset 2px 0 0 var(--primary);
}

.at-table tbody tr.out {
  opacity: 0.45;
}

.at-table tbody tr.qual .best-cell {
  color: var(--success);
}

.at-table tbody td {
  padding: 7px 6px;
  text-align: center;
  vertical-align: middle;
  border-bottom: 1px solid rgba(148, 163, 184, 0.05);
}

.at-table tbody td.c-name,
.at-table tbody td.c-team {
  text-align: left;
}

.rank-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 24px;
  border-radius: 6px;
  padding: 0 6px;
  font-weight: 700;
  position: relative;
  font-size: 11px;
}

.rank-cell.r1 { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
.rank-cell.r2 { background: rgba(148, 163, 184, 0.18); color: #cbd5e1; }
.rank-cell.r3 { background: rgba(217, 119, 6, 0.2); color: #fbbf24; }
.rank-cell.rn { background: rgba(148, 163, 184, 0.1); color: var(--text-secondary); }

.t {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 12px;
  height: 12px;
  background: var(--secondary);
  color: white;
  font-size: 7px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.c-name {
  position: relative;
}

.name {
  font-weight: 600;
  font-size: 13px;
}

.cur-tag {
  margin-left: 6px;
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary);
  border-radius: 4px;
  font-weight: 600;
}

.c-team {
  font-size: 12px;
  color: var(--text-secondary);
}

.c-seed {
  color: var(--text-secondary);
  font-weight: 500;
}

.result-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 22px;
  padding: 0 5px;
  border-radius: 5px;
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0;
}

.result-badge.ok { background: var(--success); color: white; }
.result-badge.bad { background: var(--danger); color: white; }
.result-badge.pass { background: var(--warning); color: white; }
.result-badge.now { background: rgba(0, 212, 255, 0.12); color: var(--primary); }
.result-badge.none { background: transparent; color: var(--text-secondary); opacity: 0.4; }
.result-badge.future { background: transparent; color: transparent; }

.at-table tbody td.c-height.cur {
  background: rgba(0, 212, 255, 0.05);
}

.best-cell {
  display: inline-block;
  font-weight: 800;
  font-size: 13px;
  color: var(--primary);
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 212, 255, 0.08);
}

.best-cell:not(.has) {
  color: var(--text-secondary);
  background: transparent;
  font-weight: 500;
  opacity: 0.5;
}

.fail-cell {
  display: inline-block;
  font-weight: 700;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-secondary);
}

.fail-cell.warn {
  background: rgba(245, 158, 11, 0.15);
  color: var(--warning);
}

.fail-cell.over {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.row-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}

.ra-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: white;
  transition: all 0.15s;
  flex-shrink: 0;
}

.ra-btn:hover:not(:disabled) {
  transform: scale(1.1);
}

.ra-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.ra-btn.success { background: var(--success); }
.ra-btn.danger { background: var(--danger); }
.ra-btn.warning { background: var(--warning); }

.ra-btn.set {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary);
  border: 1px solid rgba(0, 212, 255, 0.3);
}

.out-label, .done-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}

.out-label {
  color: var(--danger);
}

::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.25);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.45);
}

.reconnect-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.reconnect-dialog {
  background: linear-gradient(135deg, #1a1f3a 0%, #0a0e1a 100%);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 32px 40px;
  max-width: 420px;
  width: 90%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.dialog-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.dialog-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 24px;
}

.dialog-desc b {
  color: var(--warning);
  font-weight: 700;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.dialog-btn {
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.dialog-btn.cancel {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-secondary);
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.dialog-btn.cancel:hover {
  background: rgba(148, 163, 184, 0.25);
}

.dialog-btn.confirm {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: white;
}

.dialog-btn.confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(0, 212, 255, 0.3);
}
</style>
