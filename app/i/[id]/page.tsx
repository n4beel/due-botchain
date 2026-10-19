import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import InvoicePaymentCard from "@/components/due/InvoicePaymentCard";
import { NAV } from "@/lib/nav";
import { activeBotChain } from "@/lib/botchain/chain";
import { isDeployed } from "@/lib/botchain/deployment";
import { readClient, readInvoice, readInvoiceMemo, formatAmount } from "@/lib/due";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Invoice #${id} — Due`,
    description: `Pay invoice #${id} on BOT Chain.`,
  };
}

export default async function InvoicePage({ params }: Params) {
  const { id } = await params;

  if (!/^\d+$/.test(id) || BigInt(id) === 0n) {
    return (
      <PageShell nav={NAV} title="Invalid Invoice" description="Invoice IDs are positive numbers.">
        <Panel>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--danger)" }}>
            The requested invoice ID &ldquo;{id}&rdquo; is not a valid invoice number.
          </p>
          <div className="mt-4">
            <Link
              href="/"
              className="text-[12px] uppercase tracking-[0.04em] underline"
              style={{ color: "var(--accent)" }}
            >
              ← Back to Create Invoice
            </Link>
          </div>
        </Panel>
      </PageShell>
    );
  }

  const invoiceId = BigInt(id);

  if (!isDeployed(activeBotChain.id)) {
    return (
      <PageShell nav={NAV} title={`Invoice #${id}`} description="BOT Chain payment request">
        <Panel>
          <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            No contract is configured for {activeBotChain.name}, so there is nothing to look up.
          </p>
        </Panel>
      </PageShell>
    );
  }

  let invoice;
  try {
    invoice = await readInvoice(readClient(), activeBotChain.id, invoiceId);
  } catch {
    // §3.10: Distinguish "unknown" from "empty" / "not found"
    return (
      <PageShell nav={NAV} title={`Invoice #${id}`} description="BOT Chain payment request">
        <Panel>
          <p
            className="text-[11px] uppercase tracking-[0.04em] mb-2"
            style={{ color: "var(--warning)" }}
          >
            Network unreachable
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Could not reach {activeBotChain.name} to read invoice #{id}. This is unknown, not not-found — reload to try again.
          </p>
        </Panel>
      </PageShell>
    );
  }

  // §3.10: If invoiceOf returns 0x0 for payee: "Invoice not found" (not a load error).
  if (!invoice) {
    return (
      <PageShell nav={NAV} title={`Invoice #${id}`} description="BOT Chain payment request">
        <Panel>
          <p
            className="text-[11px] uppercase tracking-[0.04em] mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Invoice Not Found
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            No invoice exists on chain with ID #{id}. Check the link or create a new invoice.
          </p>
          <div className="mt-4">
            <Link
              href="/"
              className="text-[12px] uppercase tracking-[0.04em] underline"
              style={{ color: "var(--accent)" }}
            >
              ← Create a new invoice
            </Link>
          </div>
        </Panel>
      </PageShell>
    );
  }

  let memo: string | null = null;
  try {
    memo = await readInvoiceMemo(readClient(), activeBotChain.id, invoiceId);
  } catch {
    memo = null;
  }

  return (
    <PageShell
      nav={NAV}
      title={`Invoice #${id}`}
      description={`Payment request for ${formatAmount(invoice.amount)}`}
    >
      <InvoicePaymentCard
        id={id}
        initialInvoice={{
          payee: invoice.payee,
          amount: invoice.amount.toString(),
          createdAt: invoice.createdAt,
          paid: invoice.paid,
          cancelled: invoice.cancelled,
          paidBy: invoice.paidBy,
        }}
        memo={memo}
      />
    </PageShell>
  );
}
