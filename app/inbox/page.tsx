import PageShell from "@/components/layout/PageShell";
import InboxList from "@/components/barter/InboxList";

export default function InboxPage() {
  return (
    <PageShell
      title="Bilateral Swaps Inbox"
      description="Review incoming proposals waiting for your acceptance, active swaps you created, and past trades."
    >
      <InboxList />
    </PageShell>
  );
}
