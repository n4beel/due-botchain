import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import CreateInvoiceForm from "@/components/due/CreateInvoiceForm";
import { NAV } from "@/lib/nav";
import { app } from "@/lib/app-config";

export default function Home() {
  return (
    <PageShell
      nav={NAV}
      title="Create an invoice"
      description={app.tagline}
    >
      <BotChainGate noWalletNote="Payment pages /i/[id] are viewable and payable from any wallet — share the link.">
        <CreateInvoiceForm />
      </BotChainGate>
    </PageShell>
  );
}
