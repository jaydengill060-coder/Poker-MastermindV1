'use strict';

// Returns best 5-card hand from 7 cards (2 hole + 5 community)
function evaluate(cards) {
  const combos = getCombinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const score = scoreHand(combo);
    if (!best || compareScores(score, best.score) > 0) {
      best = { cards: combo, score, name: score.name };
    }
  }
  return best;
}

function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function scoreHand(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map(c => c.value);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(values);
  const counts = getCounts(values);
  const countVals = Object.values(counts).sort((a, b) => b - a);
  const ranksByCount = getRanksByCount(counts);

  if (isFlush && isStraight) {
    const high = Math.max(...values);
    if (high === 14) return { rank: 9, tiebreakers: [high], name: 'Royal Flush' };
    return { rank: 8, tiebreakers: [high], name: 'Straight Flush' };
  }
  if (countVals[0] === 4) {
    return { rank: 7, tiebreakers: [ranksByCount[4][0], ranksByCount[1][0]], name: 'Four of a Kind' };
  }
  if (countVals[0] === 3 && countVals[1] === 2) {
    return { rank: 6, tiebreakers: [ranksByCount[3][0], ranksByCount[2][0]], name: 'Full House' };
  }
  if (isFlush) {
    return { rank: 5, tiebreakers: values, name: 'Flush' };
  }
  if (isStraight) {
    return { rank: 4, tiebreakers: [Math.max(...values)], name: 'Straight' };
  }
  if (countVals[0] === 3) {
    return { rank: 3, tiebreakers: [ranksByCount[3][0], ...ranksByCount[1].sort((a,b)=>b-a)], name: 'Three of a Kind' };
  }
  if (countVals[0] === 2 && countVals[1] === 2) {
    const pairs = ranksByCount[2].sort((a, b) => b - a);
    return { rank: 2, tiebreakers: [...pairs, ranksByCount[1][0]], name: 'Two Pair' };
  }
  if (countVals[0] === 2) {
    return { rank: 1, tiebreakers: [ranksByCount[2][0], ...ranksByCount[1].sort((a,b)=>b-a)], name: 'One Pair' };
  }
  return { rank: 0, tiebreakers: values, name: 'High Card' };
}

function checkStraight(values) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.length < 5) return false;
  // Normal straight
  if (unique[0] - unique[4] === 4) return true;
  // Wheel: A-2-3-4-5
  if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) return true;
  return false;
}

function getCounts(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

function getRanksByCount(counts) {
  const byCount = {};
  for (const [rank, count] of Object.entries(counts)) {
    if (!byCount[count]) byCount[count] = [];
    byCount[count].push(Number(rank));
  }
  return byCount;
}

function compareScores(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const diff = (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function determineWinners(players, communityCards) {
  const results = players.map(p => {
    const all = [...p.holeCards, ...communityCards];
    const best = evaluate(all);
    return { ...p, best };
  });

  const topScore = results.reduce((best, r) =>
    !best || compareScores(r.best.score, best) > 0 ? r.best.score : best, null);

  const winners = results.filter(r => compareScores(r.best.score, topScore) === 0);
  return { winners, results };
}

module.exports = { evaluate, determineWinners, compareScores };
