import Link from "next/link";
import PageShell from "@/components/layout/PageShell";

export default function NotFound() {
  return (
    <PageShell title="Swap Not Found" description="The requested barter swap does not exist">
      <div className="py-12 w-full max-w-lg mx-auto text-center font-mono">
        <div className="p-8 border border-[#3A2F12] rounded-[8px] bg-[#1F190A] shadow-[0_4px_24px_rgba(0,0,0,0.4)] space-y-5">
          <div className="w-12 h-12 mx-auto bg-[#E0B341]/10 text-[#E0B341] rounded-full flex items-center justify-center text-xl">
            ⚖️
          </div>
          <h2 className="text-xl font-semibold text-[#F3E9CF]">
            Swap Record Not Found
          </h2>
          <p className="text-xs text-[#B3A57E] leading-relaxed max-w-sm mx-auto">
            The bilateral swap record or escrow identifier requested does not exist on this network.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded bg-[#E0B341] text-[#120E04] hover:bg-[#CFA233] transition-colors"
            >
              ← Propose New Swap
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
