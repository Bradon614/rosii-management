import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";

import { DemandStatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDemandBudget } from "@/lib/demand-display";
import { demandsPath } from "@/lib/demands-api";
import { formatDate } from "@/lib/format";
import { demandTypeLabels } from "@/lib/labels";
import type { Demand } from "@/types/api";

interface DemandSelectProps {
  value: string;
  onChange: (demand: Demand | null) => void;
  invalid?: boolean;
  describedBy?: string;
}

function DemandSummary({ demand }: { demand: Demand }) {
  return (
    <div className="bg-muted/30 grid gap-2 rounded-md border px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{demand.clientName}</span>
        <DemandStatusBadge status={demand.status} />
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>Type : {demandTypeLabels[demand.type]}</span>
        <span>Date souhaitée : {formatDate(demand.requestedDate)}</span>
        <span>Budget : {formatDemandBudget(demand)}</span>
      </div>
      <Link
        to={`/demandes/${demand.id}`}
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs"
      >
        Voir la demande
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * Demand picker for a proposal (Feature 21). A proposal always targets an
 * existing demand; the client of the proposal is the demand's client, so it is
 * derived here and never chosen separately (F07 Decision A).
 */
export function DemandSelect({ value, onChange, invalid, describedBy }: DemandSelectProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const { data, error, loading } = useApiQuery<Demand[]>(
    demandsPath({ search: debouncedSearch }),
  );

  const [picked, setPicked] = useState<Demand | null>(null);
  // The selected demand is loaded on demand when the current search excludes it
  // (edit screen), so its summary is always accurate.
  const { data: fetched } = useApiQuery<Demand>(
    value && (!picked || picked.id !== value) ? `/api/demands/${value}` : null,
  );
  const selected = picked && picked.id === value ? picked : (fetched ?? null);

  const options = useMemo(() => {
    const list = data ?? [];
    if (value && selected && !list.some((demand) => demand.id === value)) {
      return [selected, ...list];
    }
    return list;
  }, [data, value, selected]);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="demand-search">Rechercher une demande</Label>
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="demand-search"
            type="search"
            className="pl-9"
            placeholder="Client, lieu, notes…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="proposal-demand">
          Demande <span className="text-destructive">*</span>
        </Label>
        <Select
          id="proposal-demand"
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            const demandId = event.target.value;
            const found = options.find((demand) => demand.id === demandId) ?? null;
            setPicked(found);
            onChange(found);
          }}
        >
          <option value="">Sélectionner une demande…</option>
          {options.map((demand) => (
            <option key={demand.id} value={demand.id}>
              {demand.clientName} — {demandTypeLabels[demand.type]}
              {demand.requestedDate ? ` · ${formatDate(demand.requestedDate)}` : ""}
            </option>
          ))}
        </Select>

        {loading ? (
          <p className="text-muted-foreground text-xs">Chargement des demandes…</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-xs">
            Impossible de charger la liste des demandes.
          </p>
        ) : null}
        {!loading && !error && options.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Aucune demande ne correspond.{" "}
            <Link to="/demandes/new" className="underline underline-offset-4">
              Créer une demande
            </Link>
          </p>
        ) : null}
      </div>

      {selected ? <DemandSummary demand={selected} /> : null}
    </div>
  );
}
