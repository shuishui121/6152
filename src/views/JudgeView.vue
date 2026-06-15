<template>
  <div class="judge-view">
    <header class="header">
      <div class="header-left">
        <h1 class="title">🏆 {{ store.competitionName }}</h1>
        <div class="round-badge" :class="store.roundType">
          {{ store.roundType === 'qualification' ? '资格赛' : '决赛' }}
        </div>
      </div>
      <div class="header-right">
        <div class="connection-status" :class="statusClass">
          <span class="status-dot"></span>
          {{ statusText }}
        </div>
      </div>
    </header>

    <div class="main-content">
      <div class="left-panel">
        <div class="current-height-card">
          <div class="height-label">当前高度</div>
          <div class="height-value">{{ store.currentHeight.toFixed(2) }} m</div>
          <div class="height-controls">
            <button class="height-btn" @click="handlePrevHeight" :disabled="!canPrevHeight">
              ← 上一高度
            </button>
            <button class="height-btn primary" @click="handleNextHeight" :disabled="!canNextHeight">
              下一高度 →
            </button>
          </div>
          <div class="height-list">
            <span
              v-for="h in store.heights"
              :key="h"
              class="height-item"
              :class="{ active: h === store.currentHeight, completed: isHeightCompleted(h) }"
              @click="handleSetHeight(h)"
            >
              {{ h.toFixed(2) }}
            </span>
          </div>
        </div>

        <div class="current-athlete-card">
          <div class="card-title">当前运动员</div>
          <div v-if="store.currentAthlete" class="athlete-info">
            <div class="athlete-name">{{ store.currentAthlete.name }}</div>
            <div class="athlete-team">{{ store.currentAthlete.team }}</div>
            <div class="athlete-stats">
              <span>种子 #{{ store.currentAthlete.seed }}</span>
              <span>最佳: {{ store.currentAthlete.bestHeight.toFixed(2) }}m</span>
            </div>
          </div>
          <div v-else class="no-athlete">暂无当前运动员</div>
        </div>

        <div class="control-panel">
          <div class="attempt-display">
            <div class="attempt-label">试跳次数</div>
            <div class="attempt-dots">
              <span
                v-for="i in 3"
                :key="i"
                class="attempt-dot"
                :class="getAttemptDotClass(i - 1)"
              ></span>
            </div>
          </div>

          <div class="action-buttons">
            <button class="action-btn success" @click="handleSuccess" :disabled="!canRecord">
              ✓ 成功
            </button>
            <button class="action-btn danger" @click="handleFailure" :disabled="!canRecord">
              ✗ 失败
            </button>
            <button class="action-btn warning" @click="handlePass" :disabled="!canPass">
              ⏭ 免跳
            </button>
          </div>

          <button class="next-btn" @click="handleNextAthlete">
            下一位运动员 →
          </button>
        </div>

        <div class="round-controls">
          <button
            class="round-btn"
            v-if="store.roundType === 'qualification'"
            @click="handleSwitchToFinal"
          >
            🏅 进入决赛
          </button>
          <button class="round-btn danger" @click="handleReset">
            🔄 重置比赛
          </button>
        </div>
      </div>

      <div class="right-panel">
        <div class="athletes-list">
          <div class="list-header">
            <h3>运动员列表</h3>
            <span class="count">{{ store.athletes.length }} 人</span>
          </div>
          <div class="list-content">
            <div
              v-for="(athlete, index) in sortedAthletes"
              :key="athlete.id"
              class="athlete-row"
              :class="{
                current: store.currentAthlete?.id === athlete.id,
                eliminated: athlete.isEliminated,
                selected: selectedAthleteId === athlete.id
              }"
              @click="handleSelectAthlete(athlete)"
            >
              <div class="athlete-rank">{{ index + 1 }}</div>
              <div class="athlete-main">
                <div class="athlete-name">{{ athlete.name }}</div>
                <div class="athlete-team">{{ athlete.team }}</div>
              </div>
              <div class="athlete-best">{{ athlete.bestHeight.toFixed(2) }}</div>
              <div class="athlete-attempts">
                <span
                  v-for="(attempt, i) in getAthleteAttempts(athlete)"
                  :key="i"
                  class="mini-attempt"
                  :class="attempt"
                ></span>
              </div>
              <div v-if="athlete.isEliminated" class="eliminate-tag">淘汰</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCompetitionStore } from '../stores/competition'
import { useWebSocket } from '../composables/useWebSocket'
import { AttemptStatus, getCurrentStatus, ATTEMPTS_PER_HEIGHT } from '../utils/competitionRules'

const store = useCompetitionStore()
const ws = useWebSocket(true)
const selectedAthleteId = ref(null)

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

const canPrevHeight = computed(() => {
  return store.currentHeightIndex > 0
})

const canNextHeight = computed(() => {
  return store.currentHeightIndex < store.heights.length - 1
})

const currentStatus = computed(() => {
  if (!store.currentAthlete) return null
  return getCurrentStatus(store.currentAthlete, store.currentHeight)
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

const sortedAthletes = computed(() => {
  return store.rankings
})

function getAttemptDotClass(index) {
  if (!currentStatus.value) return 'pending'
  const attempt = currentStatus.value.attempts[index]
  if (currentStatus.value.passed) return 'pass'
  if (!attempt) return 'pending'
  return attempt
}

function getAthleteAttempts(athlete) {
  const status = getCurrentStatus(athlete, store.currentHeight)
  if (!status) return []
  const attempts = [...status.attempts]
  while (attempts.length < 3) {
    attempts.push('pending')
  }
  if (status.passed) {
    return ['pass', 'pass', 'pass']
  }
  return attempts
}

function isHeightCompleted(height) {
  if (height >= store.currentHeight) return false
  return store.activeAthletes.length > 0
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

function handleNextAthlete() {
  ws.nextAthlete()
}

function handlePrevHeight() {
  ws.prevHeight()
}

function handleNextHeight() {
  ws.nextHeight()
}

function handleSetHeight(height) {
  ws.setHeight(height)
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
</script>

<style scoped>
.judge-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0a0e1a 0%, #1a1f3a 100%);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 30px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.title {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(90deg, var(--primary), var(--secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.round-badge {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
}

.round-badge.qualification {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.round-badge.final {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(148, 163, 184, 0.1);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-secondary);
}

.connection-status.connected .status-dot {
  background: var(--success);
  box-shadow: 0 0 10px var(--success);
}

.connection-status.connecting .status-dot {
  background: var(--warning);
  animation: pulse 1.5s infinite;
}

.connection-status.error .status-dot,
.connection-status.failed .status-dot {
  background: var(--danger);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.main-content {
  flex: 1;
  display: flex;
  gap: 20px;
  padding: 20px;
  overflow: hidden;
}

.left-panel {
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.current-height-card,
.current-athlete-card,
.control-panel,
.round-controls {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid var(--border-color);
  backdrop-filter: blur(10px);
}

.height-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.height-value {
  font-size: 48px;
  font-weight: 800;
  color: var(--primary);
  text-align: center;
  margin-bottom: 16px;
  text-shadow: 0 0 30px rgba(0, 212, 255, 0.3);
}

.height-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.height-btn {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid var(--border-color);
  background: rgba(148, 163, 184, 0.1);
  color: var(--text-primary);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.height-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.2);
}

.height-btn.primary {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  border: none;
  color: white;
}

.height-btn.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3);
}

.height-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.height-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.height-item {
  padding: 8px 12px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.height-item:hover {
  background: rgba(148, 163, 184, 0.2);
}

.height-item.active {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: white;
  border-color: var(--primary);
}

.height-item.completed {
  opacity: 0.6;
}

.card-title {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.athlete-info {
  text-align: center;
}

.athlete-name {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.athlete-team {
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.athlete-stats {
  display: flex;
  justify-content: center;
  gap: 20px;
  font-size: 14px;
  color: var(--text-secondary);
}

.no-athlete {
  text-align: center;
  color: var(--text-secondary);
  padding: 20px 0;
}

.attempt-display {
  text-align: center;
  margin-bottom: 20px;
}

.attempt-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.attempt-dots {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.attempt-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.2);
  border: 2px solid var(--border-color);
  position: relative;
}

.attempt-dot.success {
  background: var(--success);
  border-color: var(--success);
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.4);
}

.attempt-dot.success::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 16px;
  font-weight: bold;
}

.attempt-dot.failure {
  background: var(--danger);
  border-color: var(--danger);
  box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
}

.attempt-dot.failure::after {
  content: '✗';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 16px;
  font-weight: bold;
}

.attempt-dot.pass {
  background: var(--warning);
  border-color: var(--warning);
}

.attempt-dot.pass::after {
  content: '–';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 20px;
  font-weight: bold;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.action-btn {
  flex: 1;
  padding: 16px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  color: white;
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-2px);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn.success {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
}

.action-btn.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
}

.action-btn.warning {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
}

.next-btn {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--primary);
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary);
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.next-btn:hover {
  background: rgba(0, 212, 255, 0.2);
}

.round-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.round-btn {
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: linear-gradient(135deg, var(--secondary), #6d28d9);
  color: white;
}

.round-btn:hover {
  transform: translateY(-1px);
}

.round-btn.danger {
  background: rgba(239, 68, 68, 0.2);
  color: var(--danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.round-btn.danger:hover {
  background: rgba(239, 68, 68, 0.3);
}

.athletes-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.list-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.count {
  font-size: 14px;
  color: var(--text-secondary);
  background: rgba(148, 163, 184, 0.2);
  padding: 4px 12px;
  border-radius: 12px;
}

.list-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.athlete-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.athlete-row:hover {
  background: rgba(148, 163, 184, 0.1);
}

.athlete-row.current {
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.2), transparent);
  border-left: 3px solid var(--primary);
}

.athlete-row.eliminated {
  opacity: 0.5;
}

.athlete-row.selected {
  background: rgba(124, 58, 237, 0.2);
}

.athlete-rank {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.athlete-main {
  flex: 1;
  min-width: 0;
}

.athlete-row .athlete-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 2px;
}

.athlete-row .athlete-team {
  font-size: 13px;
  color: var(--text-secondary);
}

.athlete-best {
  font-size: 16px;
  font-weight: 700;
  color: var(--primary);
  min-width: 60px;
  text-align: right;
}

.athlete-attempts {
  display: flex;
  gap: 4px;
}

.mini-attempt {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.2);
}

.mini-attempt.success {
  background: var(--success);
}

.mini-attempt.failure {
  background: var(--danger);
}

.mini-attempt.pass {
  background: var(--warning);
}

.eliminate-tag {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  padding: 2px 6px;
  background: var(--danger);
  color: white;
  border-radius: 4px;
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}
</style>
