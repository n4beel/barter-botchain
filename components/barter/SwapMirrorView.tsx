"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  type Address,
  type Hex,
  formatUnits,
  isAddress,
  zeroAddress,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import BotChainGate from "@/components/botchain/BotChainGate";
import { barterAbi } from "@/lib/botchain/abi";
import { erc20Abi } from "@/lib/erc20";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { describeError, shortAddress } from "@/lib/errors";
import {
  assetMeta,
  needsApproval,
  perspective,
  sides,
  type AssetMeta,
  NATIVE_ASSET,
} from "@/lib/barter";

interface SwapMirrorViewProps {
  id: bigint;
}

type ActionType = "approve" | "accept" | "cancel" | "reject";
type TxStage = "idle" | "signing" | "confirming" | "confirmed" | "error";

export default function SwapMirrorView({ id }: SwapMirrorViewProps) {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const clientRef = useRef(publicClient);
  clientRef.current = publicClient;

  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  // Read swapOf(id)
  const {
    data: swapData,
    isLoading,
    refetch,
  } = useReadContract({
    address: deployment?.address,
    abi: barterAbi,
    functionName: "swapOf",
    args: [id],
    query: {
      enabled: Boolean(deployment?.address && id > 0n),
    },
  });

  const swap = swapData as
    | {
        id: bigint;
        proposer: Address;
        counterparty: Address;
        giveToken: Address;
        giveAmount: bigint;
        wantToken: Address;
        wantAmount: bigint;
        expiresAt: bigint;
        createdBlock: number;
        state: number;
        expired: boolean;
      }
    | undefined;

  // Metadata states
  const [giveMeta, setGiveMeta] = useState<AssetMeta>(NATIVE_ASSET);
  const [wantMeta, setWantMeta] = useState<AssetMeta>(NATIVE_ASSET);

  // Load token metas
  useEffect(() => {
    let active = true;
    if (!swap || swap.createdBlock === 0) return;

    assetMeta(clientRef.current, swap.giveToken).then((m) => {
      if (active) setGiveMeta(m);
    });
    assetMeta(clientRef.current, swap.wantToken).then((m) => {
      if (active) setWantMeta(m);
    });

    return () => {
      active = false;
    };
  }, [swap?.giveToken, swap?.wantToken, swap?.createdBlock, chainId]);

  // Perspective and Sides
  const role = useMemo(() => {
    if (!swap) return "observer";
    return perspective(swap, connectedAddress);
  }, [swap, connectedAddress]);

  const viewSides = useMemo(() => {
    if (!swap) return null;
    return sides(swap, connectedAddress);
  }, [swap, connectedAddress]);

  // Read allowance if viewer is counterparty and wantToken is ERC-20
  const wantIsToken = Boolean(swap && swap.wantToken !== zeroAddress);
  const { data: wantAllowance, refetch: refetchAllowance } = useReadContract({
    address: swap?.wantToken ?? zeroAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [
      connectedAddress ?? zeroAddress,
      deployment?.address ?? zeroAddress,
    ],
    query: {
      enabled: Boolean(
        wantIsToken &&
          role === "counterparty" &&
          connectedAddress &&
          deployment?.address
      ),
    },
  });

  const needsCounterpartyApproval = useMemo(() => {
    if (!wantIsToken || role !== "counterparty" || !swap) return false;
    return needsApproval((wantAllowance as bigint | undefined) ?? 0n, swap.wantAmount);
  }, [wantIsToken, role, wantAllowance, swap]);

  // Action states
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);
  const [stage, setStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const settledRef = useRef<Hex | null>(null);

  const { writeContractAsync } = useWriteContract();
  const {
    data: receipt,
    isSuccess: isReceiptSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash ?? undefined });

  // Settled ref pattern
  useEffect(() => {
    if (!txHash) return;
    if (settledRef.current === txHash) return;

    if (isReceiptSuccess && receipt) {
      settledRef.current = txHash;
      setStage("confirmed");
      refetch();
      refetchAllowance();
    } else if (isReceiptError) {
      settledRef.current = txHash;
      setStage("error");
      setErrorMessage(describeError(receiptError));
    }
  }, [txHash, isReceiptSuccess, isReceiptError, receipt, receiptError, refetch, refetchAllowance]);

  // Actions
  async function handleApprove() {
    if (!deployment?.address || !swap || !wantIsToken) return;
    try {
      setCurrentAction("approve");
      setStage("signing");
      setErrorMessage(null);

      const hash = await writeContractAsync({
        address: swap.wantToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [deployment.address, swap.wantAmount],
      });
      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  }

  async function handleAccept() {
    if (!deployment?.address || !swap) return;
    try {
      setCurrentAction("accept");
      setStage("signing");
      setErrorMessage(null);

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: barterAbi,
        functionName: "accept",
        args: [id],
        value: swap.wantToken === zeroAddress ? swap.wantAmount : 0n,
      });
      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  }

  async function handleCancel() {
    if (!deployment?.address) return;
    try {
      setCurrentAction("cancel");
      setStage("signing");
      setErrorMessage(null);

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: barterAbi,
        functionName: "cancel",
        args: [id],
      });
      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  }

  async function handleReject() {
    if (!deployment?.address) return;
    try {
      setCurrentAction("reject");
      setStage("signing");
      setErrorMessage(null);

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: barterAbi,
        functionName: "reject",
        args: [id],
      });
      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  }

  if (isLoading) {
    return (
      <Panel className="p-8 text-center text-[#B3A57E] font-mono text-[14px]">
        Loading swap details from BOT Chain…
      </Panel>
    );
  }

  if (!swap || swap.createdBlock === 0) {
    return (
      <Panel className="p-8 text-center text-[#E05D52] font-mono text-[14px]">
        Swap #{id.toString()} not found.
      </Panel>
    );
  }

  // Format expiry date
  const expiryDate = new Date(Number(swap.expiresAt) * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isClosed = swap.state !== 0;
  const isSettled = swap.state === 1;
  const isCancelled = swap.state === 2;
  const isRejected = swap.state === 3;
  const isExpired = swap.state === 0 && swap.expired;

  // View amounts & metas from viewer's perspective
  const leftMeta = role === "counterparty" ? wantMeta : giveMeta;
  const rightMeta = role === "counterparty" ? giveMeta : wantMeta;
  const leftAmount = role === "counterparty" ? swap.wantAmount : swap.giveAmount;
  const rightAmount = role === "counterparty" ? swap.giveAmount : swap.wantAmount;

  const leftFormatted = formatUnits(leftAmount, leftMeta.decimals);
  const rightFormatted = formatUnits(rightAmount, rightMeta.decimals);

  // Status badge
  let statusBadge = (
    <span className="px-2.5 py-0.5 rounded font-mono text-[11px] bg-[#3A2F12] text-[#E0B341]">
      Open
    </span>
  );
  if (isSettled) {
    statusBadge = (
      <span className="px-2.5 py-0.5 rounded font-mono text-[11px] bg-[#4FD1A1]/20 text-[#4FD1A1]">
        ✓ Settled
      </span>
    );
  } else if (isCancelled) {
    statusBadge = (
      <span className="px-2.5 py-0.5 rounded font-mono text-[11px] bg-[#E05D52]/20 text-[#E05D52]">
        Cancelled
      </span>
    );
  } else if (isRejected) {
    statusBadge = (
      <span className="px-2.5 py-0.5 rounded font-mono text-[11px] bg-[#E05D52]/20 text-[#E05D52]">
        Declined
      </span>
    );
  } else if (isExpired) {
    statusBadge = (
      <span className="px-2.5 py-0.5 rounded font-mono text-[11px] bg-[#E05D52]/20 text-[#E05D52]">
        Expired
      </span>
    );
  }

  // STAGE === "CONFIRMED" FIRST IN RENDER
  if (stage === "confirmed") {
    let successHeadline = "Transaction Confirmed";
    let successNote = "Your transaction has been processed on-chain.";

    if (currentAction === "accept") {
      successHeadline = "Swapped. Both Legs Settled.";
      successNote = `Delivered ${leftFormatted} ${leftMeta.symbol}. Received ${rightFormatted} ${rightMeta.symbol}.`;
    } else if (currentAction === "cancel") {
      successHeadline = "Swap Cancelled";
      successNote = "Your escrowed assets have been returned to your wallet.";
    } else if (currentAction === "reject") {
      successHeadline = "Swap Declined";
      successNote = "The offer was declined and escrow returned to the proposer.";
    } else if (currentAction === "approve") {
      successHeadline = "Allowance Approved";
      successNote = "Token transfer approved. You can now accept the swap.";
    }

    return (
      <div className="space-y-6">
        <Panel className="p-8 text-center border-[#4FD1A1]/60 shadow-[0_0_24px_rgba(79,209,161,0.08)]">
          <div className="w-12 h-12 rounded-full bg-[#4FD1A1]/15 text-[#4FD1A1] flex items-center justify-center text-[22px] mx-auto mb-4 border border-[#4FD1A1]/40">
            ✓
          </div>
          <h2 className="text-[22px] font-bold text-[#F3E9CF] tracking-tight">
            {successHeadline}
          </h2>
          <p className="text-[13px] text-[#B3A57E] mt-2 max-w-[500px] mx-auto leading-relaxed">
            {successNote}
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setStage("idle");
                setTxHash(null);
                setCurrentAction(null);
                settledRef.current = null;
              }}
            >
              Continue Viewing Swap
            </Button>
            <Link
              href="/inbox"
              className="text-[13px] px-4 py-2 rounded bg-[#4FD1A1] text-[#0C1F18] font-semibold hover:bg-[#58E0AE] no-underline"
            >
              My Swaps →
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Swap Header Card */}
      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3A2F12]/60 pb-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[18px] text-[#F3E9CF] font-bold">
              Swap #{id.toString()}
            </span>
            {statusBadge}
          </div>

          <div className="text-[12px] font-mono text-[#B3A57E]">
            {isClosed ? (
              <span>Created at block #{swap.createdBlock}</span>
            ) : isExpired ? (
              <span className="text-[#E05D52]">Expired on {expiryDate}</span>
            ) : (
              <span>Expires {expiryDate}</span>
            )}
          </div>
        </div>

        {/* Parties metadata bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-[12px] font-mono">
          <div>
            <span className="text-[#B3A57E]">Proposer: </span>
            <span className="text-[#E0B341]">{swap.proposer}</span>
            {role === "proposer" && (
              <span className="ml-2 text-[10px] uppercase font-bold text-[#E0B341] bg-[#E0B341]/10 px-1.5 py-0.5 rounded">
                You
              </span>
            )}
          </div>
          <div>
            <span className="text-[#B3A57E]">Counterparty: </span>
            <span className="text-[#4FD1A1]">{swap.counterparty}</span>
            {role === "counterparty" && (
              <span className="ml-2 text-[10px] uppercase font-bold text-[#4FD1A1] bg-[#4FD1A1]/10 px-1.5 py-0.5 rounded">
                You
              </span>
            )}
          </div>
        </div>

        {/* Role hint */}
        {role === "observer" && (
          <div className="mt-3 pt-3 border-t border-[#3A2F12]/40 text-[12px] text-[#B3A57E] italic">
            This swap is between {shortAddress(swap.proposer)} and {shortAddress(swap.counterparty)}.
            Viewing as third-party observer.
          </div>
        )}
      </Panel>

      {/* BILATERAL MIRRORED PANELS */}
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
        {/* Central Hinge Glyph */}
        <div
          className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-[#241C09] border border-[#3A2F12] items-center justify-center text-[#B3A57E] shadow-[0_0_12px_rgba(0,0,0,0.5)] font-mono text-[14px]"
          aria-hidden="true"
        >
          ⇄
        </div>

        {/* LEFT PANEL: YOU GIVE (Amber) */}
        <Panel side="give" eyebrow="Given Leg" title="You Give">
          <div className="space-y-4">
            <div className="text-[28px] sm:text-[34px] font-mono font-bold text-[#E0B341] tracking-tight">
              {leftFormatted}
              <span className="text-[18px] sm:text-[20px] text-[#F3E9CF] font-normal ml-2">
                {leftMeta.symbol}
              </span>
            </div>

            <div className="pt-2 border-t border-[#3A2F12]/40 text-[12px] font-mono text-[#B3A57E] space-y-1">
              <div>
                Asset:{" "}
                <span className="text-[#F3E9CF]">
                  {leftMeta.isNative ? "Native BOT" : leftMeta.address}
                </span>
              </div>
              <div>Decimals: {leftMeta.decimals}</div>
            </div>
          </div>
        </Panel>

        {/* RIGHT PANEL: YOU GET (Jade) */}
        <Panel side="get" eyebrow="Received Leg" title="You Get">
          <div className="space-y-4">
            <div className="text-[28px] sm:text-[34px] font-mono font-bold text-[#4FD1A1] tracking-tight">
              {rightFormatted}
              <span className="text-[18px] sm:text-[20px] text-[#F3E9CF] font-normal ml-2">
                {rightMeta.symbol}
              </span>
            </div>

            <div className="pt-2 border-t border-[#3A2F12]/40 text-[12px] font-mono text-[#B3A57E] space-y-1">
              <div>
                Asset:{" "}
                <span className="text-[#F3E9CF]">
                  {rightMeta.isNative ? "Native BOT" : rightMeta.address}
                </span>
              </div>
              <div>Decimals: {rightMeta.decimals}</div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Settled / Cancelled / Declined Banner */}
      {isSettled && (
        <div className="p-4 rounded bg-[#4FD1A1]/15 border border-[#4FD1A1]/40 text-center text-[#4FD1A1] font-mono text-[14px]">
          ✓ Swapped. {leftFormatted} {leftMeta.symbol} out, {rightFormatted} {rightMeta.symbol} in.
        </div>
      )}
      {isCancelled && (
        <div className="p-4 rounded bg-[#E05D52]/10 border border-[#E05D52]/30 text-center text-[#E05D52] font-mono text-[13px]">
          This swap was cancelled by the proposer. Escrowed assets were returned.
        </div>
      )}
      {isRejected && (
        <div className="p-4 rounded bg-[#E05D52]/10 border border-[#E05D52]/30 text-center text-[#E05D52] font-mono text-[13px]">
          This swap was declined by the counterparty. Escrowed assets were returned.
        </div>
      )}
      {isExpired && (
        <div className="p-4 rounded bg-[#E05D52]/10 border border-[#E05D52]/30 text-center text-[#E05D52] font-mono text-[13px]">
          This offer has expired. It cannot be accepted.
        </div>
      )}

      {/* Honest Limits Notice (§3.4) */}
      <div className="p-4 rounded bg-[#1A1405] border border-[#3A2F12]/80 text-[12px] text-[#B3A57E] leading-relaxed">
        <strong className="text-[#F3E9CF]">Honest limits:</strong> One named person can accept.
        Prices aren&apos;t checked. A settled swap can&apos;t be undone.
      </div>

      {/* Error state */}
      {stage === "error" && errorMessage && (
        <div className="p-4 rounded bg-[#E05D52]/15 border border-[#E05D52]/40 text-[#E05D52] text-[13px] font-mono">
          ✗ {errorMessage}
        </div>
      )}

      {/* ROLE-SPECIFIC ACTIONS (Wrapped in BotChainGate so only buttons require wallet) */}
      {!isClosed && (
        <BotChainGate noWalletNote="Connect your wallet to accept, decline, or cancel this swap.">
          <div className="space-y-4">
            {/* COUNTERPARTY ACTIONS ON OPEN */}
            {role === "counterparty" && !isExpired && (
              <div className="space-y-3">
                {needsCounterpartyApproval ? (
                  <Button
                    type="button"
                    variant="give"
                    size="lg"
                    loading={stage === "signing" && currentAction === "approve"}
                    onClick={handleApprove}
                    className="w-full uppercase font-bold"
                  >
                    Step 1: Approve {leftMeta.symbol} Transfer
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="get"
                    size="lg"
                    loading={stage === "signing" && currentAction === "accept"}
                    onClick={handleAccept}
                    className="w-full uppercase font-bold tracking-wide"
                  >
                    Accept Swap (Delivers Both Legs)
                  </Button>
                )}

                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  loading={stage === "signing" && currentAction === "reject"}
                  onClick={handleReject}
                  className="w-full"
                >
                  Decline Swap &amp; Return Escrow
                </Button>
              </div>
            )}

            {/* PROPOSER ACTIONS ON OPEN OR EXPIRED */}
            {role === "proposer" && (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  loading={stage === "signing" && currentAction === "cancel"}
                  onClick={handleCancel}
                  className="w-full border-[#E0B341]/60 text-[#E0B341] hover:bg-[#E0B341]/10"
                >
                  Cancel and Take It Back
                </Button>
              </div>
            )}
          </div>
        </BotChainGate>
      )}
    </div>
  );
}
