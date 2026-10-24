import { BaseError, ContractFunctionRevertedError, formatEther } from "viem";

export interface RevertDetails {
  errorName?: string;
  args?: readonly unknown[];
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function extractRevert(err: unknown): RevertDetails | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  // Direct property check
  if (
    "data" in err &&
    (err as any).data &&
    typeof (err as any).data === "object" &&
    (err as any).data.errorName
  ) {
    return {
      errorName: (err as any).data.errorName,
      args: (err as any).data.args,
    };
  }
  if ("errorName" in err && typeof (err as any).errorName === "string") {
    return {
      errorName: (err as any).errorName,
      args: (err as any).args,
    };
  }

  // Viem BaseError walk
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => {
      if (e instanceof ContractFunctionRevertedError) return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "data" in e &&
        Boolean((e as { data?: { errorName?: string } }).data?.errorName)
      ) {
        return true;
      }
      return false;
    });

    if (reverted) {
      if (reverted instanceof ContractFunctionRevertedError) {
        return {
          errorName: reverted.data?.errorName,
          args: reverted.data?.args,
        };
      }
      const errorObj = reverted as any;
      if (errorObj.data?.errorName) {
        return {
          errorName: errorObj.data.errorName,
          args: errorObj.data.args,
        };
      }
      if (errorObj.errorName) {
        return {
          errorName: errorObj.errorName,
          args: errorObj.args,
        };
      }
    }
  }

  return undefined;
}

export function isUserRejection(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("User rejected") ||
    msg.includes("User denied") ||
    msg.includes("user rejected") ||
    msg.includes("ACTION_REJECTED") ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 4001)
  );
}

function formatDate(timestamp: number | bigint): string {
  const ms = Number(timestamp) * 1000;
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function stateLabel(state: number): string {
  switch (state) {
    case 1:
      return "settled";
    case 2:
      return "cancelled";
    case 3:
      return "declined";
    default:
      return "closed";
  }
}

/**
 * Maps custom errors to human-readable sentences per §4.4 error table.
 */
export function describeError(err: unknown): string {
  if (isUserRejection(err)) {
    return "Transaction cancelled in wallet.";
  }

  const revert = extractRevert(err);
  if (revert && revert.errorName) {
    const args = revert.args || [];
    switch (revert.errorName) {
      case "NotCounterparty": {
        const who = args[1] ? String(args[1]) : "the named counterparty";
        return `Only ${shortAddress(who)} can accept this swap.`;
      }
      case "Expired": {
        const expiry = args[1] !== undefined ? formatDate(args[1] as bigint) : "earlier";
        return `This offer expired on ${expiry}.`;
      }
      case "NotOpen": {
        const st = args[1] !== undefined ? Number(args[1]) : 0;
        return `This swap is already ${stateLabel(st)}.`;
      }
      case "WrongValue": {
        const expected = args[0] !== undefined ? formatEther(args[0] as bigint) : "the expected";
        const sent = args[1] !== undefined ? formatEther(args[1] as bigint) : "what";
        return `This leg needs exactly ${expected} BOT; you sent ${sent}.`;
      }
      case "UnsupportedToken":
        return "That token changes the amount on transfer, so it can't be swapped here.";
      case "SameAsset":
        return "Pick two different assets.";
      case "NotAContract":
        return "That address isn't a token.";
      case "BadParty":
        return "Choose a counterparty other than yourself.";
      case "TransferFailed":
        return "One side of the swap couldn't be delivered, so nothing moved.";
      case "BadDuration":
        return "Choose an expiry duration between 1 hour and 30 days.";
      case "ZeroAmount":
        return "Swap amounts must be greater than zero.";
      case "NoSuchSwap": {
        const id = args[0] !== undefined ? String(args[0]) : "";
        return `Swap #${id} not found.`;
      }
      case "NotProposer":
        return "Only the proposer can cancel this swap.";
      default:
        break;
    }
  }

  if (err instanceof Error) {
    if (err.message.includes("connector not connected")) {
      return "Connect your wallet to proceed.";
    }
    return err.message;
  }

  return "An unexpected error occurred.";
}
