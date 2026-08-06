#!/usr/bin/env node
/**
 * Startup environment validator.
 *
 * Run before starting the server to verify that every required secret is
 * present and meets minimum-length requirements. Exits with code 1 and a
 * human-readable summary of what is missing so deployments fail loudly
 * rather than silently using insecure defaults.
 *
 * Usage:
 *   node scripts/check-env.js          # standalone check
 *   "prestart": "node scripts/check-env.js"  # add to package.json scripts
 */

const REQUIRED = [
  {
    key: 'DATABASE_URL',
    minLength: 10,
    description: 'PostgreSQL connection string',
  },
  {
    key: 'REDIS_URL',
    minLength: 8,
    description: 'Redis connection string',
  },
  {
    key: 'JWT_SECRET',
    minLength: 32,
    description: 'Access token signing secret (min 32 chars / 64 hex chars recommended)',
  },
  {
    key: 'JWT_REFRESH_SECRET',
    minLength: 32,
    description: 'Refresh token signing secret (must differ from JWT_SECRET)',
  },
  {
    key: 'MFA_SECRET',
    minLength: 32,
    description: 'MFA token signing secret (must differ from JWT_SECRET)',
  },
  {
    key: 'STELLAR_NETWORK',
    allowed: ['testnet', 'mainnet'],
    description: "Stellar network — must be 'testnet' or 'mainnet'",
  },
  {
    key: 'SOROBAN_RPC_URL',
    minLength: 10,
    description: 'Soroban JSON-RPC endpoint URL',
  },
  {
    key: 'CONTRACT_ID',
    minLength: 10,
    description: 'Deployed escrow contract Stellar address',
  },
];

const DANGEROUS_DEFAULTS = [
  'change_this_in_production',
  'fallback_access_secret',
  'secret',
  'password',
  'your_secret_here',
];

/**
 * Estimate Shannon entropy (bits) of a string.
 * A random 32-byte value has ~256 bits of entropy; a 32-char alphanumeric
 * string has ~190 bits. We require >= 128 bits as a practical floor.
 */
function shannonEntropy(str) {
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  const len = str.length;
  return Object.values(freq).reduce((sum, count) => {
    const p = count / len;
    return sum - p * Math.log2(p);
  }, 0) * len; // total bits ≈ entropy-per-char × length
}

const JWT_SECRETS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MFA_SECRET'];
const MIN_ENTROPY_BITS = 128;

const errors = [];
const warnings = [];

for (const spec of REQUIRED) {
  const value = process.env[spec.key];

  if (!value) {
    errors.push(`  ✗ ${spec.key} — MISSING (${spec.description})`);
    continue;
  }

  if (spec.minLength && value.length < spec.minLength) {
    errors.push(`  ✗ ${spec.key} — too short (${value.length} chars, need ≥ ${spec.minLength})`);
    continue;
  }

  if (spec.allowed && !spec.allowed.includes(value)) {
    errors.push(`  ✗ ${spec.key} — invalid value "${value}" (allowed: ${spec.allowed.join(', ')})`);
    continue;
  }

  for (const bad of DANGEROUS_DEFAULTS) {
    if (value.toLowerCase().includes(bad)) {
      errors.push(`  ✗ ${spec.key} — contains a known insecure default ("${bad}")`);
      break;
    }
  }
}

// Entropy checks for JWT secrets
for (const key of JWT_SECRETS) {
  const value = process.env[key];
  if (value && value.length >= 32) {
    const bits = shannonEntropy(value);
    if (bits < MIN_ENTROPY_BITS) {
      errors.push(
        `  ✗ ${key} — insufficient entropy (${bits.toFixed(1)} bits, need ≥ ${MIN_ENTROPY_BITS}); use a randomly generated secret`,
      );
    }
  }
}

// Warn if JWT_SECRET and JWT_REFRESH_SECRET are identical
if (
  process.env.JWT_SECRET &&
  process.env.JWT_REFRESH_SECRET &&
  process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET
) {
  warnings.push(
    '  ⚠ JWT_SECRET and JWT_REFRESH_SECRET are identical — use separate secrets for defence in depth',
  );
}

if (warnings.length > 0) {
  console.warn('\nEnvironment warnings:');
  warnings.forEach((w) => console.warn(w));
}

if (errors.length > 0) {
  console.error('\nEnvironment validation FAILED — server will not start:\n');
  errors.forEach((e) => console.error(e));
  console.error(
    `\n${errors.length} error(s) found. Set the missing variables in your .env file and retry.\n`,
  );
  process.exit(1);
}

console.log('✅ Environment validation passed — all required variables are present.');
