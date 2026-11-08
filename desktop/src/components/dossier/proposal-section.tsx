import { FileText } from "lucide-react";

import { SectionCard } from "@/components/dossier/section-card";
import { ProposalLinesTable } from "@/components/proposals/proposal-lines-table";
import type { Proposal } from "@/types/api";

/** Commercial lines of the accepted proposal, with their totals. */
export function ProposalSection({ proposal }: { proposal: Proposal }) {
  const lineCount = proposal.lines.length;
  return (
    <SectionCard
      title="Proposition"
      description={
        lineCount === 1 ? "1 ligne commerciale" : `${lineCount} lignes commerciales`
      }
      icon={FileText}
    >
      <ProposalLinesTable lines={proposal.lines} total={proposal.proposalTotal} />
    </SectionCard>
  );
}
