import { describe, expect, it } from "vitest";
import { parseEther, zeroAddress, type Address } from "viem";
import {
  assetMeta,
  describeSwap,
  isSwapExpired,
  needsApproval,
  perspective,
  sides,
  validateProposal,
  type AssetMeta,
  type SwapView,
} from "../barter";

const ALICE: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const BOB: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const CAROL: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const TOKEN_A: Address = "0x1111111111111111111111111111111111111111";
const TOKEN_B: Address = "0x2222222222222222222222222222222222222222";

describe("lib/barter", () => {
  it("assetMeta resolves native BOT for zeroAddress", async () => {
    const meta = await assetMeta(undefined, zeroAddress);
    expect(meta.isNative).toBe(true);
    expect(meta.symbol).toBe("BOT");
    expect(meta.decimals).toBe(18);
  });

  it("assetMeta handles client token query with fallback", async () => {
    const meta = await assetMeta(undefined, TOKEN_A);
    expect(meta.isNative).toBe(false);
    expect(meta.address).toBe(TOKEN_A);
    expect(meta.decimals).toBe(18);
  });

  it("needsApproval identifies allowance deficit", () => {
    expect(needsApproval(0n, 100n)).toBe(true);
    expect(needsApproval(50n, 100n)).toBe(true);
    expect(needsApproval(100n, 100n)).toBe(false);
    expect(needsApproval(200n, 100n)).toBe(false);
  });

  it("perspective resolves proposer, counterparty, observer", () => {
    const swap = { proposer: ALICE, counterparty: BOB };
    expect(perspective(swap, ALICE)).toBe("proposer");
    expect(perspective(swap, BOB)).toBe("counterparty");
    expect(perspective(swap, CAROL)).toBe("observer");
    expect(perspective(swap, undefined)).toBe("observer");
  });

  it("sides mirrors correctly for proposer and counterparty", () => {
    const swap = {
      proposer: ALICE,
      counterparty: BOB,
      giveToken: TOKEN_A,
      giveAmount: 100n,
      wantToken: zeroAddress,
      wantAmount: parseEther("1"),
    };

    const proposerSides = sides(swap, ALICE);
    expect(proposerSides.give.token).toBe(TOKEN_A);
    expect(proposerSides.give.amount).toBe(100n);
    expect(proposerSides.get.token).toBe(zeroAddress);
    expect(proposerSides.get.amount).toBe(parseEther("1"));

    // Counterparty views mirrored give and get
    const counterpartySides = sides(swap, BOB);
    expect(counterpartySides.give.token).toBe(zeroAddress);
    expect(counterpartySides.give.amount).toBe(parseEther("1"));
    expect(counterpartySides.get.token).toBe(TOKEN_A);
    expect(counterpartySides.get.amount).toBe(100n);
  });

  it("validateProposal catches bad party, zero amounts, same asset, and duration bounds", () => {
    const valid = validateProposal({
      proposer: ALICE,
      counterparty: BOB,
      giveToken: TOKEN_A,
      giveAmount: 100n,
      wantToken: zeroAddress,
      wantAmount: parseEther("1"),
      duration: 86400n,
    });
    expect(valid.valid).toBe(true);
    expect(valid.errors.length).toBe(0);

    // Self counterparty
    const self = validateProposal({
      proposer: ALICE,
      counterparty: ALICE,
      giveToken: TOKEN_A,
      giveAmount: 100n,
      wantToken: zeroAddress,
      wantAmount: 100n,
      duration: 86400n,
    });
    expect(self.valid).toBe(false);
    expect(self.errors).toContain("Choose a counterparty other than yourself.");

    // Zero counterparty
    const zeroC = validateProposal({
      proposer: ALICE,
      counterparty: zeroAddress,
      giveToken: TOKEN_A,
      giveAmount: 100n,
      wantToken: zeroAddress,
      wantAmount: 100n,
      duration: 86400n,
    });
    expect(zeroC.valid).toBe(false);

    // Same asset
    const same = validateProposal({
      proposer: ALICE,
      counterparty: BOB,
      giveToken: TOKEN_A,
      giveAmount: 100n,
      wantToken: TOKEN_A,
      wantAmount: 200n,
      duration: 86400n,
    });
    expect(same.valid).toBe(false);
    expect(same.errors).toContain("Pick two different assets.");

    // Zero amount
    const zeroAmt = validateProposal({
      proposer: ALICE,
      counterparty: BOB,
      giveToken: TOKEN_A,
      giveAmount: 0n,
      wantToken: zeroAddress,
      wantAmount: 100n,
      duration: 86400n,
    });
    expect(zeroAmt.valid).toBe(false);

    // Bad duration
    const shortDur = validateProposal({
      proposer: ALICE,
      counterparty: BOB,
      giveToken: TOKEN_A,
      giveAmount: 100n,
      wantToken: zeroAddress,
      wantAmount: 100n,
      duration: 600n, // 10 minutes < 1h
    });
    expect(shortDur.valid).toBe(false);
    expect(shortDur.errors).toContain("Duration must be at least 1 hour.");
  });

  it("describeSwap formats summary line correctly per role", () => {
    const swap = {
      proposer: ALICE,
      counterparty: BOB,
      giveToken: TOKEN_A,
      giveAmount: parseEther("100"),
      wantToken: zeroAddress,
      wantAmount: parseEther("0.05"),
    };
    const metas: { give: AssetMeta; want: AssetMeta } = {
      give: { address: TOKEN_A, symbol: "TST", decimals: 18, isNative: false },
      want: { address: zeroAddress, symbol: "BOT", decimals: 18, isNative: true },
    };

    const propDesc = describeSwap(swap, metas, ALICE);
    expect(propDesc).toContain("You give 100 TST.");
    expect(propDesc).toContain("gives 0.05 BOT.");

    const countDesc = describeSwap(swap, metas, BOB);
    expect(countDesc).toContain("You give 0.05 BOT.");
    expect(countDesc).toContain("gives 100 TST.");
  });

  it("isSwapExpired evaluates expiry strictly for open swaps", () => {
    const openSwap = { state: 0, expiresAt: 1000n };
    expect(isSwapExpired(openSwap, 999)).toBe(false);
    expect(isSwapExpired(openSwap, 1000)).toBe(true);
    expect(isSwapExpired(openSwap, 1001)).toBe(true);

    const settledSwap = { state: 1, expiresAt: 1000n };
    expect(isSwapExpired(settledSwap, 2000)).toBe(false);
  });
});
