import {
  type Address,
  type PublicClient,
  formatUnits,
  isAddress,
  zeroAddress,
} from "viem";
import { erc20Abi } from "@/lib/erc20";
import { MAX_DURATION, MIN_DURATION } from "@/lib/limits";
import { shortAddress } from "@/lib/errors";

export interface AssetMeta {
  address: Address;
  symbol: string;
  decimals: number;
  isNative: boolean;
}

export interface SwapView {
  id: bigint;
  proposer: Address;
  counterparty: Address;
  giveToken: Address;
  giveAmount: bigint;
  wantToken: Address;
  wantAmount: bigint;
  expiresAt: bigint;
  createdBlock: number;
  state: number; // 0 Open, 1 Settled, 2 Cancelled, 3 Rejected
  expired: boolean;
}

export type SwapPerspective = "proposer" | "counterparty" | "observer";

export interface SwapSides {
  give: {
    token: Address;
    amount: bigint;
  };
  get: {
    token: Address;
    amount: bigint;
  };
}

export interface ProposalInput {
  proposer?: Address;
  counterparty: string;
  giveToken: Address;
  giveAmount: bigint;
  wantToken: Address;
  wantAmount: bigint;
  duration: bigint;
}

export interface ProposalValidation {
  valid: boolean;
  errors: string[];
}

export const NATIVE_ASSET: AssetMeta = {
  address: zeroAddress,
  symbol: "BOT",
  decimals: 18,
  isNative: true,
};

/**
 * Reads asset metadata. If zero address, returns native BOT.
 * Otherwise queries symbol and decimals via ERC-20 read calls.
 */
export async function assetMeta(
  client: PublicClient | undefined,
  token: Address
): Promise<AssetMeta> {
  if (!token || token.toLowerCase() === zeroAddress.toLowerCase()) {
    return NATIVE_ASSET;
  }

  if (!client) {
    return {
      address: token,
      symbol: shortAddress(token),
      decimals: 18,
      isNative: false,
    };
  }

  try {
    const [symbolResult, decimalsResult] = await Promise.allSettled([
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);

    const symbol =
      symbolResult.status === "fulfilled" && typeof symbolResult.value === "string"
        ? symbolResult.value
        : shortAddress(token);

    const decimals =
      decimalsResult.status === "fulfilled" && typeof decimalsResult.value === "number"
        ? decimalsResult.value
        : 18;

    return {
      address: token,
      symbol,
      decimals,
      isNative: false,
    };
  } catch {
    return {
      address: token,
      symbol: shortAddress(token),
      decimals: 18,
      isNative: false,
    };
  }
}

/**
 * Checks whether an ERC20 transfer needs prior approval.
 */
export function needsApproval(allowance: bigint, amount: bigint): boolean {
  return allowance < amount;
}

/**
 * Identifies the viewer's role in a swap.
 */
export function perspective(
  swap: { proposer: Address; counterparty: Address },
  viewer?: Address
): SwapPerspective {
  if (!viewer) return "observer";
  const v = viewer.toLowerCase();
  if (v === swap.proposer.toLowerCase()) return "proposer";
  if (v === swap.counterparty.toLowerCase()) return "counterparty";
  return "observer";
}

/**
 * Resolves the "You give" vs "You get" assets and amounts from the viewer's perspective.
 * Proposer sees give as give, want as get.
 * Counterparty sees want as give, give as get (mirrored perspective).
 */
export function sides(
  swap: {
    giveToken: Address;
    giveAmount: bigint;
    wantToken: Address;
    wantAmount: bigint;
    proposer: Address;
    counterparty: Address;
  },
  viewer?: Address
): SwapSides {
  const role = perspective(swap, viewer);
  if (role === "counterparty") {
    return {
      give: {
        token: swap.wantToken,
        amount: swap.wantAmount,
      },
      get: {
        token: swap.giveToken,
        amount: swap.giveAmount,
      },
    };
  }

  return {
    give: {
      token: swap.giveToken,
      amount: swap.giveAmount,
    },
    get: {
      token: swap.wantToken,
      amount: swap.wantAmount,
    },
  };
}

/**
 * Validates proposal parameters against contract requirements.
 */
export function validateProposal(input: ProposalInput): ProposalValidation {
  const errors: string[] = [];

  if (!input.counterparty || !isAddress(input.counterparty)) {
    errors.push("Invalid counterparty address.");
  } else if (input.counterparty.toLowerCase() === zeroAddress.toLowerCase()) {
    errors.push("Counterparty cannot be zero address.");
  } else if (
    input.proposer &&
    input.counterparty.toLowerCase() === input.proposer.toLowerCase()
  ) {
    errors.push("Choose a counterparty other than yourself.");
  }

  if (input.giveAmount <= 0n) {
    errors.push("Give amount must be greater than zero.");
  }
  if (input.wantAmount <= 0n) {
    errors.push("Want amount must be greater than zero.");
  }

  if (input.giveToken.toLowerCase() === input.wantToken.toLowerCase()) {
    errors.push("Pick two different assets.");
  }

  if (input.duration < MIN_DURATION) {
    errors.push("Duration must be at least 1 hour.");
  } else if (input.duration > MAX_DURATION) {
    errors.push("Duration cannot exceed 30 days.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Formats a swap summary line:
 * "You give {a}. {name} gives {b}. Both move together or not at all."
 */
export function describeSwap(
  swap: {
    giveToken: Address;
    giveAmount: bigint;
    wantToken: Address;
    wantAmount: bigint;
    proposer: Address;
    counterparty: Address;
  },
  metas: { give: AssetMeta; want: AssetMeta },
  viewer?: Address
): string {
  const role = perspective(swap, viewer);
  const giveFmt = `${formatUnits(swap.giveAmount, metas.give.decimals)} ${metas.give.symbol}`;
  const wantFmt = `${formatUnits(swap.wantAmount, metas.want.decimals)} ${metas.want.symbol}`;

  if (role === "proposer") {
    return `You give ${giveFmt}. ${shortAddress(swap.counterparty)} gives ${wantFmt}. Both move together or not at all.`;
  }
  if (role === "counterparty") {
    return `You give ${wantFmt}. ${shortAddress(swap.proposer)} gives ${giveFmt}. Both move together or not at all.`;
  }
  return `${shortAddress(swap.proposer)} gives ${giveFmt}. ${shortAddress(swap.counterparty)} gives ${wantFmt}. Both move together or not at all.`;
}

/**
 * Checks whether an open swap has expired.
 */
export function isSwapExpired(
  swap: { state: number; expiresAt: bigint | number },
  nowSec?: number
): boolean {
  if (swap.state !== 0) return false;
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  return now >= Number(swap.expiresAt);
}
