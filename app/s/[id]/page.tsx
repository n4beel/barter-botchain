import PageShell from "@/components/layout/PageShell";
import SwapMirrorView from "@/components/barter/SwapMirrorView";

interface SwapPageProps {
  params: Promise<{ id: string }>;
}

export default async function SwapPage({ params }: SwapPageProps) {
  const { id } = await params;
  let swapId: bigint;
  try {
    swapId = BigInt(id);
  } catch {
    return (
      <PageShell title="Invalid Swap">
        <div className="p-8 text-center text-[#E0B341] font-mono text-[14px]">
          Invalid swap identifier: {id}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SwapMirrorView id={swapId} />
    </PageShell>
  );
}
