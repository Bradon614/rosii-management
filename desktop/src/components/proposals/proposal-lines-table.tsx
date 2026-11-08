import { ListTree } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAriary, formatDecimal } from "@/lib/format";
import type { ProposalLine } from "@/types/api";

/**
 * Lines of a proposal. Unit prices and line totals are the snapshot values
 * stored by the backend; `lineTotal` is computed there (quantity × unitPrice),
 * never here.
 */
export function ProposalLinesTable({
  lines,
  total,
}: {
  lines: ProposalLine[];
  total: number;
}) {
  if (lines.length === 0) {
    return (
      <EmptyState
        icon={ListTree}
        title="Aucune ligne"
        description="Cette proposition ne contient aucune ligne commerciale."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Description</TableHead>
          <TableHead className="hidden sm:table-cell">Unité</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Quantité</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Prix unitaire</TableHead>
          <TableHead className="text-right">Total ligne</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell className="max-w-[28rem] font-medium">
              <span className="block break-words">{line.description}</span>
              {/* Narrow screens: the three hidden columns are folded here. */}
              <span className="text-muted-foreground mt-1 block text-xs font-normal tabular-nums sm:hidden">
                {line.unit ? `${line.unit} · ` : ""}
                {formatDecimal(line.quantity)} × {formatAriary(line.unitPrice)}
              </span>
              {line.notes ? (
                <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                  {line.notes}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-muted-foreground hidden sm:table-cell">
              {line.unit ?? "—"}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">
              {formatDecimal(line.quantity)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">
              {formatAriary(line.unitPrice)}
            </TableCell>
            <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
              {formatAriary(line.lineTotal)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4} className="hidden text-right font-medium sm:table-cell">
            Total de la proposition
          </TableCell>
          <TableCell className="text-right font-semibold sm:hidden">Total</TableCell>
          <TableCell
            className="text-right font-semibold whitespace-nowrap tabular-nums"
            data-testid="lines-total"
          >
            {formatAriary(total)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
