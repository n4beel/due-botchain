"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BaseError, ContractFunctionRevertedError, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import TxStatus, { type TxStage } from "@/components/ui/TxStatus";
import BotChainGate from "@/components/botchain/BotChainGate";
import { useToast } from "@/components/ui/Toast";
import { addressUrl, isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { dueAbi } from "@/lib/botchain/abi";
import { formatAmount, formatTimestamp, invoiceStatus, type Invoice } from "@/lib/due";

interface InvoicePaymentCardProps {
  id: string;
  initialInvoice: {
    payee: Hex;
    amount: string;
    createdAt: number;
    paid: boolean;
    cancelled: boolean;
    paidBy: Hex;
  };
  memo: string | null;
}

export default function InvoicePaymentCard({
  id,
  initialInvoice,
  memo,
}: InvoicePaymentCardProps) {
  const chainId = useChainId();
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();

  const [invoice, setInvoice] = useState<Invoice>({
    payee: initialInvoice.payee,
    amount: BigInt(initialInvoice.amount),
    createdAt: initialInvoice.createdAt,
    paid: initialInvoice.paid,
    cancelled: initialInvoice.cancelled,
    paidBy: initialInvoice.paidBy,
  });

  const [stage, setStage] = useState<TxStage>("idle");
  const currentStage: TxStage = stage; // alias preserves full union type in JSX
  const [hash, setHash] = useState<Hex | null>(null);
  const [actionType, setActionType] = useState<"pay" | "cancel">("pay");

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : null;
  const invoiceId = BigInt(id);

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
      if (actionType === "pay") {
        setInvoice((prev) => ({
          ...prev,
          paid: true,
          paidBy: (address as Hex) || prev.paidBy,
        }));
        toast("success", "Invoice paid", "Payment transferred directly to payee.");
      } else {
        setInvoice((prev) => ({
          ...prev,
          cancelled: true,
        }));
        toast("success", "Invoice cancelled", "This invoice is now marked cancelled.");
      }
    } else {
      setStage("failed");
      toast("error", "Transaction failed", "The operation could not be confirmed on chain.");
    }
  }, [hash, receipt.isSuccess, receipt.isError, actionType, address, toast]);

  const handlePay = useCallback(async () => {
    if (!deployment || !isBotChainId(chainId)) return;

    setActionType("pay");
    setStage("signing");
    setHash(null);
    settledHash.current = null;

    try {
      const txHash = await writeContractAsync({
        address: deployment.address,
        abi: dueAbi,
        functionName: "pay",
        args: [invoiceId],
        value: invoice.amount,
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
        if (error?.errorName === "AlreadyPaid") {
          toast("error", "Already paid", "This invoice has already been paid.");
          setInvoice((prev) => ({ ...prev, paid: true }));
          return;
        }
        if (error?.errorName === "AlreadyCancelled") {
          toast("error", "Already cancelled", "This invoice was cancelled by the payee.");
          setInvoice((prev) => ({ ...prev, cancelled: true }));
          return;
        }
        if (error?.errorName === "WrongAmount") {
          toast("error", "Wrong amount", "Payment value does not match the invoice amount.");
          return;
        }
        if (error?.errorName === "NotFound") {
          toast("error", "Invoice not found", "This invoice does not exist.");
          return;
        }
      }

      const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
      if (/rejected|denied/i.test(message)) {
        toast("info", "Cancelled", "Payment signature was cancelled.");
      } else {
        toast("error", "Could not pay", message);
      }
    }
  }, [deployment, chainId, invoiceId, invoice.amount, writeContractAsync, toast]);

  const handleCancel = useCallback(async () => {
    if (!deployment || !isBotChainId(chainId)) return;

    setActionType("cancel");
    setStage("signing");
    setHash(null);
    settledHash.current = null;

    try {
      const txHash = await writeContractAsync({
        address: deployment.address,
        abi: dueAbi,
        functionName: "cancel",
        args: [invoiceId],
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
        if (error?.errorName === "NotPayee") {
          toast("error", "Not payee", "Only the payee can cancel this invoice.");
          return;
        }
        if (error?.errorName === "AlreadyPaid") {
          toast("error", "Already paid", "Cannot cancel an already paid invoice.");
          setInvoice((prev) => ({ ...prev, paid: true }));
          return;
        }
        if (error?.errorName === "AlreadyCancelled") {
          toast("error", "Already cancelled", "Invoice is already cancelled.");
          setInvoice((prev) => ({ ...prev, cancelled: true }));
          return;
        }
      }

      const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
      if (/rejected|denied/i.test(message)) {
        toast("info", "Cancelled", "Cancellation signature was cancelled.");
      } else {
        toast("error", "Could not cancel", message);
      }
    }
  }, [deployment, chainId, invoiceId, writeContractAsync, toast]);

  const status = invoiceStatus(invoice);
  const isPayee = address && address.toLowerCase() === invoice.payee.toLowerCase();

  return (
    <div className="flex flex-col gap-4">
      {/* 
        §3.11: Gate ONLY the pay button.
        All read-only info renders outside gate, accessible to a stranger with NO wallet.
      */}
      <Panel>
        <div className="flex flex-col gap-4">
          <div
            className="flex items-center justify-between pb-3"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div>
              <span
                className="text-[11px] uppercase tracking-[0.06em]"
                style={{ color: "var(--text-secondary)" }}
              >
                Payment Request
              </span>
              <h2
                className="text-[18px] font-semibold tracking-[-0.01em]"
                style={{ color: "var(--text-primary)" }}
              >
                Invoice #{id}
              </h2>
            </div>
            <div>
              {status === "paid" && <Badge variant="confirmed">Paid</Badge>}
              {status === "cancelled" && <Badge variant="error">Cancelled</Badge>}
              {status === "pending" && <Badge variant="pending">Pending Payment</Badge>}
            </div>
          </div>

          <div>
            <span
              className="text-[11px] uppercase tracking-[0.04em]"
              style={{ color: "var(--text-tertiary)" }}
            >
              Amount Requested
            </span>
            <div
              className="text-[32px] md:text-[36px] font-bold tracking-[-0.02em] mt-1"
              style={{ color: "var(--accent)" }}
            >
              {formatAmount(invoice.amount)}
            </div>
          </div>

          {memo && (
            <div
              className="p-3.5 rounded"
              style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)" }}
            >
              <span
                className="text-[10px] uppercase tracking-[0.06em]"
                style={{ color: "var(--text-secondary)" }}
              >
                Memo
              </span>
              <p
                className="mt-1 text-[13px] leading-relaxed break-words"
                style={{ color: "var(--text-primary)" }}
              >
                {memo}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2.5 text-[12px] pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span style={{ color: "var(--text-tertiary)" }}>Payee Address</span>
              <a
                href={addressUrl(chainId, invoice.payee)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[12px] underline break-all"
                style={{ color: "var(--accent)" }}
              >
                {invoice.payee}
              </a>
            </div>

            <div className="flex items-center justify-between">
              <span style={{ color: "var(--text-tertiary)" }}>Created At</span>
              <span style={{ color: "var(--text-secondary)" }}>
                {formatTimestamp(invoice.createdAt)}
              </span>
            </div>

            {invoice.paid && (
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-2.5"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <span style={{ color: "var(--success)" }}>Paid By</span>
                <a
                  href={addressUrl(chainId, invoice.paidBy)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[12px] underline break-all"
                  style={{ color: "var(--success)" }}
                >
                  {invoice.paidBy}
                </a>
              </div>
            )}

            {invoice.cancelled && (
              <div
                className="pt-2 text-[12px]"
                style={{ color: "var(--danger)", borderTop: "1px solid var(--border-subtle)" }}
              >
                This invoice was cancelled by the payee. It can no longer be paid.
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* ONLY inside BotChainGate: the interactive pay / cancel controls */}
      {status === "pending" && (
        <BotChainGate noWalletNote="This invoice is viewable by anyone. To pay it, connect a BOT Chain wallet.">
          <Panel>
            {/* §3.3: Order post-transaction branches so stage === 'confirmed' wins FIRST */}
            {stage === "confirmed" ? (
              <div className="flex flex-col gap-3">
                <TxStatus
                  stage="confirmed"
                  hash={hash}
                  confirmedLabel={
                    actionType === "pay"
                      ? `Paid ${formatAmount(invoice.amount)} on chain`
                      : "Invoice cancelled on chain"
                  }
                />
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {actionType === "pay"
                    ? `Payment was sent directly to payee ${invoice.payee}.`
                    : "The invoice was cancelled. It cannot be paid."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {isPayee ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      You created this invoice. You can cancel it while it remains unpaid.
                    </p>
                    {stage === "idle" || stage === "failed" ? (
                      <Button
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={currentStage === "signing" || currentStage === "pending"}
                        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                      >
                        Cancel Invoice
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      Connect your wallet and pay exactly {formatAmount(invoice.amount)} to settle this invoice.
                    </p>
                    {stage === "idle" || stage === "failed" ? (
                      <Button
                        onClick={handlePay}
                        disabled={currentStage === "signing" || currentStage === "pending"}
                      >
                        Pay {formatAmount(invoice.amount)}
                      </Button>
                    ) : null}
                  </div>
                )}

                <TxStatus
                  stage={stage}
                  hash={hash}
                  failedLabel={
                    actionType === "pay"
                      ? "Payment failed — no funds were transferred."
                      : "Cancellation failed."
                  }
                />
              </div>
            )}
          </Panel>
        </BotChainGate>
      )}
    </div>
  );
}
