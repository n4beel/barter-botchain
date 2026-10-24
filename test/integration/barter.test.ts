import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { barterAbi } from "@/lib/botchain/abi";
import { erc20Abi } from "@/lib/erc20";
import { MAX_PAGE, MIN_DURATION } from "@/lib/limits";

const PORT = 8612;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

const MNEMONIC = "test test test test test test test test test test test junk";
const accounts = Array.from({ length: 6 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: any;
let wallets: any[];
let barterAddress: Address;
let tokenAAddress: Address;
let tokenBAddress: Address;

function revertDetails(
  err: unknown
): { errorName?: string; args?: readonly unknown[] } | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName)
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data;
}

beforeAll(async () => {
  node = spawn(
    "anvil",
    ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"],
    {
      stdio: ["ignore", "ignore", "inherit"],
    }
  );

  publicClient = createPublicClient({
    chain: local,
    transport: http(RPC),
  });

  wallets = accounts.map((account) =>
    createWalletClient({
      account,
      chain: local,
      transport: http(RPC),
    })
  );

  // Wait for Anvil to wake up
  for (let i = 0; i < 40; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Deploy Barter
  const barterArtifact = JSON.parse(
    readFileSync("contracts/out/Barter.sol/Barter.json", "utf8")
  );
  const hash = await wallets[0].deployContract({
    abi: barterAbi,
    bytecode: barterArtifact.bytecode.object as Hex,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  barterAddress = receipt.contractAddress!;

  // Deploy MockERC20 tokens A and B
  const mockArtifact = JSON.parse(
    readFileSync("contracts/out/MockERC20.sol/MockERC20.json", "utf8")
  );
  const hashA = await wallets[0].deployContract({
    abi: mockArtifact.abi,
    bytecode: mockArtifact.bytecode.object as Hex,
    args: ["Token AAA", "AAA", 18],
  });
  const recA = await publicClient.waitForTransactionReceipt({ hash: hashA });
  tokenAAddress = recA.contractAddress!;

  const hashB = await wallets[0].deployContract({
    abi: mockArtifact.abi,
    bytecode: mockArtifact.bytecode.object as Hex,
    args: ["Token BBB", "BBB", 18],
  });
  const recB = await publicClient.waitForTransactionReceipt({ hash: hashB });
  tokenBAddress = recB.contractAddress!;

  // Mint tokens to accounts 0 and 1, and approve Barter
  for (let i = 0; i < 2; i++) {
    const acc = accounts[i].address;
    const w = wallets[i];

    const mA = await wallets[0].writeContract({
      address: tokenAAddress,
      abi: mockArtifact.abi,
      functionName: "mint",
      args: [acc, parseEther("1000")],
    });
    await publicClient.waitForTransactionReceipt({ hash: mA });

    const mB = await wallets[0].writeContract({
      address: tokenBAddress,
      abi: mockArtifact.abi,
      functionName: "mint",
      args: [acc, parseEther("1000")],
    });
    await publicClient.waitForTransactionReceipt({ hash: mB });

    const appA = await w.writeContract({
      address: tokenAAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [barterAddress, parseEther("1000000")],
    });
    await publicClient.waitForTransactionReceipt({ hash: appA });

    const appB = await w.writeContract({
      address: tokenBAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [barterAddress, parseEther("1000000")],
    });
    await publicClient.waitForTransactionReceipt({ hash: appB });
  }
});

afterAll(async () => {
  node?.kill();
});

describe("Barter integration on Anvil", () => {
  it("deploys Barter contract and exposes constants", async () => {
    expect(barterAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const minDur = await publicClient.readContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "MIN_DURATION",
    });
    expect(minDur).toBe(MIN_DURATION);

    const maxPage = await publicClient.readContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "MAX_PAGE",
    });
    expect(maxPage).toBe(BigInt(MAX_PAGE));
  });

  it("handles Native for Token swap (Alice gives BOT, Bob gives TokenB)", async () => {
    const alice = accounts[0].address;
    const bob = accounts[1].address;

    // Alice proposes: give 1 BOT, want 50 TokenB
    const pHash = await wallets[0].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "propose",
      args: [bob, zeroAddress, parseEther("1"), tokenBAddress, parseEther("50"), 86400n],
      value: parseEther("1"),
    });
    const pRec = await publicClient.waitForTransactionReceipt({ hash: pHash });
    expect(pRec.status).toBe("success");

    const swapId = 1n;
    const swap = await publicClient.readContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "swapOf",
      args: [swapId],
    });
    expect(swap.proposer.toLowerCase()).toBe(alice.toLowerCase());
    expect(swap.counterparty.toLowerCase()).toBe(bob.toLowerCase());
    expect(swap.giveToken).toBe(zeroAddress);
    expect(swap.giveAmount).toBe(parseEther("1"));
    expect(swap.wantToken.toLowerCase()).toBe(tokenBAddress.toLowerCase());
    expect(swap.wantAmount).toBe(parseEther("50"));
    expect(swap.state).toBe(0); // Open

    const aliceBBefore = (await publicClient.readContract({
      address: tokenBAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [alice],
    })) as bigint;

    const bobEthBefore = await publicClient.getBalance({ address: bob });

    // Bob accepts
    const aHash = await wallets[1].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "accept",
      args: [swapId],
    });
    const aRec = await publicClient.waitForTransactionReceipt({ hash: aHash });
    expect(aRec.status).toBe("success");

    const aliceBAfter = (await publicClient.readContract({
      address: tokenBAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [alice],
    })) as bigint;
    expect(aliceBAfter - aliceBBefore).toBe(parseEther("50"));

    const bobEthAfter = await publicClient.getBalance({ address: bob });
    // Bob received 1 BOT minus gas cost of accept
    expect(bobEthAfter).toBeGreaterThan(bobEthBefore);

    const settledSwap = await publicClient.readContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "swapOf",
      args: [swapId],
    });
    expect(settledSwap.state).toBe(1); // Settled
  });

  it("handles Token for Native swap (Alice gives TokenA, Bob gives BOT)", async () => {
    const alice = accounts[0].address;
    const bob = accounts[1].address;

    // Alice proposes: give 100 TokenA, want 2 BOT
    const pHash = await wallets[0].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "propose",
      args: [bob, tokenAAddress, parseEther("100"), zeroAddress, parseEther("2"), 86400n],
    });
    await publicClient.waitForTransactionReceipt({ hash: pHash });

    const swapId = 2n;

    const aliceEthBefore = await publicClient.getBalance({ address: alice });
    const bobABefore = (await publicClient.readContract({
      address: tokenAAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [bob],
    })) as bigint;

    // Bob accepts with 2 BOT value
    const aHash = await wallets[1].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "accept",
      args: [swapId],
      value: parseEther("2"),
    });
    await publicClient.waitForTransactionReceipt({ hash: aHash });

    const aliceEthAfter = await publicClient.getBalance({ address: alice });
    expect(aliceEthAfter - aliceEthBefore).toBe(parseEther("2"));

    const bobAAfter = (await publicClient.readContract({
      address: tokenAAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [bob],
    })) as bigint;
    expect(bobAAfter - bobABefore).toBe(parseEther("100"));
  });

  it("handles Token for Token swap (Alice gives TokenA, Bob gives TokenB)", async () => {
    const alice = accounts[0].address;
    const bob = accounts[1].address;

    // Alice proposes: give 40 TokenA, want 60 TokenB
    const pHash = await wallets[0].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "propose",
      args: [bob, tokenAAddress, parseEther("40"), tokenBAddress, parseEther("60"), 86400n],
    });
    await publicClient.waitForTransactionReceipt({ hash: pHash });

    const swapId = 3n;

    // Bob accepts
    const aHash = await wallets[1].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "accept",
      args: [swapId],
    });
    await publicClient.waitForTransactionReceipt({ hash: aHash });

    const settled = await publicClient.readContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "swapOf",
      args: [swapId],
    });
    expect(settled.state).toBe(1);
  });

  it("handles cancel by proposer even after expiry", async () => {
    const alice = accounts[0].address;
    const bob = accounts[1].address;

    // Alice proposes giving 1.5 BOT
    const pHash = await wallets[0].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "propose",
      args: [bob, zeroAddress, parseEther("1.5"), tokenBAddress, parseEther("10"), 3600n],
      value: parseEther("1.5"),
    });
    await publicClient.waitForTransactionReceipt({ hash: pHash });
    const swapId = 4n;

    // Advance time past expiry
    await publicClient.request({
      method: "evm_increaseTime",
      params: [4000],
    });
    await publicClient.request({ method: "evm_mine", params: [] });

    const expiredSwap = await publicClient.readContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "swapOf",
      args: [swapId],
    });
    expect(expiredSwap.expired).toBe(true);

    const aliceEthBefore = await publicClient.getBalance({ address: alice });

    // Cancel returns escrow
    const cHash = await wallets[0].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "cancel",
      args: [swapId],
    });
    await publicClient.waitForTransactionReceipt({ hash: cHash });

    const aliceEthAfter = await publicClient.getBalance({ address: alice });
    // Alice got 1.5 BOT back (minus minor gas)
    expect(aliceEthAfter).toBeGreaterThan(aliceEthBefore);

    const cancelled = await publicClient.readContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "swapOf",
      args: [swapId],
    });
    expect(cancelled.state).toBe(2); // Cancelled
  });

  it("handles reject by counterparty and returns escrow", async () => {
    const alice = accounts[0].address;
    const bob = accounts[1].address;

    const pHash = await wallets[0].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "propose",
      args: [bob, tokenAAddress, parseEther("25"), zeroAddress, parseEther("1"), 86400n],
    });
    await publicClient.waitForTransactionReceipt({ hash: pHash });
    const swapId = 5n;

    const aliceABefore = (await publicClient.readContract({
      address: tokenAAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [alice],
    })) as bigint;

    // Bob rejects
    const rHash = await wallets[1].writeContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "reject",
      args: [swapId],
    });
    await publicClient.waitForTransactionReceipt({ hash: rHash });

    const aliceAAfter = (await publicClient.readContract({
      address: tokenAAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [alice],
    })) as bigint;
    expect(aliceAAfter - aliceABefore).toBe(parseEther("25"));

    const rejected = await publicClient.readContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "swapOf",
      args: [swapId],
    });
    expect(rejected.state).toBe(3); // Rejected
  });

  it("reverts on fee-on-transfer tokens on propose", async () => {
    const bob = accounts[1].address;
    const fotArtifact = JSON.parse(
      readFileSync("contracts/out/MockERC20.sol/FeeOnTransferERC20.json", "utf8")
    );
    const dHash = await wallets[0].deployContract({
      abi: fotArtifact.abi,
      bytecode: fotArtifact.bytecode.object as Hex,
      args: ["Fee Token", "FEE"],
    });
    const dRec = await publicClient.waitForTransactionReceipt({ hash: dHash });
    const fotAddress = dRec.contractAddress!;

    await wallets[0].writeContract({
      address: fotAddress,
      abi: fotArtifact.abi,
      functionName: "mint",
      args: [accounts[0].address, parseEther("1000")],
    });
    await wallets[0].writeContract({
      address: fotAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [barterAddress, parseEther("1000")],
    });

    try {
      await wallets[0].writeContract({
        address: barterAddress,
        abi: barterAbi,
        functionName: "propose",
        args: [bob, fotAddress, parseEther("100"), zeroAddress, parseEther("1"), 86400n],
      });
      expect.fail("Should have reverted with UnsupportedToken");
    } catch (err) {
      const details = revertDetails(err);
      expect(details?.errorName).toBe("UnsupportedToken");
    }
  });

  it("queries swapsFor in newest-first order with pagination", async () => {
    const alice = accounts[0].address;
    const list = await publicClient.readContract({
      address: barterAddress,
      abi: barterAbi,
      functionName: "swapsFor",
      args: [alice, 0n, 50n],
    });
    expect(list.length).toBeGreaterThanOrEqual(4);
    // Newest first: list[0].id > list[1].id
    expect(list[0].id).toBeGreaterThan(list[1].id);
  });
});
