<template>
  <div class="display-view">
    <div class="bg-effects">
      <div class="glow glow-1"></div>
      <div class="glow glow-2"></div>
    </div>

    <header class="main-header">
      <div class="event-info">
        <h1 class="event-title">
          <span class="trophy">🏆</span>
          {{ store.competitionName }}
        </h1>
        <div class="round-info">
          <span class="round-tag" :class="store.roundType">
            {{ store.roundType === 'qualification' ? '资格赛' : '决赛' }}
          </span>
          <span class="live-dot"></span>
          <span class="live-text">LIVE</span>
        </div>
      </div>
      <div class="time-display">
        <div class="current-time">{{ currentTime }}</div>
        <div class="connection-indicator" :class="statusClass">
          <span class="dot"></span>
          实时同步
        </div>
      </div>
    </header>

    <div class="main-display">
      <div class="left-section">
        <div class="height-display">
          <div class="height-label">当前高度</div>
          <div class="height-value" :key="store.currentHeight">
            <span class="height-number">{{ formatHeight(store.currentHeight) }}</span>
            <span class="height-unit">米</span>
          </div>
          <div class="height-progress">
            <div class="heights-track">
              <div
                v-for="(h, i) in store.heights"
                :key="h"
                class="height-marker"
                :class="{
                  active: h === store.currentHeight,
                  passed: h < store.currentHeight
                }"
                :style="{ left: (i / (store.heights.length - 1)) * 100 + '%' }"
              >
                <div class="marker-dot"></div>
                <span class="marker-label">{{ h.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="current-athlete-display" v-if="store.currentAthlete">
          <div class="athlete-card">
            <div class="athlete-position">
              <span class="position-number">{{ currentRank }}</span>
              <span class="position-suffix">{{ getRankSuffix(currentRank) }}</span>
            </div>
            <div class="athlete-details">
              <div class="athlete-name">{{ store.currentAthlete.name }}</div>
              <div class="athlete-team">{{ store.currentAthlete.team }}</div>
            </div>
            <div class="athlete-best">
              <div class="best-label">个人最佳</div>
              <div class="best-value">{{ store.currentAthlete.bestHeight.toFixed(2) }}m</div>
            </div>
          </div>

          <div class="attempts-display">
            <div class="attempts-label">本高度试跳</div>
            <div class="attempts-circles">
              <div
                v-for="i in 3"
                :key="i"
                class="attempt-circle"
                :class="getAttemptClass(i - 1)"
              >
                <span class="attempt-icon">{{ getAttemptIcon(i - 1) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="no-athlete">
          <div class="pulse-ring"></div>
          <div class="waiting-text">等待比赛开始...</div>
        </div>
      </div>

      <div class="right-section">
        <div class="rankings-panel">
          <div class="panel-header">
            <h2>实时排名</h2>
            <span class="athlete-count">{{ store.athletes.length }} 名运动员</span>
          </div>
          <div class="rankings-list">
            <div
              v-for="(athlete, index) in topRanked"
              :key="athlete.id"
              class="ranking-row"
              :class="{
                'top-3': index < 3,
                current: store.currentAthlete?.id === athlete.id,
                eliminated: athlete.isEliminated
              }"
            >
              <div class="rank-badge" :class="'rank-' + (index + 1)">
                <span v-if="index < 3" class="medal">{{ ['🥇', '🥈', '🥉'][index] }}</span>
                <span v-else class="rank-num">{{ athlete.rank }}</span>
                <span v-if="athlete.tied" class="tied-mark">T</span>
              </div>
              <div class="athlete-info-main">
                <div class="name-row">
                  <span class="name">{{ athlete.name }}</span>
                  <span class="seed">#{{ athlete.seed }}</span>
                </div>
                <div class="team-row">{{ athlete.team }}</div>
              </div>
              <div class="result-height">
                <span class="height-text">{{ athlete.bestHeight > 0 ? athlete.bestHeight.toFixed(2) : '—' }}</span>
                <span class="height-m">m</span>
              </div>
              <div class="attempts-summary">
                <div
                  v-for="h in recentHeights"
                  :key="h"
                  class="attempt-chip"
                  :class="getAttemptChipClass(athlete, h)"
                  :title="h.toFixed(2) + 'm'"
                >
                  {{ getAttemptChipText(athlete, h) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="bottom-bar">
      <div class="bar-item">
        <span class="bar-label">达标线</span>
        <span class="bar-value">{{ QUALIFICATION_STANDARD.toFixed(2) }}m</span>
      </div>
      <div class="bar-divider"></div>
      <div class="bar-item">
        <span class="bar-label">晋级人数</span>
        <span class="bar-value">{{ QUALIFICATION_MAX_COUNT }}人</span>
      </div>
      <div class="bar-divider"></div>
      <div class="bar-item">
        <span class="bar-label">剩余运动员</span>
        <span class="bar-value highlight">{{ store.activeAthletes.length }}人</span>
      </div>
      <div class="bar-divider"></div>
      <div class="bar-item">
        <span class="bar-label">每高度试跳</span>
        <span class="bar-value">{{ ATTEMPTS_PER_HEIGHT }}次</span>
      </div>
    </footer>
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

const topRanked = computed(() => {
  return store.rankings.slice(0, 12)
})

const recentHeights = computed(() => {
  const idx = store.currentHeightIndex
  const heights = store.heights
  const start = Math.max(0, idx - 2)
  const end = Math.min(heights.length, idx + 3)
  return heights.slice(start, end)
})

function formatHeight(height) {
  return height.toFixed(2)
}

function getRankSuffix(rank) {
  if (rank === 1) return 'st'
  if (rank === 2) return 'nd'
  if (rank === 3) return 'rd'
  return 'th'
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

function getAttemptChipClass(athlete, height) {
  const status = getCurrentStatus(athlete, height)
  if (!status || status.attempts.length === 0 && !status.passed) {
    return 'upcoming'
  }
  if (status.passed) return 'pass'
  if (status.success) return 'success'
  return 'failure'
}

function getAttemptChipText(athlete, height) {
  const status = getCurrentStatus(athlete, height)
  if (!status) return '—'
  if (status.passed) return '–'
  if (status.attempts.length === 0) return '·'
  const failures = status.attempts.filter(a => a === AttemptStatus.FAILURE).length
  if (status.success) {
    return 'O'
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
  if (timeInterval) {
    clearInterval(timeInterval)
  }
})
</script>

<style scoped>
.display-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #0a0e1a 0%, #0f172a 50%, #0a0e1a 100%);
  position: relative;
  overflow: hidden;
}

.bg-effects {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  overflow: hidden;
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.3;
}

.glow-1 {
  width: 600px;
  height: 600px;
  background: var(--primary);
  top: -200px;
  right: -100px;
  animation: float 8s ease-in-out infinite;
}

.glow-2 {
  width: 500px;
  height: 500px;
  background: var(--secondary);
  bottom: -150px;
  left: -100px;
  animation: float 10s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(30px, -30px); }
}

.main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 48px;
  position: relative;
  z-index: 10;
}

.event-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-title {
  font-size: 36px;
  font-weight: 800;
  letter-spacing: 2px;
  background: linear-gradient(135deg, #fff 0%, var(--primary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.trophy {
  margin-right: 16px;
  -webkit-text-fill-color: initial;
}

.round-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.round-tag {
  padding: 6px 20px;
  border-radius: 20px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
}

.round-tag.qualification {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.round-tag.final {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.live-dot {
  width: 10px;
  height: 10px;
  background: var(--danger);
  border-radius: 50%;
  animation: livePulse 1.5s infinite;
}

@keyframes livePulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

.live-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--danger);
  letter-spacing: 2px;
}

.time-display {
  text-align: right;
}

.current-time {
  font-size: 32px;
  font-weight: 300;
  letter-spacing: 4px;
  font-family: 'Courier New', monospace;
}

.connection-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
  justify-content: flex-end;
}

.connection-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-secondary);
}

.connection-indicator.connected .dot {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
}

.main-display {
  flex: 1;
  display: flex;
  padding: 0 48px;
  gap: 40px;
  position: relative;
  z-index: 10;
}

.left-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 40px;
  justify-content: center;
}

.height-display {
  text-align: center;
}

.height-label {
  font-size: 18px;
  color: var(--text-secondary);
  letter-spacing: 4px;
  text-transform: uppercase;
  margin-bottom: 16px;
}

.height-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12px;
  animation: heightChange 0.5s ease-out;
}

@keyframes heightChange {
  0% { transform: scale(1.2); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.height-number {
  font-size: 140px;
  font-weight: 900;
  background: linear-gradient(180deg, var(--primary) 0%, #0ea5e9 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 60px rgba(0, 212, 255, 0.5);
  font-family: 'Arial Black', sans-serif;
  line-height: 1;
}

.height-unit {
  font-size: 36px;
  color: var(--text-secondary);
  font-weight: 300;
}

.height-progress {
  margin-top: 32px;
  padding: 0 40px;
}

.heights-track {
  position: relative;
  height: 60px;
  background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.1), transparent);
  border-radius: 30px;
}

.height-marker {
  position: absolute;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.marker-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.3);
  transition: all 0.3s;
}

.height-marker.passed .marker-dot {
  background: var(--success);
}

.height-marker.active .marker-dot {
  background: var(--primary);
  width: 20px;
  height: 20px;
  box-shadow: 0 0 20px var(--primary);
  animation: markerPulse 2s infinite;
}

@keyframes markerPulse {
  0%, 100% { box-shadow: 0 0 20px var(--primary); }
  50% { box-shadow: 0 0 40px var(--primary); }
}

.marker-label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.height-marker.active .marker-label {
  color: var(--primary);
  font-weight: 700;
  font-size: 14px;
}

.current-athlete-display {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.athlete-card {
  display: flex;
  align-items: center;
  gap: 32px;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.8));
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 32px 40px;
  backdrop-filter: blur(10px);
  position: relative;
  overflow: hidden;
}

.athlete-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--primary), var(--secondary));
}

.athlete-position {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.position-number {
  font-size: 72px;
  font-weight: 900;
  color: var(--primary);
  line-height: 1;
}

.position-suffix {
  font-size: 24px;
  color: var(--text-secondary);
  font-weight: 600;
}

.athlete-details {
  flex: 1;
}

.athlete-details .athlete-name {
  font-size: 40px;
  font-weight: 700;
  margin-bottom: 8px;
}

.athlete-details .athlete-team {
  font-size: 20px;
  color: var(--text-secondary);
}

.athlete-best {
  text-align: right;
}

.best-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.best-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--success);
}

.attempts-display {
  text-align: center;
}

.attempts-label {
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  letter-spacing: 2px;
}

.attempts-circles {
  display: flex;
  justify-content: center;
  gap: 24px;
}

.attempt-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid rgba(148, 163, 184, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.1);
  transition: all 0.3s;
}

.attempt-circle.success {
  background: linear-gradient(135deg, var(--success), #059669);
  border-color: var(--success);
  box-shadow: 0 0 30px rgba(16, 185, 129, 0.4);
  animation: successPop 0.4s ease-out;
}

@keyframes successPop {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.attempt-circle.failure {
  background: linear-gradient(135deg, var(--danger), #dc2626);
  border-color: var(--danger);
  box-shadow: 0 0 30px rgba(239, 68, 68, 0.4);
  animation: failureShake 0.4s ease-out;
}

@keyframes failureShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.attempt-circle.pass {
  background: linear-gradient(135deg, var(--warning), #d97706);
  border-color: var(--warning);
  box-shadow: 0 0 30px rgba(245, 158, 11, 0.4);
}

.attempt-icon {
  font-size: 36px;
  font-weight: 900;
  color: white;
}

.no-athlete {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  position: relative;
}

.pulse-ring {
  width: 120px;
  height: 120px;
  border: 3px solid var(--primary);
  border-radius: 50%;
  animation: pulseRing 2s ease-out infinite;
  opacity: 0.6;
}

@keyframes pulseRing {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}

.waiting-text {
  margin-top: 24px;
  font-size: 24px;
  color: var(--text-secondary);
  letter-spacing: 4px;
}

.right-section {
  width: 520px;
  display: flex;
  flex-direction: column;
}

.rankings-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.6));
  border: 1px solid var(--border-color);
  border-radius: 24px;
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid var(--border-color);
}

.panel-header h2 {
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12px;
}

.panel-header h2::before {
  content: '';
  width: 4px;
  height: 24px;
  background: linear-gradient(180deg, var(--primary), var(--secondary));
  border-radius: 2px;
}

.athlete-count {
  font-size: 14px;
  color: var(--text-secondary);
  background: rgba(148, 163, 184, 0.15);
  padding: 6px 14px;
  border-radius: 12px;
}

.rankings-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.ranking-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  transition: all 0.3s;
  margin-bottom: 4px;
  position: relative;
}

.ranking-row:hover {
  background: rgba(148, 163, 184, 0.1);
}

.ranking-row.current {
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.15), transparent);
  border: 1px solid rgba(0, 212, 255, 0.3);
}

.ranking-row.top-3 {
  background: linear-gradient(90deg, rgba(124, 58, 237, 0.1), transparent);
}

.ranking-row.eliminated {
  opacity: 0.5;
}

.rank-badge {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-weight: 800;
  position: relative;
  flex-shrink: 0;
}

.rank-badge.rank-1 {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  box-shadow: 0 4px 15px rgba(251, 191, 36, 0.4);
}

.rank-badge.rank-2 {
  background: linear-gradient(135deg, #94a3b8, #64748b);
  box-shadow: 0 4px 15px rgba(148, 163, 184, 0.3);
}

.rank-badge.rank-3 {
  background: linear-gradient(135deg, #d97706, #b45309);
  box-shadow: 0 4px 15px rgba(217, 119, 6, 0.3);
}

.rank-badge:not(.rank-1):not(.rank-2):not(.rank-3) {
  background: rgba(148, 163, 184, 0.2);
  color: var(--text-primary);
}

.medal {
  font-size: 24px;
}

.rank-num {
  font-size: 20px;
}

.tied-mark {
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 10px;
  background: var(--secondary);
  color: white;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.athlete-info-main {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.name-row .name {
  font-size: 18px;
  font-weight: 600;
}

.name-row .seed {
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(148, 163, 184, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}

.team-row {
  font-size: 14px;
  color: var(--text-secondary);
}

.result-height {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 80px;
  justify-content: flex-end;
}

.height-text {
  font-size: 22px;
  font-weight: 800;
  color: var(--primary);
}

.height-m {
  font-size: 14px;
  color: var(--text-secondary);
}

.attempts-summary {
  display: flex;
  gap: 4px;
  min-width: 120px;
  justify-content: flex-end;
}

.attempt-chip {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-secondary);
}

.attempt-chip.success {
  background: var(--success);
  color: white;
}

.attempt-chip.failure {
  background: var(--danger);
  color: white;
}

.attempt-chip.pass {
  background: var(--warning);
  color: white;
}

.attempt-chip.upcoming {
  opacity: 0.5;
}

.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 20px 48px;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid var(--border-color);
  position: relative;
  z-index: 10;
}

.bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.bar-label {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.bar-value {
  font-size: 20px;
  font-weight: 700;
}

.bar-value.highlight {
  color: var(--primary);
}

.bar-divider {
  width: 1px;
  height: 40px;
  background: var(--border-color);
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
