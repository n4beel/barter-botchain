/**
 * Local stack runner and seeder for Barter.
 *
 * Spawns anvil on port 8712 with chain id 968, deploys Barter and mock tokens AAA & BBB,
 * and seeds the 7 scenarios from 12-barter.md §5:
 * (1) open, incoming to account 0 (token ↔ BOT)
 * (2) open, outgoing from account 0 (BOT ↔ token)
 * (3) settled token ↔ token
 * (4) cancelled
 * (5) rejected
 * (6) expired Open (refundable)
 * (7) BOT ↔ token the other way
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseEther,
  zeroAddress,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const PORT = 8712;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const MNEMONIC = "test test test test test test test test test test test junk";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

const realNow = Math.floor(Date.now() / 1000);
const TOTAL_WARP = 4000;
const startTimestamp = realNow - TOTAL_WARP;

console.log(`Starting anvil on port ${PORT} (timestamp: ${startTimestamp})...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--timestamp",
    String(startTimestamp),
    "--silent",
  ],
  {
    detached: true,
    stdio: "ignore",
  }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

const accounts = Array.from({ length: 10 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const wallets = accounts.map((account) =>
  createWalletClient({ account, chain: local, transport: http() })
);

// Wait for Anvil to respond
for (let i = 0; i < 40; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

console.log("Anvil running.");

const barterArtifact = JSON.parse(
  readFileSync("contracts/out/Barter.sol/Barter.json", "utf8")
);
const mockArtifact = JSON.parse(
  readFileSync("contracts/out/MockERC20.sol/MockERC20.json", "utf8")
);

// 1. Deploy Barter
const deployHash = await wallets[0].deployContract({
  abi: barterArtifact.abi,
  bytecode: barterArtifact.bytecode.object,
});
const deployRec = await pub.waitForTransactionReceipt({ hash: deployHash });
const barterAddress = getAddress(deployRec.contractAddress);
const deployBlock = deployRec.blockNumber > 1n ? deployRec.blockNumber - 1n : 1n;

// 2. Deploy Token AAA and BBB
const tokenAHash = await wallets[0].deployContract({
  abi: mockArtifact.abi,
  bytecode: mockArtifact.bytecode.object,
  args: ["Token AAA", "AAA", 18],
});
const recA = await pub.waitForTransactionReceipt({ hash: tokenAHash });
const tokenA = getAddress(recA.contractAddress);

const tokenBHash = await wallets[0].deployContract({
  abi: mockArtifact.abi,
  bytecode: mockArtifact.bytecode.object,
  args: ["Token BBB", "BBB", 18],
});
const recB = await pub.waitForTransactionReceipt({ hash: tokenBHash });
const tokenB = getAddress(recB.contractAddress);

console.log("Barter deployed at: ", barterAddress);
console.log("Token AAA deployed at:", tokenA);
console.log("Token BBB deployed at:", tokenB);

// 3. Mint tokens to accounts 0-3 and approve Barter
for (let i = 0; i < 4; i++) {
  const acc = accounts[i].address;
  const w = wallets[i];

  const mA = await wallets[0].writeContract({
    address: tokenA,
    abi: mockArtifact.abi,
    functionName: "mint",
    args: [acc, parseEther("10000")],
  });
  await pub.waitForTransactionReceipt({ hash: mA });

  const mB = await wallets[0].writeContract({
    address: tokenB,
    abi: mockArtifact.abi,
    functionName: "mint",
    args: [acc, parseEther("10000")],
  });
  await pub.waitForTransactionReceipt({ hash: mB });

  const appA = await w.writeContract({
    address: tokenA,
    abi: mockArtifact.abi,
    functionName: "approve",
    args: [barterAddress, parseEther("10000000")],
  });
  await pub.waitForTransactionReceipt({ hash: appA });

  const appB = await w.writeContract({
    address: tokenB,
    abi: mockArtifact.abi,
    functionName: "approve",
    args: [barterAddress, parseEther("10000000")],
  });
  await pub.waitForTransactionReceipt({ hash: appB });
}

console.log("Minted and approved tokens for accounts 0..3.");

// --- SEED SCENARIOS ---

// (1) Open, incoming to account 0 (Token AAA ↔ BOT)
// Account 1 proposes: gives 100 AAA, wants 0.5 BOT from Account 0
const h1 = await wallets[1].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "propose",
  args: [accounts[0].address, tokenA, parseEther("100"), zeroAddress, parseEther("0.5"), 86400n * 3n],
});
await pub.waitForTransactionReceipt({ hash: h1 });
console.log("Seeded #1: Open incoming to account 0 (100 AAA for 0.5 BOT)");

// (2) Open, outgoing from account 0 (BOT ↔ Token BBB)
// Account 0 proposes: gives 1.0 BOT, wants 80 BBB from Account 1
const h2 = await wallets[0].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "propose",
  args: [accounts[1].address, zeroAddress, parseEther("1"), tokenB, parseEther("80"), 86400n * 7n],
  value: parseEther("1"),
});
await pub.waitForTransactionReceipt({ hash: h2 });
console.log("Seeded #2: Open outgoing from account 0 (1.0 BOT for 80 BBB)");

// (3) Settled token ↔ token
// Account 0 proposes 50 AAA for 50 BBB to Account 1; Account 1 accepts
const h3 = await wallets[0].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "propose",
  args: [accounts[1].address, tokenA, parseEther("50"), tokenB, parseEther("50"), 86400n],
});
await pub.waitForTransactionReceipt({ hash: h3 });
const h3Accept = await wallets[1].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "accept",
  args: [3n],
});
await pub.waitForTransactionReceipt({ hash: h3Accept });
console.log("Seeded #3: Settled token ↔ token (50 AAA for 50 BBB)");

// (4) Cancelled
// Account 0 proposes 20 AAA for 1 BOT to Account 2; Account 0 cancels
const h4 = await wallets[0].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "propose",
  args: [accounts[2].address, tokenA, parseEther("20"), zeroAddress, parseEther("1"), 86400n],
});
await pub.waitForTransactionReceipt({ hash: h4 });
const h4Cancel = await wallets[0].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "cancel",
  args: [4n],
});
await pub.waitForTransactionReceipt({ hash: h4Cancel });
console.log("Seeded #4: Cancelled swap by proposer");

// (5) Rejected
// Account 2 proposes 30 BBB for 10 AAA to Account 0; Account 0 rejects
const h5 = await wallets[2].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "propose",
  args: [accounts[0].address, tokenB, parseEther("30"), tokenA, parseEther("10"), 86400n],
});
await pub.waitForTransactionReceipt({ hash: h5 });
const h5Reject = await wallets[0].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "reject",
  args: [5n],
});
await pub.waitForTransactionReceipt({ hash: h5Reject });
console.log("Seeded #5: Rejected swap by counterparty");

// (6) Expired Open (refundable)
// Account 3 proposes 0.2 BOT for 10 AAA with 1-hour duration; time warped past 1 hour
const h6 = await wallets[3].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "propose",
  args: [accounts[0].address, zeroAddress, parseEther("0.2"), tokenA, parseEther("10"), 3600n],
  value: parseEther("0.2"),
});
await pub.waitForTransactionReceipt({ hash: h6 });
// Warp time past 1 hour
await pub.request({ method: "evm_increaseTime", params: [4000] });
await pub.request({ method: "evm_mine", params: [] });
console.log("Seeded #6: Expired open swap (refundable by account 3)");

// (7) BOT ↔ Token the other way
// Account 1 proposes: gives 0.8 BOT, wants 100 BBB from Account 0
const h7 = await wallets[1].writeContract({
  address: barterAddress,
  abi: barterArtifact.abi,
  functionName: "propose",
  args: [accounts[0].address, zeroAddress, parseEther("0.8"), tokenB, parseEther("100"), 86400n * 2n],
  value: parseEther("0.8"),
});
await pub.waitForTransactionReceipt({ hash: h7 });
console.log("Seeded #7: Open BOT ↔ Token from Account 1 to Account 0");

// Assert final chain time is within 120s of wall clock
const finalBlock = await pub.getBlock();
const currentWallTime = Math.floor(Date.now() / 1000);
const diff = Math.abs(Number(finalBlock.timestamp) - currentWallTime);
console.log(`Final chain timestamp: ${finalBlock.timestamp} (real: ${currentWallTime}, diff: ${diff}s)`);
if (diff > 120) {
  throw new Error(`Chain timestamp skewed by ${diff}s, expected <= 120s`);
}

// Write .env.local
const envContent = [
  `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet`,
  `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
  `NEXT_PUBLIC_CONTRACT_968=${barterAddress}`,
  `NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployBlock}`,
  `NEXT_PUBLIC_TOKEN_A_968=${tokenA}`,
  `NEXT_PUBLIC_TOKEN_B_968=${tokenB}`,
].join("\n");
writeFileSync(".env.local", envContent + "\n");
console.log("\nWrote .env.local successfully.");

console.log("\n========================================================");
console.log(`Barter Local Stack Running on ${RPC}`);
console.log("========================================================");
console.log("Account Role Table:");
console.log("--------------------------------------------------------");
console.log(`Acc 0: ${accounts[0].address} (Proposer of #2, #3, #4; Counterparty of #1, #5, #6, #7)`);
console.log(`Acc 1: ${accounts[1].address} (Proposer of #1, #7; Counterparty of #2, #3)`);
console.log(`Acc 2: ${accounts[2].address} (Proposer of #5; Counterparty of #4)`);
console.log(`Acc 3: ${accounts[3].address} (Proposer of expired #6)`);
console.log("--------------------------------------------------------");
console.log("Local stack ready!");
