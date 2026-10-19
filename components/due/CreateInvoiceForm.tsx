"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BaseError, ContractFunctionRevertedError, parseEther, parseEventLogs, type Hex } from "viem";
import { useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Panel from "@/components/ui/Panel";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import TxStatus, { type TxStage } from "@/components/ui/TxStatus";
import { useToast } from "@/components/ui/Toast";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { dueAbi } from "@/lib/botchain/abi";
import { formatAmount, MAX_MEMO_BYTES, memoByteLength } from "@/lib/due";

export default function CreateInvoiceForm() {
  const chainId = useChainId();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();

  const [amountStr, setAmountStr] = useState("");
  const [memo, setMemo] = useState("");
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState<Hex | null>(null);
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [createdAmount, setCreatedAmount] = useState<bigint | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("https://due.botchain-apps.dev");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : null;

  const receipt = useWaitForTransactionReceipt({
    hash: hash ?? undefined,
    query: { enabled: Boolean(hash) },
  });

  const settledHash = useRef<Hex | null>(null);

  useEffect(() => {
    if (!hash || settledHash.current === hash) return;
    if (!receipt.isSuccess && !receipt.isError) return;

    settledHash.current = hash;

    if (receipt.isSuccess) {
      setStage("confirmed");
      let idFromLog: bigint | null = null;
      if (receipt.data?.logs) {
        try {
          const logs = parseEventLogs({
            abi: dueAbi,
            logs: receipt.data.logs,
            eventName: "InvoiceCreated",
          });
          if (logs.length > 0 && logs[0].args.id !== undefined) {
            idFromLog = logs[0].args.id;
            setCreatedId(idFromLog);
          }
        } catch {
          // If event decoding failed, id stays null
        }
      }
      toast("success", "Invoice created", "Your shareable payment link is ready.");
    } else {
      setStage("failed");
      toast("error", "Transaction failed", "Invoice could not be created on chain.");
    }
  }, [hash, receipt.isSuccess, receipt.isError, receipt.data?.logs, toast]);

  const memoBytes = memoByteLength(memo);
  const memoTooLong = memoBytes > MAX_MEMO_BYTES;

  let parsedWei: bigint | null = null;
  let amountError: string | undefined = undefined;
  if (amountStr.trim()) {
    try {
      const sanitized = amountStr.trim().replace(",", ".");
      parsedWei = parseEther(sanitized);
      if (parsedWei <= 0n) {
        amountError = "Amount must be greater than zero.";
      }
    } catch {
      amountError = "Enter a valid BOT amount.";
    }
  }

  const handleCreate = useCallback(async () => {
    if (!deployment || !isBotChainId(chainId) || !parsedWei || parsedWei <= 0n || memoTooLong) return;

    setStage("signing");
    setHash(null);
    setCreatedId(null);
    settledHash.current = null;
    const targetAmount = parsedWei;
    setCreatedAmount(targetAmount);

    try {
      const txHash = await writeContractAsync({
        address: deployment.address,
        abi: dueAbi,
        functionName: "create",
        args: [targetAmount, memo.trim()],
        chainId,
      });
      setHash(txHash);
      setStage("pending");
    } catch (err) {
      setStage("idle");

      const reverted = err instanceof BaseError
        ? err.walk((e) => e instanceof ContractFunctionRevertedError)
        : null;

      if (reverted instanceof ContractFunctionRevertedError) {
        const error = reverted.data;
        if (error?.errorName === "ZeroAmount") {
          toast("error", "Zero amount", "Invoice amount must be greater than 0.");
          return;
        }
        if (error?.errorName === "MemoTooLong") {
          toast("error", "Memo too long", `Memo must be within ${MAX_MEMO_BYTES} bytes.`);
          return;
        }
      }

      const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
      if (/rejected|denied/i.test(message)) {
        toast("info", "Cancelled", "Transaction signature was cancelled.");
      } else {
        toast("error", "Could not create", message);
      }
    }
  }, [deployment, chainId, parsedWei, memo, memoTooLong, writeContractAsync, toast]);

  const handleReset = () => {
    setAmountStr("");
    setMemo("");
    setStage("idle");
    setHash(null);
    setCreatedId(null);
    setCreatedAmount(null);
    settledHash.current = null;
    setCopied(false);
  };

  const paymentUrl = createdId !== null ? `${origin}/i/${createdId.toString()}` : "";

  const handleCopyLink = () => {
    if (!paymentUrl) return;
    void navigator.clipboard.writeText(paymentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Checked FIRST per convention §3.3
  if (stage === "confirmed") {
    return (
      <div className="flex flex-col gap-4">
        <Panel>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] uppercase tracking-[0.06em]"
                style={{ color: "var(--text-secondary)" }}
              >
                Invoice Created
              </span>
              {createdId !== null && (
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                  style={{
                    background: "var(--accent-glow, rgba(79, 184, 201, 0.15))",
                    color: "var(--accent)",
                  }}
                >
                  #{createdId.toString()}
                </span>
              )}
            </div>

            {createdAmount !== null && (
              <div>
                <p className="text-[11px] uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
                  Requested Amount
                </p>
                <p className="text-[24px] font-semibold tracking-[-0.015em] text-[var(--accent)]">
                  {formatAmount(createdAmount)}
                </p>
              </div>
            )}

            {memo.trim() && (
              <div>
                <p className="text-[11px] uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
                  Memo
                </p>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {memo.trim()}
                </p>
              </div>
            )}

            {paymentUrl && (
              <div className="flex flex-col gap-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <label
                  className="text-[11px] uppercase tracking-[0.04em]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Shareable Payment Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={paymentUrl}
                    className="w-full font-mono text-[12px] px-3 py-2 rounded outline-none"
                    style={{
                      background: "var(--bg-base)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <Button size="sm" onClick={handleCopyLink} style={{ minWidth: "90px" }}>
                    {copied ? "Copied!" : "Copy Link"}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              {paymentUrl && (
                <a
                  href={`/i/${createdId?.toString()}`}
                  className="inline-flex items-center px-3 py-2 text-[12px] uppercase tracking-[0.04em] rounded font-medium no-underline"
                  style={{
                    background: "var(--accent)",
                    color: "#000",
                  }}
                >
                  View Payment Page
                </a>
              )}
              <Button size="sm" variant="ghost" onClick={handleReset}>
                Create Another Invoice
              </Button>
            </div>

            <TxStatus
              stage="confirmed"
              hash={hash}
              confirmedLabel="Invoice registered on BOT Chain"
            />
          </div>
        </Panel>
      </div>
    );
  }

  const isFormValid = Boolean(parsedWei && parsedWei > 0n && !amountError && !memoTooLong);

  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <div>
          <h2
            className="text-[14px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--text-primary)" }}
          >
            New Payment Request
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Create an invoice with an exact amount. Payers will send funds directly to your connected wallet.
          </p>
        </div>

        <Input
          label="Amount to request"
          placeholder="0.1"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          disabled={stage === "signing" || stage === "pending"}
          suffix="BOT"
          error={amountError}
          hint={!amountError ? "Must be paid in full and exact amount." : undefined}
        />

        <Input
          label="Memo (optional)"
          placeholder="e.g. Website design consulting"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          disabled={stage === "signing" || stage === "pending"}
          error={memoTooLong ? `${memoBytes} of ${MAX_MEMO_BYTES} bytes limit` : undefined}
          hint={
            memoTooLong
              ? undefined
              : `${memoBytes}/${MAX_MEMO_BYTES} bytes. Emitted in the transaction log; not stored in contract storage.`
          }
        />

        {stage === "idle" || stage === "failed" ? (
          <Button onClick={handleCreate} disabled={!isFormValid}>
            {parsedWei && parsedWei > 0n ? `Create Invoice for ${formatAmount(parsedWei)}` : "Create Invoice"}
          </Button>
        ) : null}

        <TxStatus
          stage={stage}
          hash={hash}
          failedLabel="Transaction failed — invoice was not created."
        />
      </div>
    </Panel>
  );
}
