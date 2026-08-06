# Contract Deployment Guide

This guide explains how to deploy the Stellar Smart Fund escrow contracts to **testnet** and **mainnet**, configure the deployed contract ID in the backend, and verify a successful deployment.

---

## Prerequisites

Install and configure the following before running any deployment steps.

### 1. Rust and the WASM target

```bash
rustup toolchain install stable
rustup default stable
rustup target add wasm32-unknown-unknown
```

Verify:

```bash
rustc --version   # 1.74.0 or later
```

### 2. Stellar CLI (formerly Soroban CLI)

```bash
cargo install --locked stellar-cli --features opt
```

Verify:

```bash
stellar --version   # 21.x or later
```

### 3. A funded Stellar account

You need a key pair whose public key holds enough XLM to pay deployment fees.

**Testnet** — use Friendbot to fund automatically (see below).  
**Mainnet** — fund the account from an exchange or existing wallet before deploying.

---

## Testnet Deployment

### Step 1 — Generate or import an identity

```bash
# Generate a fresh keypair named "deployer" in the local keystore
stellar keys generate --global deployer

# Print the public key
stellar keys address deployer
```

### Step 2 — Fund the testnet account

```bash
stellar keys fund deployer --network testnet
```

This calls Friendbot with the public key and credits 10 000 XLM on testnet.

### Step 3 — Build the contract

From the repository root:

```bash
cargo build \
  -p stellar-trust-escrow-contract \
  --target wasm32-unknown-unknown \
  --release
```

The compiled WASM lands at:

```
target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.wasm
```

### Step 4 — Optimize the WASM (recommended)

```bash
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.wasm
```

This produces `stellar_trust_escrow_contract.optimized.wasm` in the same directory and reduces on-chain storage fees.

### Step 5 — Upload and deploy

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.optimized.wasm \
  --source deployer \
  --network testnet
```

On success the CLI prints a **contract ID** that looks like:

```
CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Save this value — you will need it in Step 7.

### Step 6 — Initialize the contract

The escrow contract requires an initialization call to set the admin address:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- \
  initialize \
  --admin $(stellar keys address deployer)
```

Adjust the argument names to match the current contract interface defined in `contracts/escrow_contract/src/lib.rs`.

### Step 7 — Configure the backend

Open `backend/.env` (or your environment secrets manager) and set:

```env
CONTRACT_ID=<CONTRACT_ID>
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

Restart the backend server. The startup validator (`scripts/check-env.js`) will confirm the value is present.

---

## Mainnet Deployment

Mainnet deployment follows the same steps with two differences:

1. **Fund the deployer account with real XLM** before deploying — Friendbot does not exist on mainnet.
2. **Use `--network mainnet`** in every `stellar` command instead of `--network testnet`.

```bash
# Build (same as testnet)
cargo build \
  -p stellar-trust-escrow-contract \
  --target wasm32-unknown-unknown \
  --release

stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.wasm

# Deploy to mainnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.optimized.wasm \
  --source deployer \
  --network mainnet
```

Configure the backend for mainnet:

```env
CONTRACT_ID=<MAINNET_CONTRACT_ID>
STELLAR_NETWORK=mainnet
SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
```

> **Security note**: Keep the deployer secret key in a hardware wallet or secrets manager. Never commit it to version control.

---

## Verification Steps

After deployment, confirm the contract is live and callable:

```bash
# Read the contract's admin address (should match the deployer key)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- \
  get_admin
```

Check the Stellar Explorer:

- Testnet: `https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`
- Mainnet: `https://stellar.expert/explorer/public/contract/<CONTRACT_ID>`

The contract page shows the uploaded WASM hash, invocation history, and current storage entries.

---

## Deploying the Other Contracts

The same steps apply to the companion contracts. Substitute the crate name and WASM filename:

| Contract               | Crate (`-p`)                          | WASM file                                    |
| ---------------------- | ------------------------------------- | -------------------------------------------- |
| Insurance pool         | `stellar-trust-insurance-contract`    | `stellar_trust_insurance_contract.wasm`      |
| Governance             | `stellar-trust-governance`            | `stellar_trust_governance.wasm`              |
| Escrow extensions      | `stellar-trust-escrow-extensions`     | `stellar_trust_escrow_extensions.wasm`       |

Set the resulting contract IDs in `backend/.env` using the variable names defined in `scripts/check-env.js`.

---

## Troubleshooting

### `InsufficientFunds` error during deploy

The deployer account does not hold enough XLM to cover the deployment fee and minimum balance. On testnet, run `stellar keys fund deployer --network testnet` again. On mainnet, transfer additional XLM to the deployer address before retrying.

### `WasmAlreadyExists` error

The exact WASM bytes are already uploaded to the ledger. This is normal when re-deploying unchanged code. The CLI will still create a new contract instance using the existing WASM hash.

### Backend fails to start after deploy

Run the env check manually and look for the `CONTRACT_ID` error:

```bash
node scripts/check-env.js
```

Ensure the value in `.env` matches the contract ID printed by the deploy command exactly, with no surrounding whitespace.
