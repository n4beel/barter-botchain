import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import ProposeSwapForm from "@/components/barter/ProposeSwapForm";
import { app } from "@/lib/app-config";

export default function Home() {
  return (
    <PageShell
      title={app.name}
      description={app.tagline}
    >
      <BotChainGate
        noWalletNote="Viewing an existing swap at /s/[id] works without a wallet. Connect your wallet to propose a bilateral swap."
      >
        <ProposeSwapForm />
      </BotChainGate>
    </PageShell>
  );
}
