const BADGE_THRESHOLDS = {
  TRUSTED: 100,
  VERIFIED: 250,
  EXPERT: 500,
  ELITE: 1000,
};

import prisma from '../lib/prisma.js';

/**
 * In-memory reputation cache with a 10-second TTL.
 *
 * Reputation scores are read on every page render and leaderboard request.
 * A short TTL cache avoids hammering the database (or Soroban RPC for
 * on-chain lookups) while keeping displayed scores fresh enough for all
 * practical purposes. Cache entries are keyed by wallet address and
 * automatically expire; no explicit invalidation is needed for reads.
 */
const _reputationCache = new Map();
const REPUTATION_CACHE_TTL_MS = 10_000; // 10 seconds

function _cacheGet(address) {
  const entry = _reputationCache.get(address);
  if (!entry) return null;
  if (Date.now() - entry.ts > REPUTATION_CACHE_TTL_MS) {
    _reputationCache.delete(address);
    return null;
  }
  return entry.value;
}

function _cacheSet(address, value) {
  _reputationCache.set(address, { value, ts: Date.now() });
}

const getReputationByAddress = async (address) => {
  const cached = _cacheGet(address);
  if (cached !== null) return cached;

  const record = await prisma.reputationRecord.findUnique({
    where: { address },
  });
  const result = record || null;
  _cacheSet(address, result);
  return result;
};

const getBadge = (score) => {
  const s = Number(score);
  if (s >= BADGE_THRESHOLDS.ELITE) return 'ELITE';
  if (s >= BADGE_THRESHOLDS.EXPERT) return 'EXPERT';
  if (s >= BADGE_THRESHOLDS.VERIFIED) return 'VERIFIED';
  if (s >= BADGE_THRESHOLDS.TRUSTED) return 'TRUSTED';
  return 'NEW';
};

const computeCompletionRate = (completed, disputed) => {
  const total = Number(completed) + Number(disputed);
  return total === 0 ? 0 : (Number(completed) / total) * 100;
};

const getLeaderboard = async (limit = 20, page = 1) => {
  const skip = (page - 1) * limit;
  return prisma.reputationRecord.findMany({
    orderBy: { totalScore: 'desc' },
    take: limit,
    skip,
  });
};

const getPercentileRank = async (address) => {
  const result = await prisma.$queryRaw`
    WITH Ranked AS (
      SELECT address, PERCENT_RANK() OVER (ORDER BY total_score ASC) as rank
      FROM reputation_records
    )
    SELECT rank FROM Ranked WHERE address = ${address}
  `;
  if (result.length > 0) {
    return Math.round(Number(result[0].rank) * 100);
  }
  return 0;
};

export {
  BADGE_THRESHOLDS,
  computeCompletionRate,
  getBadge,
  getLeaderboard,
  getPercentileRank,
  getReputationByAddress,
};

export default {
  getReputationByAddress,
  getBadge,
  computeCompletionRate,
  getLeaderboard,
  getPercentileRank,
  BADGE_THRESHOLDS,
};
