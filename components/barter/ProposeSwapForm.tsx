"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  type Address,
  type Hex,
  decodeEventLog,
  formatUnits,
  isAddress,
  parseUnits,
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
import { barterAbi } from "@/lib/botchain/abi";
import { erc20Abi } from "@/lib/erc20";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { describeError, shortAddress } from "@/lib/errors";
import {
  assetMeta,
  describeSwap,
  needsApproval,
  validateProposal,
  type AssetMeta,
  NATIVE_ASSET,
} from "@/lib/barter";

type TxStage = "idle" | "approving" | "signing" | "confirming" | "confirmed" | "error";

export default function ProposeSwapForm() {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const clientRef = useRef(publicClient);
  clientRef.current = publicClient;

  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  // Form Inputs
  const [counterparty, setCounterparty] = useState("");
  const [durationPreset, setDurationPreset] = useState<"1h" | "1d" | "3d" | "7d" | "30d">("1d");

  // Left side: Give asset
  const [giveIsNative, setGiveIsNative] = useState(true);
  const [giveTokenAddress, setGiveTokenAddress] = useState("");
  const [giveAmountInput, setGiveAmountInput] = useState("");
  const [giveMeta, setGiveMeta] = useState<AssetMeta>(NATIVE_ASSET);

  // Right side: Get asset
  const [wantIsNative, setWantIsNative] = useState(false);
  const [wantTokenAddress, setWantTokenAddress] = useState("");
  const [wantAmountInput, setWantAmountInput] = useState("");
  const [wantMeta, setWantMeta] = useState<AssetMeta>(NATIVE_ASSET);

  // Resolve durations
  const durationSeconds = useMemo(() => {
    switch (durationPreset) {
      case "1h":
        return 3600n;
      case "1d":
        return 86400n;
      case "3d":
        return 86400n * 3n;
      case "7d":
        return 86400n * 7n;
      case "30d":
        return 86400n * 30n;
      default:
        return 86400n;
    }
  }, [durationPreset]);

  // Read giveToken metadata when changed
  useEffect(() => {
    let active = true;
    if (giveIsNative) {
      setGiveMeta(NATIVE_ASSET);
      return;
    }
    if (!isAddress(giveTokenAddress)) {
      setGiveMeta({
        address: giveTokenAddress as Address,
        symbol: "TOKEN",
        decimals: 18,
        isNative: false,
      });
      return;
    }
    assetMeta(clientRef.current, giveTokenAddress as Address).then((m) => {
      if (active) setGiveMeta(m);
    });
    return () => {
      active = false;
    };
  }, [giveIsNative, giveTokenAddress, chainId]);

  // Read wantToken metadata when changed
  useEffect(() => {
    let active = true;
    if (wantIsNative) {
      setWantMeta(NATIVE_ASSET);
      return;
    }
    if (!isAddress(wantTokenAddress)) {
      setWantMeta({
        address: wantTokenAddress as Address,
        symbol: "TOKEN",
        decimals: 18,
        isNative: false,
      });
      return;
    }
    assetMeta(clientRef.current, wantTokenAddress as Address).then((m) => {
      if (active) setWantMeta(m);
    });
    return () => {
      active = false;
    };
  }, [wantIsNative, wantTokenAddress, chainId]);

  // Read give allowance if giveToken is ERC-20
  const giveTokenActual = giveIsNative ? zeroAddress : (giveTokenAddress as Address);
  const wantTokenActual = wantIsNative ? zeroAddress : (wantTokenAddress as Address);

  const { data: giveAllowance, refetch: refetchAllowance } = useReadContract({
    address: giveTokenActual,
    abi: erc20Abi,
    functionName: "allowance",
    args: [
      connectedAddress ?? zeroAddress,
      deployment?.address ?? zeroAddress,
    ],
    query: {
      enabled: Boolean(
        !giveIsNative &&
          isAddress(giveTokenActual) &&
          connectedAddress &&
          deployment?.address
      ),
    },
  });

  // Parse amounts
  const giveAmountParsed = useMemo(() => {
    try {
      if (!giveAmountInput || isNaN(Number(giveAmountInput))) return 0n;
      return parseUnits(giveAmountInput, giveMeta.decimals);
    } catch {
      return 0n;
    }
  }, [giveAmountInput, giveMeta.decimals]);

  const wantAmountParsed = useMemo(() => {
    try {
      if (!wantAmountInput || isNaN(Number(wantAmountInput))) return 0n;
      return parseUnits(wantAmountInput, wantMeta.decimals);
    } catch {
      return 0n;
    }
  }, [wantAmountInput, wantMeta.decimals]);

  // Check if giveToken needs approval
  const needsGiveApproval = useMemo(() => {
    if (giveIsNative || giveAmountParsed === 0n) return false;
    return needsApproval((giveAllowance as bigint | undefined) ?? 0n, giveAmountParsed);
  }, [giveIsNative, giveAmountParsed, giveAllowance]);

  // Form validation
  const validation = useMemo(() => {
    return validateProposal({
      proposer: connectedAddress,
      counterparty,
      giveToken: giveTokenActual,
      giveAmount: giveAmountParsed,
      wantToken: wantTokenActual,
      wantAmount: wantAmountParsed,
      duration: durationSeconds,
    });
  }, [
    connectedAddress,
    counterparty,
    giveTokenActual,
    giveAmountParsed,
    wantTokenActual,
    wantAmountParsed,
    durationSeconds,
  ]);

  // Summary line
  const summaryLine = useMemo(() => {
    if (giveAmountParsed === 0n || wantAmountParsed === 0n || !isAddress(counterparty)) {
      return null;
    }
    return describeSwap(
      {
        proposer: connectedAddress ?? zeroAddress,
        counterparty: counterparty as Address,
        giveToken: giveTokenActual,
        giveAmount: giveAmountParsed,
        wantToken: wantTokenActual,
        wantAmount: wantAmountParsed,
      },
      { give: giveMeta, want: wantMeta },
      connectedAddress
    );
  }, [
    giveAmountParsed,
    wantAmountParsed,
    counterparty,
    connectedAddress,
    giveTokenActual,
    wantTokenActual,
    giveMeta,
    wantMeta,
  ]);

  // Transaction states
  const [stage, setStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [proposedId, setProposedId] = useState<bigint | null>(null);

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

      // Extract swap ID from Proposed event
      try {
        for (const log of receipt.logs) {
          try {
            const event = decodeEventLog({
              abi: barterAbi,
              data: log.data,
              topics: log.topics,
            });
            if (event.eventName === "Proposed") {
              const args = event.args as { id: bigint };
              setProposedId(args.id);
              break;
            }
          } catch {
            // Not a matching event
          }
        }
      } catch {
        // Fallback
      }
    } else if (isReceiptError) {
      settledRef.current = txHash;
      setStage("error");
      setErrorMessage(describeError(receiptError));
    }
  }, [txHash, isReceiptSuccess, isReceiptError, receipt, receiptError]);

  // Handle Token Approval
  async function handleApprove() {
    if (!deployment?.address || giveIsNative || !isAddress(giveTokenAddress)) return;
    try {
      setStage("approving");
      setErrorMessage(null);

      const hash = await writeContractAsync({
        address: giveTokenAddress as Address,
        abi: erc20Abi,
        functionName: "approve",
        args: [deployment.address, giveAmountParsed],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await refetchAllowance();
      setStage("idle");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  }

  // Handle Propose Transaction
  async function handlePropose() {
    if (!deployment?.address || !validation.valid) return;
    try {
      setStage("signing");
      setErrorMessage(null);

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: barterAbi,
        functionName: "propose",
        args: [
          counterparty as Address,
          giveTokenActual,
          giveAmountParsed,
          wantTokenActual,
          wantAmountParsed,
          durationSeconds,
        ],
        value: giveIsNative ? giveAmountParsed : 0n,
      });

      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  }

  // STAGE === "CONFIRMED" FIRST IN RENDER
  if (stage === "confirmed" && proposedId) {
    const swapUrl = `/s/${proposedId.toString()}`;
    return (
      <div className="space-y-6">
        <Panel className="p-8 text-center border-[#4FD1A1]/60 shadow-[0_0_24px_rgba(79,209,161,0.08)]">
          <div className="w-12 h-12 rounded-full bg-[#4FD1A1]/15 text-[#4FD1A1] flex items-center justify-center text-[22px] mx-auto mb-4 border border-[#4FD1A1]/40">
            ✓
          </div>
          <h2 className="text-[22px] font-bold text-[#F3E9CF] tracking-tight">
            Swap #{proposedId.toString()} Proposed
          </h2>
          <p className="text-[13px] text-[#B3A57E] mt-2 max-w-[500px] mx-auto leading-relaxed">
            Your asset has been locked into atomic escrow. Share this link with your counterparty:
          </p>

          <div className="mt-5 p-3 rounded bg-[#1A1405] border border-[#3A2F12] font-mono text-[13px] text-[#4FD1A1] break-all max-w-[540px] mx-auto flex items-center justify-between gap-3">
            <span>{typeof window !== "undefined" ? `${window.location.origin}${swapUrl}` : swapUrl}</span>
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}${swapUrl}`;
                navigator.clipboard.writeText(url);
              }}
              className="text-[11px] px-2.5 py-1 rounded bg-[#3A2F12] text-[#F3E9CF] hover:text-[#4FD1A1] shrink-0"
            >
              Copy
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={swapUrl}
              className="px-5 py-2.5 rounded bg-[#4FD1A1] text-[#0C1F18] font-semibold hover:bg-[#58E0AE] transition-colors no-underline text-[13px]"
            >
              View Swap Details →
            </Link>
            <button
              type="button"
              onClick={() => {
                setStage("idle");
                setTxHash(null);
                setProposedId(null);
                setGiveAmountInput("");
                setWantAmountInput("");
                settledRef.current = null;
              }}
              className="px-4 py-2 rounded border border-[#3A2F12] text-[#B3A57E] hover:text-[#F3E9CF] text-[13px]"
            >
              Propose Another
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Counterparty & Expiry Header Bar */}
      <Panel className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#B3A57E] font-medium mb-1.5">
              Named Counterparty Address
            </label>
            <input
              type="text"
              placeholder="0x… (Only this address can accept)"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value.trim())}
              className="w-full bg-[#1A1405] border border-[#3A2F12] rounded px-3 py-2 text-[13px] font-mono text-[#F3E9CF] placeholder:text-[#7D7252] focus:outline-none focus:border-[#4FD1A1]"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#B3A57E] font-medium mb-1.5">
              Offer Expiry Window
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {(["1h", "1d", "3d", "7d", "30d"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDurationPreset(preset)}
                  className={`text-[12px] py-1.5 rounded font-mono transition-colors border ${
                    durationPreset === preset
                      ? "bg-[#3A2F12] border-[#4FD1A1] text-[#4FD1A1] font-semibold"
                      : "bg-[#1A1405] border-[#3A2F12] text-[#B3A57E] hover:text-[#F3E9CF]"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* BILATERAL MIRRORED PANELS (Desktop: Side-by-Side with central Hinge, Mobile: Stacked) */}
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
        {/* Central Hinge Glyph on Desktop */}
        <div
          className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-[#241C09] border border-[#3A2F12] items-center justify-center text-[#B3A57E] shadow-[0_0_12px_rgba(0,0,0,0.5)] font-mono text-[14px]"
          aria-hidden="true"
        >
          ⇄
        </div>

        {/* LEFT PANEL: YOU GIVE (Amber Accent) */}
        <Panel side="give" eyebrow="Proposer Leg" title="Asset You Escrow">
          <div className="space-y-4">
            {/* Asset Selector */}
            <div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[#B3A57E] mb-1.5">
                <span>Asset Type</span>
                <span className="text-[#E0B341]">Locked on creation</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGiveIsNative(true)}
                  className={`py-2 px-3 text-[12px] font-medium rounded border transition-colors ${
                    giveIsNative
                      ? "bg-[#E0B341]/15 border-[#E0B341] text-[#E0B341]"
                      : "bg-[#1A1405] border-[#3A2F12] text-[#B3A57E] hover:text-[#F3E9CF]"
                  }`}
                >
                  Native BOT
                </button>
                <button
                  type="button"
                  onClick={() => setGiveIsNative(false)}
                  className={`py-2 px-3 text-[12px] font-medium rounded border transition-colors ${
                    !giveIsNative
                      ? "bg-[#E0B341]/15 border-[#E0B341] text-[#E0B341]"
                      : "bg-[#1A1405] border-[#3A2F12] text-[#B3A57E] hover:text-[#F3E9CF]"
                  }`}
                >
                  ERC-20 Token
                </button>
              </div>
            </div>

            {/* Custom Token Input */}
            {!giveIsNative && (
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#B3A57E] mb-1">
                  Give Token Address
                </label>
                <input
                  type="text"
                  placeholder="0x…"
                  value={giveTokenAddress}
                  onChange={(e) => setGiveTokenAddress(e.target.value.trim())}
                  className="w-full bg-[#1A1405] border border-[#3A2F12] rounded px-3 py-2 text-[12px] font-mono text-[#F3E9CF] placeholder:text-[#7D7252] focus:outline-none focus:border-[#E0B341]"
                />
                <div className="text-[11px] text-[#B3A57E] mt-1 font-mono">
                  Identified: <span className="text-[#E0B341]">{giveMeta.symbol}</span> ({giveMeta.decimals} decimals)
                </div>
              </div>
            )}

            {/* Amount Input */}
            <div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[#B3A57E] mb-1">
                <span>Amount to Give</span>
                <span>{giveMeta.symbol}</span>
              </div>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.0"
                value={giveAmountInput}
                onChange={(e) => setGiveAmountInput(e.target.value)}
                className="w-full bg-[#1A1405] border border-[#3A2F12] rounded px-3.5 py-2.5 text-[16px] font-mono text-[#F3E9CF] placeholder:text-[#7D7252] focus:outline-none focus:border-[#E0B341]"
              />
            </div>
          </div>
        </Panel>

        {/* RIGHT PANEL: YOU GET (Jade Accent) */}
        <Panel side="get" eyebrow="Counterparty Leg" title="Asset You Want">
          <div className="space-y-4">
            {/* Asset Selector */}
            <div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[#B3A57E] mb-1.5">
                <span>Asset Type</span>
                <span className="text-[#4FD1A1]">Delivered on accept</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWantIsNative(true)}
                  className={`py-2 px-3 text-[12px] font-medium rounded border transition-colors ${
                    wantIsNative
                      ? "bg-[#4FD1A1]/15 border-[#4FD1A1] text-[#4FD1A1]"
                      : "bg-[#1A1405] border-[#3A2F12] text-[#B3A57E] hover:text-[#F3E9CF]"
                  }`}
                >
                  Native BOT
                </button>
                <button
                  type="button"
                  onClick={() => setWantIsNative(false)}
                  className={`py-2 px-3 text-[12px] font-medium rounded border transition-colors ${
                    !wantIsNative
                      ? "bg-[#4FD1A1]/15 border-[#4FD1A1] text-[#4FD1A1]"
                      : "bg-[#1A1405] border-[#3A2F12] text-[#B3A57E] hover:text-[#F3E9CF]"
                  }`}
                >
                  ERC-20 Token
                </button>
              </div>
            </div>

            {/* Custom Token Input */}
            {!wantIsNative && (
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#B3A57E] mb-1">
                  Want Token Address
                </label>
                <input
                  type="text"
                  placeholder="0x…"
                  value={wantTokenAddress}
                  onChange={(e) => setWantTokenAddress(e.target.value.trim())}
                  className="w-full bg-[#1A1405] border border-[#3A2F12] rounded px-3 py-2 text-[12px] font-mono text-[#F3E9CF] placeholder:text-[#7D7252] focus:outline-none focus:border-[#4FD1A1]"
                />
                <div className="text-[11px] text-[#B3A57E] mt-1 font-mono">
                  Identified: <span className="text-[#4FD1A1]">{wantMeta.symbol}</span> ({wantMeta.decimals} decimals)
                </div>
              </div>
            )}

            {/* Amount Input */}
            <div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[#B3A57E] mb-1">
                <span>Amount to Receive</span>
                <span>{wantMeta.symbol}</span>
              </div>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.0"
                value={wantAmountInput}
                onChange={(e) => setWantAmountInput(e.target.value)}
                className="w-full bg-[#1A1405] border border-[#3A2F12] rounded px-3.5 py-2.5 text-[16px] font-mono text-[#F3E9CF] placeholder:text-[#7D7252] focus:outline-none focus:border-[#4FD1A1]"
              />
            </div>
          </div>
        </Panel>
      </div>

      {/* Summary Sentence Line */}
      {summaryLine && (
        <div className="p-4 rounded bg-[#241C09] border border-[#3A2F12] text-center text-[14px] text-[#F3E9CF]">
          {summaryLine}
        </div>
      )}

      {/* Honest Limits Notice (§3.4) */}
      <div className="p-4 rounded bg-[#1A1405] border border-[#3A2F12]/80 text-[12px] text-[#B3A57E] leading-relaxed">
        <strong className="text-[#F3E9CF]">Honest limits:</strong> One named person can accept.
        Prices aren&apos;t checked. A settled swap can&apos;t be undone. The escrowed give asset can be
        retrieved anytime before acceptance by calling cancel.
      </div>

      {/* Validation Errors */}
      {validation.errors.length > 0 && (
        <div className="p-3.5 rounded bg-[#E05D52]/10 border border-[#E05D52]/30 text-[#E05D52] text-[12px] font-mono">
          <ul className="list-disc list-inside space-y-1">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Error state */}
      {stage === "error" && errorMessage && (
        <div className="p-4 rounded bg-[#E05D52]/15 border border-[#E05D52]/40 text-[#E05D52] text-[13px] font-mono">
          ✗ {errorMessage}
        </div>
      )}

      {/* Action Buttons: Hard-split or Approval */}
      <div className="space-y-3">
        {needsGiveApproval ? (
          <Button
            type="button"
            variant="give"
            size="lg"
            loading={stage === "approving"}
            onClick={handleApprove}
            className="w-full uppercase font-bold"
          >
            Step 1: Approve {giveMeta.symbol} Transfer
          </Button>
        ) : (
          <Button
            type="button"
            variant="split"
            disabled={!validation.valid || stage === "signing" || stage === "confirming"}
            loading={stage === "signing" || stage === "confirming"}
            onClick={handlePropose}
            splitLeftText={`LOCK ${giveMeta.symbol} IN ESCROW`}
            splitRightText="PROPOSE SWAP"
          />
        )}
      </div>
    </div>
  );
}
