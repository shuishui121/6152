import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createAthlete,
  recordAttempt,
  calculateRankings,
  getCurrentStatus,
  canPass,
  RoundType,
  AttemptStatus,
  QUALIFICATION_HEIGHTS,
  FINAL_HEIGHTS,
  QUALIFICATION_STANDARD,
  QUALIFICATION_MAX_COUNT,
  getQualifiedAthletes
} from '../utils/competitionRules'

export const useCompetitionStore = defineStore('competition', () => {
  const roundType = ref(RoundType.QUALIFICATION)
  const currentHeight = ref(QUALIFICATION_HEIGHTS[0])
  const athletes = ref([])
  const currentAthleteIndex = ref(0)
  const isRunning = ref(false)
  const competitionName = ref('全国田径锦标赛 - 跳高项目')
  const lastUpdate = ref(Date.now())
  const version = ref(0)
  const connectionStatus = ref('disconnected')
  const wsError = ref(null)
  const hasUnsubmittedOperations = ref(false)

  const heights = computed(() => {
    return roundType.value === RoundType.QUALIFICATION
      ? QUALIFICATION_HEIGHTS
      : FINAL_HEIGHTS
  })

  const currentHeightIndex = computed(() => {
    return heights.value.indexOf(currentHeight.value)
  })

  const rankings = computed(() => {
    return calculateRankings(athletes.value)
  })

  const activeAthletes = computed(() => {
    return athletes.value.filter(a => !a.isEliminated)
  })

  const currentAthlete = computed(() => {
    return activeAthletes.value[currentAthleteIndex.value] || null
  })

  const completedHeights = computed(() => {
    const index = currentHeightIndex.value
    if (index === -1) return []
    return heights.value.slice(0, index)
  })

  const remainingHeights = computed(() => {
    const index = currentHeightIndex.value
    if (index === -1) return heights.value
    return heights.value.slice(index)
  })

  function initCompetition(name) {
    if (name) competitionName.value = name
    roundType.value = RoundType.QUALIFICATION
    currentHeight.value = QUALIFICATION_HEIGHTS[0]
    currentAthleteIndex.value = 0
    isRunning.value = true
    lastUpdate.value = Date.now()
  }

  function addAthlete(id, name, team, seed) {
    const athlete = createAthlete(id, name, team, seed)
    athletes.value.push(athlete)
    lastUpdate.value = Date.now()
    return athlete
  }

  function addAthletes(athleteList) {
    athleteList.forEach((a, i) => {
      addAthlete(a.id || `athlete-${Date.now()}-${i}`, a.name, a.team, a.seed || i + 1)
    })
  }

  function removeAthlete(id) {
    const index = athletes.value.findIndex(a => a.id === id)
    if (index !== -1) {
      athletes.value.splice(index, 1)
      lastUpdate.value = Date.now()
    }
  }

  function recordResult(athleteId, height, status) {
    const athlete = athletes.value.find(a => a.id === athleteId)
    if (!athlete) throw new Error('运动员不存在')
    
    recordAttempt(athlete, height, status)
    lastUpdate.value = Date.now()
    return athlete
  }

  function nextAthlete() {
    const active = activeAthletes.value
    if (active.length === 0) return
    
    currentAthleteIndex.value = (currentAthleteIndex.value + 1) % active.length
    
    let count = 0
    while (count < active.length) {
      const athlete = active[currentAthleteIndex.value]
      const status = getCurrentStatus(athlete, currentHeight.value)
      if (!status.completed) {
        break
      }
      currentAthleteIndex.value = (currentAthleteIndex.value + 1) % active.length
      count++
    }
    lastUpdate.value = Date.now()
  }

  function setCurrentAthlete(athleteId) {
    const index = activeAthletes.value.findIndex(a => a.id === athleteId)
    if (index !== -1) {
      currentAthleteIndex.value = index
      lastUpdate.value = Date.now()
    }
  }

  function nextHeight() {
    const index = currentHeightIndex.value
    if (index === -1 || index >= heights.value.length - 1) return
    
    currentHeight.value = heights.value[index + 1]
    currentAthleteIndex.value = 0
    lastUpdate.value = Date.now()
  }

  function prevHeight() {
    const index = currentHeightIndex.value
    if (index <= 0) return
    
    currentHeight.value = heights.value[index - 1]
    currentAthleteIndex.value = 0
    lastUpdate.value = Date.now()
  }

  function setHeight(height) {
    if (heights.value.includes(height)) {
      currentHeight.value = height
      currentAthleteIndex.value = 0
      lastUpdate.value = Date.now()
    }
  }

  function switchToFinal() {
    const qualified = getQualifiedAthletes(athletes.value, QUALIFICATION_HEIGHTS)
    athletes.value = qualified
    roundType.value = RoundType.FINAL
    currentHeight.value = FINAL_HEIGHTS[0]
    currentAthleteIndex.value = 0
    lastUpdate.value = Date.now()
  }

  function getAthleteStatus(athleteId) {
    const athlete = athletes.value.find(a => a.id === athleteId)
    if (!athlete) return null
    return getCurrentStatus(athlete, currentHeight.value)
  }

  function canAthletePass(athleteId) {
    const athlete = athletes.value.find(a => a.id === athleteId)
    if (!athlete) return false
    return canPass(athlete, currentHeight.value)
  }

  function setState(state) {
    if (state.roundType) roundType.value = state.roundType
    if (state.currentHeight !== undefined) currentHeight.value = state.currentHeight
    if (state.athletes) athletes.value = state.athletes
    if (state.currentAthleteIndex !== undefined) currentAthleteIndex.value = state.currentAthleteIndex
    if (state.isRunning !== undefined) isRunning.value = state.isRunning
    if (state.competitionName) competitionName.value = state.competitionName
    if (state.lastUpdate) lastUpdate.value = state.lastUpdate
    if (state.version !== undefined) version.value = state.version
  }

  function getState() {
    return {
      roundType: roundType.value,
      currentHeight: currentHeight.value,
      athletes: JSON.parse(JSON.stringify(athletes.value)),
      currentAthleteIndex: currentAthleteIndex.value,
      isRunning: isRunning.value,
      competitionName: competitionName.value,
      lastUpdate: lastUpdate.value,
      version: version.value
    }
  }

  function resetCompetition() {
    roundType.value = RoundType.QUALIFICATION
    currentHeight.value = QUALIFICATION_HEIGHTS[0]
    athletes.value = []
    currentAthleteIndex.value = 0
    isRunning.value = false
    lastUpdate.value = Date.now()
  }

  return {
    roundType,
    currentHeight,
    athletes,
    currentAthleteIndex,
    isRunning,
    competitionName,
    lastUpdate,
    version,
    connectionStatus,
    wsError,
    hasUnsubmittedOperations,
    heights,
    currentHeightIndex,
    rankings,
    activeAthletes,
    currentAthlete,
    completedHeights,
    remainingHeights,
    initCompetition,
    addAthlete,
    addAthletes,
    removeAthlete,
    recordResult,
    nextAthlete,
    setCurrentAthlete,
    nextHeight,
    prevHeight,
    setHeight,
    switchToFinal,
    getAthleteStatus,
    canAthletePass,
    setState,
    getState,
    resetCompetition
  }
})
