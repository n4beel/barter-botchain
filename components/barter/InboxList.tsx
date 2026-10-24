"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { type Address, formatUnits, isAddress, zeroAddress } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { barterAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { shortAddress } from "@/lib/errors";
import {
  isSwapExpired,
  perspective,
  sides,
  type SwapView,
} from "@/lib/barter";

export default function InboxList() {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  const [inputAddress, setInputAddress] = useState("");
  const [queriedAddress, setQueriedAddress] = useState<Address | undefined>(undefined);

  // Active address is queried address if set, else connected address
  const activeAddress = useMemo(() => {
    if (queriedAddress) return queriedAddress;
    return connectedAddress;
  }, [queriedAddress, connectedAddress]);

  // Read swapsFor(activeAddress, 0, 50)
  const {
    data: rawSwaps,
    isLoading,
    refetch,
  } = useReadContract({
    address: deployment?.address,
    abi: barterAbi,
    functionName: "swapsFor",
    args: activeAddress ? [activeAddress, 0n, 50n] : undefined,
    query: {
      enabled: Boolean(deployment?.address && activeAddress),
    },
  });

  const swaps: SwapView[] = useMemo(() => {
    if (!rawSwaps || !Array.isArray(rawSwaps)) return [];
    return rawSwaps as unknown as SwapView[];
  }, [rawSwaps]);

  // Group into: Waiting for you, Waiting on them, Done
  const { waitingForYou, waitingOnThem, done } = useMemo(() => {
    const forYou: SwapView[] = [];
    const onThem: SwapView[] = [];
    const finished: SwapView[] = [];

    if (!activeAddress) return { waitingForYou: forYou, waitingOnThem: onThem, done: finished };

    const viewer = activeAddress.toLowerCase();
    const nowSec = Math.floor(Date.now() / 1000);

    for (const s of swaps) {
      const isExpired = isSwapExpired(s, nowSec);
      if (s.state === 0 && !isExpired) {
        if (s.counterparty.toLowerCase() === viewer) {
          forYou.push(s);
        } else if (s.proposer.toLowerCase() === viewer) {
          onThem.push(s);
        } else {
          finished.push(s);
        }
      } else {
        finished.push(s);
      }
    }

    return { waitingForYou: forYou, waitingOnThem: onThem, done: finished };
  }, [swaps, activeAddress]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputAddress.trim();
    if (isAddress(trimmed)) {
      setQueriedAddress(trimmed as Address);
    }
  };

  const handleReset = () => {
    setInputAddress("");
    setQueriedAddress(undefined);
  };

  return (
    <div className="flex flex-col gap-8 max-w-[960px] mx-auto w-full">
      {/* Search / Address Bar */}
      <Panel side="neutral" className="p-4 sm:p-5">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <label
              htmlFor="address-lookup"
              className="block text-[11px] uppercase tracking-wider font-semibold text-[#B3A57E] mb-1.5"
            >
              Look up Swaps for Address
            </label>
            <input
              id="address-lookup"
              type="text"
              placeholder={connectedAddress ?? "0x..."}
              value={inputAddress}
              onChange={(e) => setInputAddress(e.target.value)}
              className="w-full bg-[#1A1405] border border-[#3A2F12] rounded px-3 py-2 text-[13px] font-mono text-[#F3E9CF] placeholder-[#B3A57E]/50 focus:outline-none focus:border-[#4FD1A1]"
            />
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto pt-2 sm:pt-6 w-full sm:w-auto">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!isAddress(inputAddress.trim())}
              className="flex-1 sm:flex-none"
            >
              Look Up
            </Button>
            {queriedAddress && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
              >
                Reset to Wallet
              </Button>
            )}
          </div>
        </form>

        {activeAddress && (
          <div className="mt-3 pt-3 border-t border-[#3A2F12] flex items-center justify-between text-[12px] text-[#B3A57E]">
            <span>
              Showing swaps for:{" "}
              <span className="font-mono text-[#F3E9CF]">
                {shortAddress(activeAddress)}
              </span>
              {activeAddress.toLowerCase() === connectedAddress?.toLowerCase() && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#3A2F12] text-[#4FD1A1]">
                  Connected
                </span>
              )}
            </span>
            <button
              onClick={() => refetch()}
              className="text-[#4FD1A1] hover:underline"
            >
              Refresh
            </button>
          </div>
        )}
      </Panel>

      {!activeAddress ? (
        <Panel side="neutral" className="p-8 text-center">
          <p className="text-[14px] text-[#F3E9CF]">
            Connect your wallet or enter an address above to view bilateral swaps.
          </p>
          <p className="text-[12px] text-[#B3A57E] mt-2">
            Anyone can look up swaps created by or addressed to any BOT Chain address.
          </p>
        </Panel>
      ) : isLoading ? (
        <Panel side="neutral" className="p-8 text-center text-[#B3A57E] text-[13px]">
          Loading swaps from contract...
        </Panel>
      ) : swaps.length === 0 ? (
        <Panel side="neutral" className="p-8 text-center">
          <p className="text-[14px] text-[#F3E9CF]">No swaps found for this address.</p>
          <div className="mt-4">
            <Link href="/" className="no-underline">
              <Button variant="split" size="md">
                <span>CREATE</span>
                <span>PROPOSAL</span>
              </Button>
            </Link>
          </div>
        </Panel>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Section 1: Waiting for you */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[14px] uppercase tracking-wider font-bold text-[#4FD1A1]">
                Waiting for You ({waitingForYou.length})
              </h2>
              <span className="text-[12px] text-[#B3A57E]">
                — Incoming proposals awaiting your acceptance
              </span>
            </div>
            {waitingForYou.length === 0 ? (
              <Panel side="neutral" className="p-4 text-[12px] text-[#B3A57E]">
                No pending swaps waiting for your acceptance.
              </Panel>
            ) : (
              <div className="flex flex-col gap-3">
                {waitingForYou.map((s) => (
                  <SwapCard key={s.id.toString()} swap={s} viewer={activeAddress} />
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Waiting on them */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[14px] uppercase tracking-wider font-bold text-[#E0B341]">
                Waiting on Them ({waitingOnThem.length})
              </h2>
              <span className="text-[12px] text-[#B3A57E]">
                — Active proposals you created, awaiting counterparty
              </span>
            </div>
            {waitingOnThem.length === 0 ? (
              <Panel side="neutral" className="p-4 text-[12px] text-[#B3A57E]">
                No active proposals waiting on counterparty.
              </Panel>
            ) : (
              <div className="flex flex-col gap-3">
                {waitingOnThem.map((s) => (
                  <SwapCard key={s.id.toString()} swap={s} viewer={activeAddress} />
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Done */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[14px] uppercase tracking-wider font-bold text-[#F3E9CF]">
                Done ({done.length})
              </h2>
              <span className="text-[12px] text-[#B3A57E]">
                — Settled, cancelled, declined, or expired
              </span>
            </div>
            {done.length === 0 ? (
              <Panel side="neutral" className="p-4 text-[12px] text-[#B3A57E]">
                No finished or cancelled swaps.
              </Panel>
            ) : (
              <div className="flex flex-col gap-3">
                {done.map((s) => (
                  <SwapCard key={s.id.toString()} swap={s} viewer={activeAddress} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SwapCard({ swap, viewer }: { swap: SwapView; viewer?: Address }) {
  const role = perspective(swap, viewer);
  const side = sides(swap, viewer);
  const nowSec = Math.floor(Date.now() / 1000);
  const isExpired = isSwapExpired(swap, nowSec);

  // Status computation
  let statusBadge: { label: string; bg: string; text: string } = {
    label: "Open",
    bg: "bg-[#3A2F12]",
    text: "text-[#F3E9CF]",
  };

  if (swap.state === 1) {
    statusBadge = { label: "Settled ✓", bg: "bg-[#4FD1A1]/15", text: "text-[#4FD1A1]" };
  } else if (swap.state === 2) {
    statusBadge = { label: "Cancelled", bg: "bg-[#3A2F12]", text: "text-[#B3A57E]" };
  } else if (swap.state === 3) {
    statusBadge = { label: "Declined", bg: "bg-[#3A2F12]", text: "text-[#B3A57E]" };
  } else if (isExpired) {
    statusBadge = {
      label: role === "proposer" ? "Expired (Refundable)" : "Expired",
      bg: "bg-[#E0B341]/15",
      text: "text-[#E0B341]",
    };
  } else if (role === "counterparty") {
    statusBadge = { label: "Awaiting Your Acceptance", bg: "bg-[#4FD1A1]/15", text: "text-[#4FD1A1]" };
  } else if (role === "proposer") {
    statusBadge = { label: "Awaiting Counterparty", bg: "bg-[#E0B341]/15", text: "text-[#E0B341]" };
  }

  const otherParty =
    role === "proposer" ? swap.counterparty : swap.proposer;

  const giveIsNative = side.give.token.toLowerCase() === zeroAddress.toLowerCase();
  const getIsNative = side.get.token.toLowerCase() === zeroAddress.toLowerCase();

  const giveSymbol = giveIsNative ? "BOT" : shortAddress(side.give.token);
  const getSymbol = getIsNative ? "BOT" : shortAddress(side.get.token);

  // Default display amounts assuming 18 decimals if token; full details rendered on /s/[id]
  const giveDisplay = formatUnits(side.give.amount, 18);
  const getDisplay = formatUnits(side.get.amount, 18);

  const expiresDate = new Date(Number(swap.expiresAt) * 1000);

  return (
    <Panel
      side="neutral"
      className="p-4 hover:border-[#4FD1A1]/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
    >
      <div className="flex flex-col gap-2 flex-1">
        {/* Top meta row */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-mono text-[#F3E9CF] font-bold">
            Swap #{swap.id.toString()}
          </span>
          <span className="text-[#3A2F12]">|</span>
          <span className="text-[#B3A57E]">
            {role === "proposer" ? "With counterparty" : "From proposer"}:{" "}
            <span className="font-mono text-[#F3E9CF]">{shortAddress(otherParty)}</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${statusBadge.bg} ${statusBadge.text} ml-auto md:ml-0`}
          >
            {statusBadge.label}
          </span>
        </div>

        {/* Bilateral Trade Equation */}
        <div className="flex items-center gap-3 pt-1">
          {/* Give leg */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase font-bold text-[#E0B341]">You Give:</span>
            <span className="text-[14px] font-mono font-semibold text-[#F3E9CF]">
              {giveDisplay} {giveSymbol}
            </span>
          </div>

          <span className="text-[#B3A57E] text-[14px]" aria-hidden="true">
            ⇄
          </span>

          {/* Get leg */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase font-bold text-[#4FD1A1]">You Get:</span>
            <span className="text-[14px] font-mono font-semibold text-[#F3E9CF]">
              {getDisplay} {getSymbol}
            </span>
          </div>
        </div>

        {/* Expiration line */}
        <div className="text-[11px] text-[#B3A57E]">
          {isExpired
            ? `Expired on ${expiresDate.toLocaleString()}`
            : `Expires ${expiresDate.toLocaleString()}`}
        </div>
      </div>

      {/* Action link */}
      <div className="shrink-0 self-end md:self-center">
        <Link href={`/s/${swap.id.toString()}`} className="no-underline">
          <Button
            variant={role === "counterparty" && swap.state === 0 && !isExpired ? "get" : "secondary"}
            size="sm"
          >
            {role === "counterparty" && swap.state === 0 && !isExpired
              ? "Review & Accept ⇄"
              : "View Swap ⇄"}
          </Button>
        </Link>
      </div>
    </Panel>
  );
}
