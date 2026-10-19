import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { activeBotChain, type BotChainId } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { dueAbi } from "@/lib/botchain/abi";

export type Invoice = {
  payee: Address;
  amount: bigint;
  createdAt: number;
  paid: boolean;
  cancelled: boolean;
  paidBy: Address;
};

export type InvoiceStatus = "pending" | "paid" | "cancelled";

export function invoiceStatus(inv: Invoice): InvoiceStatus {
  if (inv.paid) return "paid";
  if (inv.cancelled) return "cancelled";
  return "pending";
}

export function formatAmount(amount: bigint): string {
  const eth = Number(amount) / 1e18;
  return `${eth.toFixed(4)} BOT`;
}

export const MAX_MEMO_BYTES = 200;

const encoder = new TextEncoder();

export function memoByteLength(memo: string): number {
  return encoder.encode(memo).length;
}

export function formatTimestamp(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function readClient(): PublicClient {
  return createPublicClient({
    chain: activeBotChain,
    transport: http(undefined, { timeout: 15_000 }),
  }) as PublicClient;
}

export async function readInvoice(
  client: PublicClient,
  chainId: BotChainId,
  id: bigint,
): Promise<Invoice | null> {
  if (!isDeployed(chainId)) return null;

  const inv = await client.readContract({
    address: getDeployment(chainId).address,
    abi: dueAbi,
    functionName: "invoiceOf",
    args: [id],
  });

  if (!inv || inv.payee === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  return {
    payee: inv.payee,
    amount: inv.amount,
    createdAt: Number(inv.createdAt),
    paid: inv.paid,
    cancelled: inv.cancelled,
    paidBy: inv.paidBy,
  };
}

export async function readInvoiceMemo(
  client: PublicClient,
  chainId: BotChainId,
  id: bigint,
): Promise<string | null> {
  if (!isDeployed(chainId)) return null;
  const deployment = getDeployment(chainId);

  const logs = await client.getContractEvents({
    address: deployment.address,
    abi: dueAbi,
    eventName: "InvoiceCreated",
    args: { id },
    fromBlock: deployment.deployBlock,
  });

  if (logs.length === 0) return null;
  return logs[0].args.memo ?? null;
}
