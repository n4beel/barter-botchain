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

## Feedback round 1

All 4 items from `docs/specs/FEEDBACK-barter.md` have been fixed and verified.

### Item Status

1. **Header collision:** **FIXED.** Redesigned header layout in `components/layout/PageShell.tsx`. Below `lg` (360px–1023px, including 700px), header renders a two-row responsive layout: Row 1 carries the Wordmark on the left and ConnectButton on the right; Row 2 carries the NetworkBadge on the left and navigation links ("Propose Swap", "My Swaps") on the right. On desktop (`>= lg`), single-row layout centers the Wordmark directly above the vertical hinge (`absolute left-1/2 -translate-x-1/2`) with ample clearance. Verified zero bounding box overlap between wordmark and nav at 360px, 700px, and 1280px via automated Puppeteer checks, and saved screenshots to `/tmp/barter-360px.png`, `/tmp/barter-700px.png`, and `/tmp/barter-1280px.png`.
2. **Local stack does not point app at seeded chain:** **FIXED.** Updated `scripts/local-stack.mjs` to write `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet` and `NEXT_PUBLIC_BOHR_RPC=http://127.0.0.1:8712` into `.env.local`.
3. **Seeded chain time is not wall-clock time:** **FIXED.** Total warp is 4000s (for scenario 6 expiration). Updated `scripts/local-stack.mjs` to start anvil with `--timestamp (realNow - 4000)`, warping only forward so final chain timestamp matches wall clock time exactly (measured diff: 0s, asserted diff <= 120s). Formatted Account Role Table printed in terminal matching spec §5.
4. **Browser walkthrough required before hand-over:** **FIXED.** Automated browser walkthrough executed with headless Chrome and `docs/specs/tools/mock-wallet.js` against the local stack on port 8712 and dev server on port 3012. Verified all routes, viewports, and roles with zero console errors and zero hydration warnings.

### Browser Walkthrough Results

| Route | Role | Viewport / Action | Observation | Status |
|---|---|---|---|---|
| `/` | Visitor | 360px, 700px, 1280px | Wordmark and nav items fully visible at all 3 viewports with zero overlap; screenshots saved | PASS |
| `/inbox` | Acc 0 & Public Lookup | 1280px / Read | Categorized inbox sections ("Waiting for you", "Waiting on them", "Done") rendered correctly; public address lookup verified | PASS |
| `/s/1` | Acc 0 (Counterparty) | 1280px / Write | Mirrored panels displayed viewer perspective; Accepted 100 AAA for 0.5 BOT; confirmed on-chain | PASS |
| `/s/2` | Acc 0 (Proposer) | 1280px / Write | Proposer cancelled open swap #2; escrowed 1.0 BOT refunded; cancelled confirmation displayed | PASS |
| `/s/6` | Acc 3 (Proposer on Expired) | 1280px / Write | Expired banner verified; Proposer cancelled expired swap #6 to retrieve 0.2 BOT escrow | PASS |
| `/s/3` | Acc 4 (Third Party) | 1280px / Read | Settled swap #3 rendered read-only with completed amounts and tx hash links | PASS |
| `/` | Acc 0 (Proposer) | 1280px / Write | Proposed 0.1 BOT for 5 AAA to Acc 1; atomic escrow locked; swap proposal link generated | PASS |

- **Console Errors:** 0
- **Hydration Warnings:** 0

### Verification Gate Summary

- `forge test`: 21 passed; 0 failed; 0 skipped; 256 fuzz runs; 128,000 invariant calls; 0 string reverts.
- `npm run typecheck`: clean (0 errors).
- `npm test`: 56 passed (10 test files), hook-deps passed.
- `npm run test:integration`: 12 passed (2 test files).
- `npm run build`: compiled successfully.
- `python3 scripts/check-distinct.py barter`: 30 projects compared, 0 problems.
- `git status`: clean.

## Feedback round 2

- **Item 1 (Local-stack autonomous mining):** Added `"--block-time", "1"` to Anvil startup args in `scripts/local-stack.mjs`. Seeding continues to complete cleanly with the final timestamp difference within ~2 minutes of real time (`diff: 1s`).
  - Command run to confirm blocks advance on their own:
    ```bash
    b1=$(cast block-number --rpc-url http://127.0.0.1:8712); sleep 3; b2=$(cast block-number --rpc-url http://127.0.0.1:8712); echo "$b1 -> $b2"
    ```
    Output: `129 -> 132` (+3 blocks produced automatically in 3 seconds).
- **Item 3 (Housekeeping):**
  - Removed tracked `AGENTS.md` and 0-byte `public/favicon.ico` via `git rm`.
  - Added `AGENTS.md` to `.gitignore`.
  - Added dedicated 192x192 PNG `app/icon.png` in project brand styling (`#4FD1A1`).
  - Configured `icons: { icon: "/icon.png" }` in `metadata` in `app/layout.tsx` so browsers request `/icon.png` directly and never request `/favicon.ico`.

## Feedback round 3

- **Footer Three-Link Compliance & Helper:**
  - Added fixed constants `BOTCHAIN_SITE_URL = "https://botchain.ai"` and `BOTCHAIN_EXPLORER_URL = "https://scan.botchain.ai"` in `lib/botchain/chain.ts`.
  - Added exported `footerLinks(chainId?: number): FooterLinks` returning `{ contract, site, explorer }` where `contract` is `<explorer for that chain>/address/<address>` (or `null` when undeployed).
  - Updated `BuiltOnBotChain` to use `footerLinks(activeBotChain.id).contract`.
  - Corrected Barter's mirror colophon footer in `components/layout/PageShell.tsx` to include `BuiltOnBotChain`, `botchain.ai`, and `Explorer` in Barter's warm palette.
  - Added `app/not-found.tsx` wrapped in `PageShell` ensuring footer renders on 404 and unrouted states.
  - Added unit test suite in `lib/botchain/__tests__/chain.test.ts` covering chain IDs 677 and 968 for both deployed and undeployed configurations.

- **Browser-Check with Local Stack (port 8712 / 3012):**
  - `/` (Home): Verified all three links present (`https://scan.bohr.life/address/0x5FbDB2315678afecb367f032d93F642f64180aa3`, `https://botchain.ai`, `https://scan.botchain.ai`).
  - `/s/1` (Detail): Verified all three links present.
  - `/nonexistent` (Not Found): Verified all three links present.


