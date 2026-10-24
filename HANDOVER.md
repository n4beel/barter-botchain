# Handover: Barter (`barter-botchain`)

**Date:** 2026-10-25  
**Project:** 12 of 15 (Batch 3 Active)  
**Slug:** `barter`  
**Archetype:** O · Mirror (Amber-black `#1A1405`, Cream `#F3E9CF`, Amber `#E0B341`, Jade `#4FD1A1`, Fonts: `Hanken_Grotesk`, `B612_Mono`)

---

## 1. Deliverables Summary

### Contract Layer (`contracts/src/Barter.sol`)
- **Atomic Bilateral Escrow Swaps**:
  - `propose(counterparty, giveToken, giveAmount, wantToken, wantAmount, duration)`: Escrows give side (native BOT or standard ERC-20) with delta checks.
  - `accept(id)`: The One Transaction. Only counterparty can accept; collects want side and delivers both legs atomically.
  - `cancel(id)`: Proposer reclaims escrow at any time prior to acceptance (even post-expiry).
  - `reject(id)`: Counterparty declines proposal; returns give side to proposer.
  - `swapOf(id)`: Returns full `SwapView` tuple.
  - `swapsFor(who, offset, count)`: Paginated query returning newest swaps where `who` is proposer or counterparty.
- **Security & Safety Invariants**:
  - Reentrancy guard prevents reentering `accept`, `cancel`, or `reject` from malicious ERC-20 hooks.
  - Balance-delta checks on transfers strictly reject fee-on-transfer and rebasing tokens.
  - Second-leg failure atomicity: if delivery to either party fails, entire transaction reverts.
  - Conservation invariants for native BOT and tokens verified under fuzz testing.

### Test Suites
- **Foundry (`contracts/test/Barter.t.sol`)**:
  - 21 test cases covering all guard paths (`BadParty`, `ZeroAmount`, `SameAsset`, `NotAContract`, `BadDuration`, `WrongValue`, `UnsupportedToken`), all 3 asset pairs (Token-for-Native, Native-for-Token, Token-for-Token), double-accept, expired acceptance, atomicity on second-leg reversion, hostile token reentrancy, pagination, fuzz test (256 runs), and conservation invariants.
- **Unit Tests (`lib/__tests__/`)**:
  - 56 tests passing across `barter.test.ts`, `errors.test.ts`, `contract-limits.test.ts`, `wallet.test.ts`, `amount.test.ts`, `chain.test.ts`, `active-chain.test.ts`, `wagmi-chains.test.ts`, `deployment.test.ts`, and `hook-deps.test.ts`.
- **Integration Tests (`test/integration/barter.test.ts`)**:
  - 12 integration tests running on Anvil port 8612 (chain 968) testing complete lifecycle: token-for-native, native-for-token, token-for-token, cancellation, rejection, expiration, and error mapping.

### Frontend Application
- **Pages**:
  - `/`: Propose swap on mirrored bilateral panels with asset selectors, amount inputs, balance displays, counterparty validation, duration presets, approval step, and split action button.
  - `/s/[id]`: Dynamic swap viewer with role-based mirroring (viewer sees their give on the left and their get on the right), countdown timer, status badges, approve/accept/cancel/decline buttons, and settled-ref transaction patterns.
  - `/inbox`: Categorized swap inbox ("Waiting for You", "Waiting on Them", "Done") with address lookup bar supporting walletless exploration.
- **Design Archetype O · Mirror**:
  - Bilateral symmetrical canvas with central hinge (`⇄`).
  - Colors: Ground `#1A1405`, Surface `#241C09`, Primary Text `#F3E9CF`, Give Accent `#E0B341` (amber), Get Accent `#4FD1A1` (jade).
  - Split button with hard center seam meeting at the vertical axis.
  - Responsive stacking to horizontal divider on small viewports.
  - Passes distinctness check with 0 problems against 27 projects.

---

## 2. Verification Gates Execution

| Gate | Command | Status |
|---|---|---|
| 1. Contracts | `cd contracts && forge build --force && forge test -vv` | **PASS** (21 tests, 0 failures, 256 fuzz runs, invariant tests passed) |
| 2. TypeScript | `npm run typecheck` | **PASS** (0 errors) |
| 3. Unit & Lint | `npm test` | **PASS** (10 test files, 56 tests passed) |
| 4. Integration | `npm run test:integration` | **PASS** (12 integration tests passed on port 8612) |
| 5. Build | `npm run build` | **PASS** (Turbopack production build succeeded) |
| 6. Distinctness | `python3 ../scripts/check-distinct.py barter` | **PASS** (27 projects compared, 0 conflicts) |

---

## 3. Handover Status

Barter is fully implemented, thoroughly tested, verified against all architectural constraints, and ready for deployment.
