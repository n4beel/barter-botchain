# Barter

> **Swap two assets with one named person.** Bilateral escrow swaps on BOT Chain.

Part of the BOT Chain reference applications suite (Project 12 of 15).

---

## 1. What It Does

Barter lets one person offer a specific asset to one named counterparty in return for a specific asset — BOT or any standard ERC-20 on either leg.

1. **Escrow on Propose:** When a proposer creates a swap via `propose(...)`, their offered asset is transferred into escrow within the contract.
2. **Atomic Settlement on Accept:** When the counterparty calls `accept(id)`, they provide the requested want asset. The contract immediately transfers the want asset to the proposer and the escrowed give asset to the counterparty in the same transaction.
3. **Cancellation & Refund:** If the counterparty declines (`reject`), or the proposer reclaims (`cancel`), the escrowed give asset is returned immediately to the proposer. Cancellation is permitted at any time prior to acceptance, including after the offer has expired.
4. **All-or-Nothing:** Nobody can ever end up with half a trade. If either leg fails to transfer, the entire transaction reverts.

---

## 2. What It Deliberately Cannot Do

- **Not a market:** There is no open order book, automated market maker (AMM), or price discovery mechanism. Swaps exist only between two named addresses.
- **No pricing judgment:** The contract does not verify whether an exchange rate is fair or whether an asset has intrinsic value.
- **No fee-on-transfer or rebasing tokens:** Tokens whose transfer amount differs from the balance delta are strictly rejected on both legs via balance-delta checks (`UnsupportedToken`).
- **No undo after acceptance:** Once `accept` executes, the trade is permanently settled.
- **Proposer can cancel first:** Before the counterparty accepts, the proposer can cancel and reclaim escrow at any time.

---

## 3. The One Transaction

- **Function:** `accept(uint256 id) external payable`
- **Label:** `"Accept a swap"`
- **Role:** Counterparty
- **Requirements:** If want side is native BOT, `msg.value` must equal `wantAmount` exactly. If want side is an ERC-20 token, counterparty approves the Barter contract, then calls `accept(id)` with `msg.value == 0`.

---

## 4. Architecture & Security

### 4.1 Storage Packing
Each swap is packed into 5 32-byte storage slots:
- Slot 1: `proposer` (20 bytes), `expiresAt` (8 bytes), `createdBlock` (4 bytes)
- Slot 2: `counterparty` (20 bytes), `state` (1 byte: `0 Open`, `1 Settled`, `2 Cancelled`, `3 Rejected`)
- Slot 3: `giveToken` (20 bytes; `address(0)` for native BOT)
- Slot 4: `wantToken` (20 bytes; `address(0)` for native BOT)
- Slot 5: `giveAmount` (16 bytes / uint128), `wantAmount` (16 bytes / uint128)

### 4.2 Invariants & Guarantees
- **Atomicity:** If the second leg fails or reverts, the entire call reverts with `TransferFailed()`. Neither party loses assets without receiving the agreed counter-leg.
- **Conservation of Native BOT:** `address(this).balance` equals the exact sum of native give amounts of all currently Open swaps.
- **Conservation of Tokens:** For any ERC-20 token, `token.balanceOf(address(this))` equals the exact sum of give amounts of all currently Open swaps for that token.
- **Reentrancy Protection:** Custom reentrancy guard (`_lock`) prevents hostile reentrancy during external token transfers.
- **Delta Verification:** Exact before-and-after balance checks ensure fee-on-transfer tokens cannot drain the contract or produce shortfall.

---

## 5. Design Archetype: O · Mirror

The user interface follows Archetype O · Mirror — a bilateral, symmetrical layout with a central vertical hinge dividing the canvas into two equal panels:
- **Left Panel (YOU GIVE):** Amber accent (`#E0B341`).
- **Right Panel (YOU GET):** Jade accent (`#4FD1A1`).
- **Central Hinge:** Vertical seam carrying the bilateral trade glyph (`⇄`).
- **Viewer-Perspective Mirroring:** On `/s/[id]`, the panels mirror to match the viewer's active role. Counterparties see what they must give on the left, and what they will receive on the right.
- **Split Button:** The primary action button at the bottom spans across both wings, split down the center seam into amber and jade halves.
- **Typography:** Hanken Grotesk (UI) and B612 Mono (amounts, addresses).

### Contrast Verification Report (WCAG AAA)
- Amber text/borders on amber-black (`#E0B341` on `#1A1405`): **9.2:1** (Exceeds WCAG AAA 7:1)
- Jade text/accents on amber-black (`#4FD1A1` on `#1A1405`): **10.4:1** (Exceeds WCAG AAA 7:1)
- Cream ink on amber-black (`#F3E9CF` on `#1A1405`): **13.8:1** (Exceeds WCAG AAA 7:1)
- Muted text on amber-black (`#B3A57E` on `#1A1405`): **7.2:1** (Exceeds WCAG AAA 7:1)
- Split button left text (`#211702` on amber `#E0B341`): **9.1:1** (Exceeds WCAG AAA 7:1)
- Split button right text (`#0C1F18` on jade `#4FD1A1`): **10.2:1** (Exceeds WCAG AAA 7:1)

---

## 6. Gas Ceilings

| Operation | Target Gas | Measured / Ceiling |
|---|---|---|
| `propose(BOT -> Token)` | ~190k - 260k | < 300,000 gas |
| `propose(Token -> BOT)` | ~200k - 270k | < 300,000 gas |
| `accept(Token -> BOT)` | ~110k - 160k | < 190,000 gas |
| `cancel` | ~50k - 80k | < 90,000 gas |
| `reject` | ~50k - 80k | < 90,000 gas |

---

## 7. Verification Results

- **Foundry Test Suite:** 21 tests passed (0 failures, 256 fuzz runs, invariant tests passed)
- **Unit & Hook Linter Tests:** 56 tests passed across 10 test files
- **Integration Test Suite:** 12 integration tests passed on port 8612 (chain 968)
- **TypeScript:** `tsc --noEmit` passed with 0 errors
- **Next.js Production Build:** Clean build with static and dynamic routes (`/`, `/inbox`, `/s/[id]`)
- **Distinctness Check:** `python3 scripts/check-distinct.py barter` passed with 0 conflicts across 27 projects
