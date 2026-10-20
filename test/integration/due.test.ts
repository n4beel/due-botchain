import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { dueAbi } from "@/lib/botchain/abi";

/**
 * The hand-written ABI, against the real compiled contract, on a real EVM.
 *
 * Drives the contract only through `dueAbi` and the app's own read helpers.
 *
 *   npm run test:integration
 *
 * Needs anvil on PATH and `forge build` output. Spends nothing.
 */

const PORT = 8546;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

/** anvil well-known accounts */
const KEY_ALICE = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_BOB = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
// anvil's account #2. The previous value was a corrupted copy of it and derived an address anvil
// never funds, so "refuses a second pay" was failing on an empty balance long before it reached
// AlreadyPaid — the contract was never at fault.
const KEY_CHARLIE = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: PublicClient;
let aliceWallet: WalletClient;
let bobWallet: WalletClient;
let charlieWallet: WalletClient;
let address: Address;
let deployBlock: bigint;

const alice = privateKeyToAccount(KEY_ALICE);
const bob = privateKeyToAccount(KEY_BOB);
const charlie = privateKeyToAccount(KEY_CHARLIE);

function revertName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName),
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data?.errorName;
}

function revertArgs(err: unknown): readonly unknown[] | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName),
  ) as { data?: { args?: readonly unknown[] } } | null;
  return found?.data?.args;
}

beforeAll(async () => {
  node = spawn("anvil", ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  publicClient = createPublicClient({ chain: local, transport: http() }) as PublicClient;
  aliceWallet = createWalletClient({ account: alice, chain: local, transport: http() });
  bobWallet = createWalletClient({ account: bob, chain: local, transport: http() });
  charlieWallet = createWalletClient({ account: charlie, chain: local, transport: http() });

  // anvil needs a moment to bind the port.
  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const artifact = JSON.parse(
    readFileSync(new URL("../../contracts/out/Due.sol/Due.json", import.meta.url), "utf8"),
  ) as { bytecode: { object: Hex } };

  const hash = await aliceWallet.deployContract({
    abi: dueAbi,
    bytecode: artifact.bytecode.object,
    account: alice,
    chain: local,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  address = receipt.contractAddress!;
  deployBlock = receipt.blockNumber;

  process.env.NEXT_PUBLIC_BOHR_RPC = RPC;
  process.env.NEXT_PUBLIC_BOTCHAIN_NETWORK = "testnet";
  process.env.NEXT_PUBLIC_CONTRACT_968 = address;
  process.env.NEXT_PUBLIC_DEPLOY_BLOCK_968 = String(deployBlock > 1n ? deployBlock - 1n : 1n);
}, 60_000);

afterAll(() => {
  node?.kill("SIGTERM");
});

describe("the Due ABI against the compiled contract", () => {
  it("deploys", () => {
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("reads a non-existent invoice as null through readInvoice", async () => {
    const { readInvoice } = await import("@/lib/due");
    const { isDeployed } = await import("@/lib/botchain/deployment");
    expect(isDeployed(CHAIN_ID)).toBe(true);

    const client = createPublicClient({ chain: local, transport: http() }) as PublicClient;
    await expect(readInvoice(client, CHAIN_ID, 999n)).resolves.toBeNull();
  });

  it("creates an invoice, emits InvoiceCreated log with memo, and returns id=1", async () => {
    const hash = await aliceWallet.writeContract({
      address,
      abi: dueAbi,
      functionName: "create",
      args: [100000000000000000n, "web design consulting"],
      account: alice,
      chain: local,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const logs = await publicClient.getContractEvents({
      address,
      abi: dueAbi,
      eventName: "InvoiceCreated",
      fromBlock: deployBlock,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].args.id).toBe(1n);
    expect(logs[0].args.payee?.toLowerCase()).toBe(alice.address.toLowerCase());
    expect(logs[0].args.amount).toBe(100000000000000000n);
    expect(logs[0].args.memo).toBe("web design consulting");

    const { readInvoice, readInvoiceMemo } = await import("@/lib/due");
    const client = createPublicClient({ chain: local, transport: http() }) as PublicClient;

    const inv = await readInvoice(client, CHAIN_ID, 1n);
    expect(inv).not.toBeNull();
    expect(inv!.payee.toLowerCase()).toBe(alice.address.toLowerCase());
    expect(inv!.amount).toBe(100000000000000000n);
    expect(inv!.paid).toBe(false);
    expect(inv!.cancelled).toBe(false);
    expect(inv!.paidBy).toBe("0x0000000000000000000000000000000000000000");

    const memo = await readInvoiceMemo(client, CHAIN_ID, 1n);
    expect(memo).toBe("web design consulting");
  });

  it("pays the invoice, transfers funds to payee, marks paid, and measures gas < 70_000n", async () => {
    const aliceBalanceBefore = await publicClient.getBalance({ address: alice.address });

    const hash = await bobWallet.writeContract({
      address,
      abi: dueAbi,
      functionName: "pay",
      args: [1n],
      value: 100000000000000000n,
      account: bob,
      chain: local,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    // Real measured transaction gas on EVM
    expect(receipt.gasUsed).toBeLessThan(70_000n);

    const aliceBalanceAfter = await publicClient.getBalance({ address: alice.address });
    expect(aliceBalanceAfter - aliceBalanceBefore).toBe(100000000000000000n);

    const { readInvoice } = await import("@/lib/due");
    const client = createPublicClient({ chain: local, transport: http() }) as PublicClient;
    const inv = await readInvoice(client, CHAIN_ID, 1n);

    expect(inv).not.toBeNull();
    expect(inv!.paid).toBe(true);
    expect(inv!.paidBy.toLowerCase()).toBe(bob.address.toLowerCase());

    const paidLogs = await publicClient.getContractEvents({
      address,
      abi: dueAbi,
      eventName: "InvoicePaid",
      fromBlock: deployBlock,
    });
    expect(paidLogs.length).toBeGreaterThanOrEqual(1);
    const lastPaid = paidLogs[paidLogs.length - 1];
    expect(lastPaid.args.id).toBe(1n);
    expect(lastPaid.args.paidBy?.toLowerCase()).toBe(bob.address.toLowerCase());
    expect(lastPaid.args.payee?.toLowerCase()).toBe(alice.address.toLowerCase());
  });

  it("refuses a second pay and reverts AlreadyPaid", async () => {
    try {
      await publicClient.simulateContract({
        account: charlie,
        address,
        abi: dueAbi,
        functionName: "pay",
        args: [1n],
        value: 100000000000000000n,
      });
      throw new Error("second pay did not revert");
    } catch (err) {
      expect(revertName(err)).toBe("AlreadyPaid");
      expect(revertArgs(err)?.[0]).toBe(1n);
    }
  });

  it("refuses wrong amount and reverts WrongAmount", async () => {
    // Create invoice 2
    const hash = await aliceWallet.writeContract({
      address,
      abi: dueAbi,
      functionName: "create",
      args: [200000000000000000n, "invoice 2"],
      account: alice,
      chain: local,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // Underpayment
    try {
      await publicClient.simulateContract({
        account: bob,
        address,
        abi: dueAbi,
        functionName: "pay",
        args: [2n],
        value: 100000000000000000n, // Expected 200000000000000000n
      });
      throw new Error("underpayment did not revert");
    } catch (err) {
      expect(revertName(err)).toBe("WrongAmount");
      const args = revertArgs(err);
      expect(args?.[0]).toBe(2n);
      expect(args?.[1]).toBe(200000000000000000n);
      expect(args?.[2]).toBe(100000000000000000n);
    }

    // Overpayment
    try {
      await publicClient.simulateContract({
        account: bob,
        address,
        abi: dueAbi,
        functionName: "pay",
        args: [2n],
        value: 300000000000000000n,
      });
      throw new Error("overpayment did not revert");
    } catch (err) {
      expect(revertName(err)).toBe("WrongAmount");
    }
  });

  it("cancels an unpaid invoice by payee and blocks subsequent payment", async () => {
    // Create invoice 3
    const createHash = await aliceWallet.writeContract({
      address,
      abi: dueAbi,
      functionName: "create",
      args: [50000000000000000n, "invoice 3 to cancel"],
      account: alice,
      chain: local,
    });
    await publicClient.waitForTransactionReceipt({ hash: createHash });

    // Payee cancels
    const cancelHash = await aliceWallet.writeContract({
      address,
      abi: dueAbi,
      functionName: "cancel",
      args: [3n],
      account: alice,
      chain: local,
    });
    const cancelReceipt = await publicClient.waitForTransactionReceipt({ hash: cancelHash });
    expect(cancelReceipt.status).toBe("success");

    const { readInvoice } = await import("@/lib/due");
    const client = createPublicClient({ chain: local, transport: http() }) as PublicClient;
    const inv = await readInvoice(client, CHAIN_ID, 3n);
    expect(inv?.cancelled).toBe(true);

    // Stranger tries to pay cancelled invoice
    try {
      await publicClient.simulateContract({
        account: bob,
        address,
        abi: dueAbi,
        functionName: "pay",
        args: [3n],
        value: 50000000000000000n,
      });
      throw new Error("paying cancelled invoice did not revert");
    } catch (err) {
      expect(revertName(err)).toBe("AlreadyCancelled");
      expect(revertArgs(err)?.[0]).toBe(3n);
    }
  });

  it("refuses cancel by a stranger and reverts NotPayee", async () => {
    // Create invoice 4
    const createHash = await aliceWallet.writeContract({
      address,
      abi: dueAbi,
      functionName: "create",
      args: [50000000000000000n, "invoice 4"],
      account: alice,
      chain: local,
    });
    await publicClient.waitForTransactionReceipt({ hash: createHash });

    // Bob tries to cancel Alice's invoice
    try {
      await publicClient.simulateContract({
        account: bob,
        address,
        abi: dueAbi,
        functionName: "cancel",
        args: [4n],
      });
      throw new Error("stranger cancelling did not revert");
    } catch (err) {
      expect(revertName(err)).toBe("NotPayee");
      expect(revertArgs(err)?.[0]).toBe(4n);
    }
  });

  it("agrees with the contract on MAX_MEMO_BYTES", async () => {
    const { MAX_MEMO_BYTES } = await import("@/lib/due");
    const onChain = await publicClient.readContract({
      address,
      abi: dueAbi,
      functionName: "MAX_MEMO_BYTES",
    });
    expect(Number(onChain)).toBe(MAX_MEMO_BYTES);
  });
});
