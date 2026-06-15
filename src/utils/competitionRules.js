export const ATTEMPTS_PER_HEIGHT = 3
export const ELIMINATION_FAILED_ATTEMPTS = 3
export const FINAL_HEIGHTS = [1.80, 1.85, 1.90, 1.95, 2.00, 2.05, 2.10, 2.15, 2.20, 2.25, 2.30, 2.35, 2.40]
export const QUALIFICATION_HEIGHTS = [1.80, 1.85, 1.90, 1.95, 2.00, 2.05, 2.10, 2.15, 2.20]
export const QUALIFICATION_STANDARD = 2.20
export const QUALIFICATION_MAX_COUNT = 12

export const AttemptStatus = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILURE: 'failure',
  PASS: 'pass'
}

export const RoundType = {
  QUALIFICATION: 'qualification',
  FINAL: 'final'
}

export function createAthlete(id, name, team, seed) {
  return {
    id,
    name,
    team,
    seed,
    results: [],
    totalFailures: 0,
    bestHeight: 0,
    isEliminated: false,
    currentAttempt: 0,
    passNext: false
  }
}

export function calculateRankings(athletes) {
  const ranked = [...athletes].filter(a => !a.isEliminated || a.bestHeight > 0)
  
  ranked.sort((a, b) => {
    if (b.bestHeight !== a.bestHeight) {
      return b.bestHeight - a.bestHeight
    }
    
    const aFailuresAtBest = countFailuresAtHeight(a, a.bestHeight)
    const bFailuresAtBest = countFailuresAtHeight(b, b.bestHeight)
    if (aFailuresAtBest !== bFailuresAtBest) {
      return aFailuresAtBest - bFailuresAtBest
    }
    
    const aTotalFailuresBeforeBest = countTotalFailuresBeforeHeight(a, a.bestHeight)
    const bTotalFailuresBeforeBest = countTotalFailuresBeforeHeight(b, b.bestHeight)
    if (aTotalFailuresBeforeBest !== bTotalFailuresBeforeBest) {
      return aTotalFailuresBeforeBest - bTotalFailuresBeforeBest
    }
    
    return 0
  })
  
  const result = []
  let currentRank = 1
  
  for (let i = 0; i < ranked.length; i++) {
    const athlete = ranked[i]
    let rank = currentRank
    
    if (i > 0) {
      const prev = ranked[i - 1]
      if (
        athlete.bestHeight === prev.bestHeight &&
        countFailuresAtHeight(athlete, athlete.bestHeight) === countFailuresAtHeight(prev, prev.bestHeight) &&
        countTotalFailuresBeforeHeight(athlete, athlete.bestHeight) === countTotalFailuresBeforeHeight(prev, prev.bestHeight)
      ) {
        rank = result[i - 1].rank
      } else {
        rank = i + 1
      }
    }
    
    result.push({
      ...athlete,
      rank,
      tied: rank !== i + 1
    })
    
    currentRank = i + 1
  }
  
  return result
}

export function countFailuresAtHeight(athlete, height) {
  const result = athlete.results.find(r => r.height === height)
  if (!result) return 0
  return result.attempts.filter(a => a === AttemptStatus.FAILURE).length
}

export function countTotalFailuresBeforeHeight(athlete, height) {
  let count = 0
  for (const result of athlete.results) {
    if (result.height < height) {
      count += result.attempts.filter(a => a === AttemptStatus.FAILURE).length
    }
  }
  return count
}

export function getAttemptsAtHeight(athlete, height) {
  const result = athlete.results.find(r => r.height === height)
  return result ? result.attempts.length : 0
}

export function getCurrentStatus(athlete, height) {
  const result = athlete.results.find(r => r.height === height)
  if (!result) {
    return { attempts: [], passed: false, completed: false, success: false }
  }
  
  const success = result.attempts.includes(AttemptStatus.SUCCESS)
  const passed = result.passed
  const completed = success || passed || result.attempts.length >= ATTEMPTS_PER_HEIGHT
  
  return {
    attempts: result.attempts,
    passed,
    completed,
    success
  }
}

export function recordAttempt(athlete, height, status) {
  if (athlete.isEliminated) {
    throw new Error('运动员已被淘汰')
  }
  
  let result = athlete.results.find(r => r.height === height)
  if (!result) {
    result = { height, attempts: [], passed: false }
    athlete.results.push(result)
  }
  
  const currentStatus = getCurrentStatus(athlete, height)
  if (currentStatus.completed) {
    throw new Error('该高度已完成')
  }
  
  if (status === AttemptStatus.PASS) {
    if (result.attempts.length > 0) {
      throw new Error('已有试跳记录不能免跳')
    }
    result.passed = true
    athlete.passNext = false
    return athlete
  }
  
  result.attempts.push(status)
  
  if (status === AttemptStatus.SUCCESS) {
    if (height > athlete.bestHeight) {
      athlete.bestHeight = height
    }
    athlete.totalFailures = 0
  } else if (status === AttemptStatus.FAILURE) {
    athlete.totalFailures++
    if (athlete.totalFailures >= ELIMINATION_FAILED_ATTEMPTS) {
      athlete.isEliminated = true
    }
  }
  
  return athlete
}

export function canPass(athlete, currentHeight) {
  if (athlete.isEliminated) return false
  const status = getCurrentStatus(athlete, currentHeight)
  return !status.completed && status.attempts.length === 0
}

export function getQualifiedAthletes(athletes, heights) {
  const qualified = athletes.filter(a => a.bestHeight >= QUALIFICATION_STANDARD)
  
  if (qualified.length >= QUALIFICATION_MAX_COUNT) {
    return qualified
  }
  
  const remaining = athletes.filter(a => a.bestHeight < QUALIFICATION_STANDARD && !a.isEliminated)
  const ranked = calculateRankings([...qualified, ...remaining])
  return ranked.slice(0, QUALIFICATION_MAX_COUNT).map(a => ({
    ...a,
    results: [],
    totalFailures: 0,
    isEliminated: false,
    currentAttempt: 0,
    passNext: false
  }))
}

export function getNextHeight(currentHeight, heights) {
  const index = heights.indexOf(currentHeight)
  if (index === -1 || index >= heights.length - 1) {
    return null
  }
  return heights[index + 1]
}

export function getPreviousHeight(currentHeight, heights) {
  const index = heights.indexOf(currentHeight)
  if (index <= 0) return null
  return heights[index - 1]
}
