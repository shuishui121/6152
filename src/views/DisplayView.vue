<template>
  <div class="display-view">
    <div class="bg-effects">
      <div class="glow glow-1"></div>
      <div class="glow glow-2"></div>
    </div>

    <header class="main-header">
      <div class="header-left">
        <h1 class="event-title">
          <span class="trophy">🏆</span>
          {{ store.competitionName }}
        </h1>
        <div class="header-tags">
          <span class="round-tag" :class="store.roundType">
            {{ store.roundType === 'qualification' ? '资格赛' : '决赛' }}
          </span>
          <span class="live-tag">
            <span class="live-dot"></span>
            LIVE
          </span>
        </div>
      </div>
      <div class="header-right">
        <div class="current-time">{{ currentTime }}</div>
        <div class="connection-indicator" :class="statusClass">
          <span class="dot"></span>
          实时同步
        </div>
      </div>
    </header>

    <div class="main-display">
      <div class="left-panel">
        <div class="height-display">
          <div class="height-label">当前高度</div>
          <div class="height-value" :key="store.currentHeight">
            <span class="height-number">{{ formatHeight(store.currentHeight) }}</span>
            <span class="height-unit">m</span>
          </div>
          <div class="height-track-wrap">
            <div class="height-track">
              <div
                v-for="(h, i) in displayHeights"
                :key="h"
                class="height-marker"
                :class="{
                  active: h === store.currentHeight,
                  passed: h < store.currentHeight
                }"
                :style="{ left: (i / (displayHeights.length - 1)) * 100 + '%' }"
              >
                <div class="marker-dot"></div>
                <span class="marker-label">{{ h.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="current-athlete-card">
          <div class="card-label">正在试跳</div>
          <div v-if="store.currentAthlete" class="athlete-content">
            <div class="athlete-rank-badge" :class="getRankBadgeClass(currentRank)">
              <span v-if="currentRank <= 3 && currentRank >= 1" class="medal">{{ ['🥇','🥈','🥉'][currentRank-1] }}</span>
              <span v-else>{{ currentRank }}</span>
            </div>
            <div class="athlete-info">
              <div class="athlete-name">{{ store.currentAthlete.name }}</div>
              <div class="athlete-team">{{ store.currentAthlete.team }} · 种子 #{{ store.currentAthlete.seed }}</div>
            </div>
            <div class="athlete-best">
              <div class="best-label">最佳</div>
              <div class="best-value">{{ store.currentAthlete.bestHeight > 0 ? store.currentAthlete.bestHeight.toFixed(2) : '—' }}m</div>
            </div>
          </div>
          <div v-else class="no-athlete">
            <div class="waiting-icon">⏳</div>
            <div class="waiting-text">等待比赛开始</div>
          </div>

          <div v-if="store.currentAthlete" class="attempts-row">
            <div class="attempts-title">本高度试跳</div>
            <div class="attempts-dots">
              <div
                v-for="i in 3"
                :key="i"
                class="attempt-dot"
                :class="getAttemptClass(i - 1)"
              >
                <span>{{ getAttemptIcon(i - 1) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="middle-panel">
        <div class="results-table-card">
          <div class="table-header">
            <span class="table-title">📊 成绩公告板</span>
            <div class="legend">
              <span class="legend-item"><span class="dot o">O</span>成功</span>
              <span class="legend-item"><span class="dot x">X</span>失败</span>
              <span class="legend-item"><span class="dot p">–</span>免跳</span>
            </div>
          </div>
          <div class="table-wrap">
            <table class="results-table">
              <thead>
                <tr>
                  <th class="col-rank">排名</th>
                  <th class="col-name">运动员</th>
                  <th
                    v-for="h in visibleHeights"
                    :key="h"
                    class="col-height"
                    :class="{ current: h === store.currentHeight }"
                  >
                    {{ h.toFixed(2) }}
                  </th>
                  <th class="col-best">最佳</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="athlete in tableData"
                  :key="athlete.id"
                  :class="{
                    current: store.currentAthlete?.id === athlete.id,
                    eliminated: athlete.isEliminated,
                    qualified: athlete.bestHeight >= QUALIFICATION_STANDARD && store.roundType === 'qualification'
                  }"
                >
                  <td class="col-rank">
                    <span class="rank-cell" :class="getRankBadgeClass(athlete.rank)">
                      <span v-if="athlete.rank <= 3 && athlete.rank >= 1" class="medal-sm">{{ ['🥇','🥈','🥉'][athlete.rank-1] }}</span>
                      <span v-else>{{ athlete.rank }}</span>
                      <span v-if="athlete.tied" class="tied">T</span>
                    </span>
                  </td>
                  <td class="col-name">
                    <div class="name-cell">
                      <span class="n">{{ athlete.name }}</span>
                      <span class="t">{{ athlete.team }}</span>
                    </div>
                  </td>
                  <td
                    v-for="h in visibleHeights"
                    :key="h"
                    class="col-height"
                    :class="{ current: h === store.currentHeight }"
                  >
                    <span
                      class="result-cell"
                      :class="getResultClass(athlete, h)"
                    >{{ getResultText(athlete, h) }}</span>
                  </td>
                  <td class="col-best">
                    <span class="best-cell" :class="{ has: athlete.bestHeight > 0 }">
                      {{ athlete.bestHeight > 0 ? athlete.bestHeight.toFixed(2) : '—' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="right-panel">
        <div class="top-rank-card">
          <div class="rank-card-title">
            <span>🏅 实时排名</span>
            <span class="count">{{ store.activeAthletes.length }}/{{ store.athletes.length }}</span>
          </div>
          <div class="rank-list">
            <div
              v-for="(athlete, index) in topRankList"
              :key="athlete.id"
              class="rank-item"
              :class="{
                podium: index < 3,
                current: store.currentAthlete?.id === athlete.id
              }"
            >
              <div class="rank-num" :class="'rn-' + (index + 1)">
                {{ index + 1 }}
              </div>
              <div class="rank-info">
                <span class="rn">{{ athlete.name }}</span>
                <span class="rt">{{ athlete.team }}</span>
              </div>
              <div class="rank-best">
                {{ athlete.bestHeight > 0 ? athlete.bestHeight.toFixed(2) : '—' }}
              </div>
            </div>
          </div>
        </div>

        <div class="stats-card">
          <div class="stat-row">
            <div class="stat-item">
              <span class="stat-label">达标线</span>
              <span class="stat-value">{{ QUALIFICATION_STANDARD.toFixed(2) }}m</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-label">晋级名额</span>
              <span class="stat-value">{{ QUALIFICATION_MAX_COUNT }}人</span>
            </div>
          </div>
          <div class="stat-row">
            <div class="stat-item">
              <span class="stat-label">剩余选手</span>
              <span class="stat-value blue">{{ store.activeAthletes.length }}人</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-label">每高度试跳</span>
              <span class="stat-value">{{ ATTEMPTS_PER_HEIGHT }}次</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCompetitionStore } from '../stores/competition'
import { useWebSocket } from '../composables/useWebSocket'
import {
  AttemptStatus,
  getCurrentStatus,
  QUALIFICATION_STANDARD,
  QUALIFICATION_MAX_COUNT,
  ATTEMPTS_PER_HEIGHT
} from '../utils/competitionRules'

const store = useCompetitionStore()
const ws = useWebSocket(false)

const currentTime = ref('')
let timeInterval = null

const statusClass = computed(() => store.connectionStatus)

const currentRank = computed(() => {
  if (!store.currentAthlete) return 0
  const ranking = store.rankings.find(r => r.id === store.currentAthlete.id)
  return ranking ? ranking.rank : 0
})

const topRankList = computed(() => store.rankings.slice(0, 8))

const tableData = computed(() => store.rankings.slice(0, 12))

const visibleHeights = computed(() => {
  const heights = store.heights
  const currentIdx = store.currentHeightIndex
  if (currentIdx < 0) return heights.slice(0, 7)
  const start = Math.max(0, currentIdx - 3)
  const end = Math.min(heights.length, currentIdx + 4)
  return heights.slice(start, end)
})

const displayHeights = computed(() => {
  const heights = store.heights
  if (heights.length <= 8) return heights
  const currentIdx = store.currentHeightIndex
  const start = Math.max(0, currentIdx - 3)
  const end = Math.min(heights.length, start + 8)
  return heights.slice(start, end)
})

function formatHeight(height) {
  return height.toFixed(2)
}

function getRankBadgeClass(rank) {
  if (rank === 1) return 'r1'
  if (rank === 2) return 'r2'
  if (rank === 3) return 'r3'
  return 'rn'
}

function getAttemptClass(index) {
  if (!store.currentAthlete) return 'pending'
  const status = getCurrentStatus(store.currentAthlete, store.currentHeight)
  if (status.passed) return 'pass'
  const attempt = status.attempts[index]
  if (!attempt) return 'pending'
  return attempt
}

function getAttemptIcon(index) {
  if (!store.currentAthlete) return ''
  const status = getCurrentStatus(store.currentAthlete, store.currentHeight)
  if (status.passed) return '–'
  const attempt = status.attempts[index]
  if (!attempt) return ''
  if (attempt === AttemptStatus.SUCCESS) return '✓'
  if (attempt === AttemptStatus.FAILURE) return '✗'
  return ''
}

function getResultClass(athlete, height) {
  const status = getCurrentStatus(athlete, height)
  if (!status || (status.attempts.length === 0 && !status.passed)) {
    if (height > store.currentHeight) return 'future'
    if (height === store.currentHeight) return 'ongoing'
    return 'empty'
  }
  if (status.passed) return 'pass'
  if (status.success) return 'success'
  return 'failure'
}

function getResultText(athlete, height) {
  const status = getCurrentStatus(athlete, height)
  if (!status || (status.attempts.length === 0 && !status.passed)) {
    if (height > store.currentHeight) return ''
    if (height === store.currentHeight) return '·'
    return '—'
  }
  if (status.passed) return '–'
  const failures = status.attempts.filter(a => a === AttemptStatus.FAILURE).length
  if (status.success) {
    return failures > 0 ? 'xo'.repeat(failures).slice(0, -1).toUpperCase() + 'O' : 'O'
  }
  return 'X'.repeat(failures)
}

function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

onMounted(() => {
  updateTime()
  timeInterval = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  if (timeInterval) clearInterval(timeInterval)
})
</script>

<style scoped>
.display-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #0a0e1a 0%, #0f172a 50%, #0a0e1a 100%);
  position: relative;
  overflow: hidden;
}

.bg-effects {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.25;
}

.glow-1 {
  width: 400px;
  height: 400px;
  background: var(--primary);
  top: -150px;
  right: -50px;
  animation: float 8s ease-in-out infinite;
}

.glow-2 {
  width: 350px;
  height: 350px;
  background: var(--secondary);
  bottom: -100px;
  left: -50px;
  animation: float 10s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(20px, -20px); }
}

.main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  position: relative;
  z-index: 10;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.event-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
  background: linear-gradient(135deg, #fff 0%, var(--primary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
}

.trophy {
  margin-right: 8px;
  -webkit-text-fill-color: initial;
}

.header-tags {
  display: flex;
  gap: 10px;
}

.round-tag {
  padding: 4px 14px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
}

.round-tag.qualification {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.round-tag.final {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.live-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  border-radius: 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  font-size: 12px;
  font-weight: 700;
  color: var(--danger);
  letter-spacing: 1px;
}

.live-dot {
  width: 8px;
  height: 8px;
  background: var(--danger);
  border-radius: 50%;
  animation: livePulse 1.5s infinite;
}

@keyframes livePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.current-time {
  font-size: 24px;
  font-weight: 300;
  letter-spacing: 3px;
  font-family: 'Courier New', monospace;
  color: var(--text-primary);
}

.connection-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.08);
}

.connection-indicator .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-secondary);
}

.connection-indicator.connected .dot {
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
}

.main-display {
  flex: 1;
  display: flex;
  gap: 14px;
  padding: 12px 18px;
  position: relative;
  z-index: 10;
  min-height: 0;
}

.left-panel {
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.height-display {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 16px;
  text-align: center;
  backdrop-filter: blur(8px);
}

.height-label {
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 3px;
  margin-bottom: 8px;
}

.height-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}

.height-number {
  font-size: 64px;
  font-weight: 900;
  background: linear-gradient(180deg, var(--primary) 0%, #0ea5e9 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 30px rgba(0, 212, 255, 0.4);
  line-height: 1;
}

.height-unit {
  font-size: 20px;
  color: var(--text-secondary);
  font-weight: 400;
}

.height-track-wrap {
  margin-top: 14px;
}

.height-track {
  position: relative;
  height: 42px;
  background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.08), transparent);
  border-radius: 20px;
}

.height-marker {
  position: absolute;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  top: 4px;
}

.marker-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.3);
  transition: all 0.3s;
}

.height-marker.passed .marker-dot {
  background: var(--success);
}

.height-marker.active .marker-dot {
  background: var(--primary);
  width: 14px;
  height: 14px;
  box-shadow: 0 0 12px var(--primary);
  animation: markerPulse 2s infinite;
}

@keyframes markerPulse {
  0%, 100% { box-shadow: 0 0 10px var(--primary); }
  50% { box-shadow: 0 0 20px var(--primary); }
}

.marker-label {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.height-marker.active .marker-label {
  color: var(--primary);
  font-weight: 700;
}

.current-athlete-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 16px;
  backdrop-filter: blur(8px);
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.current-athlete-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--primary), var(--secondary));
}

.card-label {
  font-size: 11px;
  color: var(--primary);
  letter-spacing: 2px;
  margin-bottom: 10px;
  text-transform: uppercase;
}

.athlete-content {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.athlete-rank-badge {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  flex-shrink: 0;
  font-size: 18px;
}

.athlete-rank-badge.r1 {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: white;
  box-shadow: 0 2px 10px rgba(251, 191, 36, 0.3);
}

.athlete-rank-badge.r2 {
  background: linear-gradient(135deg, #94a3b8, #64748b);
  color: white;
}

.athlete-rank-badge.r3 {
  background: linear-gradient(135deg, #d97706, #b45309);
  color: white;
}

.athlete-rank-badge.rn {
  background: rgba(148, 163, 184, 0.2);
  color: var(--text-primary);
}

.medal {
  font-size: 20px;
}

.athlete-info {
  flex: 1;
  min-width: 0;
}

.athlete-name {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 2px;
}

.athlete-team {
  font-size: 12px;
  color: var(--text-secondary);
}

.athlete-best {
  text-align: right;
  flex-shrink: 0;
}

.best-label {
  font-size: 10px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.best-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--success);
}

.no-athlete {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.waiting-icon {
  font-size: 36px;
  opacity: 0.5;
  animation: spin 3s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.waiting-text {
  font-size: 14px;
  color: var(--text-secondary);
  letter-spacing: 2px;
}

.attempts-row {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.attempts-title {
  font-size: 12px;
  color: var(--text-secondary);
}

.attempts-dots {
  display: flex;
  gap: 8px;
}

.attempt-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid rgba(148, 163, 184, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.08);
  font-size: 14px;
  font-weight: 700;
  color: transparent;
  transition: all 0.25s;
}

.attempt-dot.success {
  background: linear-gradient(135deg, var(--success), #059669);
  border-color: var(--success);
  color: white;
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.4);
}

.attempt-dot.failure {
  background: linear-gradient(135deg, var(--danger), #dc2626);
  border-color: var(--danger);
  color: white;
  box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
}

.attempt-dot.pass {
  background: linear-gradient(135deg, var(--warning), #d97706);
  border-color: var(--warning);
  color: white;
}

.middle-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.results-table-card {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  flex-shrink: 0;
}

.table-title {
  font-size: 14px;
  font-weight: 700;
}

.legend {
  display: flex;
  gap: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-item .dot {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}

.legend-item .dot.o {
  background: var(--success);
  color: white;
}

.legend-item .dot.x {
  background: var(--danger);
  color: white;
}

.legend-item .dot.p {
  background: var(--warning);
  color: white;
}

.table-wrap {
  flex: 1;
  overflow: auto;
  padding: 6px;
}

.results-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 2px;
  font-size: 12px;
}

.results-table thead th {
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(4px);
  padding: 6px 4px;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 11px;
  text-align: center;
  border-radius: 6px;
  z-index: 5;
}

.results-table thead th.col-height.current {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary);
  font-weight: 800;
  box-shadow: inset 0 -2px 0 var(--primary);
}

.col-rank { width: 54px; }
.col-name { min-width: 130px; text-align: left !important; }
.col-height { width: 50px; }
.col-best { width: 56px; }

.results-table tbody tr {
  transition: all 0.2s;
}

.results-table tbody tr:hover {
  background: rgba(148, 163, 184, 0.05);
}

.results-table tbody tr.current {
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.12), transparent);
  box-shadow: inset 2px 0 0 var(--primary);
}

.results-table tbody tr.current td:first-child {
  border-left: 2px solid var(--primary);
}

.results-table tbody tr.eliminated {
  opacity: 0.45;
}

.results-table tbody tr.qualified .best-cell {
  color: var(--success);
}

.results-table tbody td {
  padding: 6px 4px;
  text-align: center;
  vertical-align: middle;
  border-radius: 5px;
  background: rgba(148, 163, 184, 0.03);
}

.results-table tbody td.col-name {
  text-align: left;
  background: rgba(148, 163, 184, 0.05);
}

.results-table tbody td.col-height.current {
  background: rgba(0, 212, 255, 0.08);
}

.rank-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 26px;
  border-radius: 7px;
  font-weight: 700;
  font-size: 12px;
  position: relative;
  padding: 0 6px;
}

.rank-cell.r1 { background: linear-gradient(135deg, rgba(251,191,36,0.3), rgba(245,158,11,0.3)); color: #fbbf24; border: 1px solid rgba(251,191,36,0.4); }
.rank-cell.r2 { background: rgba(148,163,184,0.2); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.3); }
.rank-cell.r3 { background: rgba(217,119,6,0.2); color: #fbbf24; border: 1px solid rgba(217,119,6,0.3); }
.rank-cell.rn { background: rgba(148,163,184,0.1); color: var(--text-secondary); }

.medal-sm { font-size: 14px; }

.tied {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 14px;
  height: 14px;
  background: var(--secondary);
  color: white;
  font-size: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.name-cell {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.2;
}

.name-cell .n {
  font-weight: 600;
  font-size: 13px;
}

.name-cell .t {
  font-size: 10px;
  color: var(--text-secondary);
}

.result-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 4px;
  border-radius: 5px;
  font-weight: 700;
  font-size: 11px;
}

.result-cell.success { background: var(--success); color: white; }
.result-cell.failure { background: var(--danger); color: white; letter-spacing: 0; }
.result-cell.pass { background: var(--warning); color: white; }
.result-cell.empty { background: transparent; color: var(--text-secondary); opacity: 0.4; }
.result-cell.future { background: transparent; color: transparent; }
.result-cell.ongoing { background: rgba(0,212,255,0.1); color: var(--primary); }

.best-cell {
  display: inline-block;
  font-weight: 800;
  font-size: 13px;
  color: var(--primary);
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(0, 212, 255, 0.08);
}

.best-cell:not(.has) {
  color: var(--text-secondary);
  background: transparent;
  font-weight: 500;
  opacity: 0.5;
}

.right-panel {
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.top-rank-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 12px 14px;
  backdrop-filter: blur(8px);
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.rank-card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  flex-shrink: 0;
}

.rank-card-title .count {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  background: rgba(148, 163, 184, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.rank-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  transition: all 0.2s;
}

.rank-item:hover {
  background: rgba(148, 163, 184, 0.05);
}

.rank-item.current {
  background: rgba(0, 212, 255, 0.1);
  box-shadow: inset 2px 0 0 var(--primary);
}

.rank-item.podium {
  background: linear-gradient(90deg, rgba(124, 58, 237, 0.08), transparent);
}

.rank-num {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 11px;
  flex-shrink: 0;
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-secondary);
}

.rank-num.rn-1 { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; }
.rank-num.rn-2 { background: linear-gradient(135deg, #94a3b8, #64748b); color: white; }
.rank-num.rn-3 { background: linear-gradient(135deg, #d97706, #b45309); color: white; }

.rank-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.15;
}

.rank-info .rn {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rank-info .rt {
  font-size: 10px;
  color: var(--text-secondary);
}

.rank-best {
  font-size: 12px;
  font-weight: 800;
  color: var(--primary);
  flex-shrink: 0;
}

.stats-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 10px 12px;
  backdrop-filter: blur(8px);
  flex-shrink: 0;
}

.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
}

.stat-row:first-child {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
}

.stat-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 15px;
  font-weight: 700;
}

.stat-value.blue {
  color: var(--primary);
}

.stat-divider {
  width: 1px;
  height: 26px;
  background: rgba(148, 163, 184, 0.15);
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
  background: rgba(148, 163, 184, 0.4);
}
</style>
