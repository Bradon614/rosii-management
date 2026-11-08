import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { clientsPath } from "@/lib/clients-api";
import type { Client } from "@/types/api";

interface ClientSelectProps {
  value: string;
  onChange: (clientId: string) => void;
  invalid?: boolean;
  describedBy?: string;
  /** Client already linked (edit screen): stays selectable whatever the search. */
  fallback?: { id: string; label: string } | null;
}

/**
 * Client picker for a demand (Feature 20). It reuses the F19 client API with
 * the backend's `search` parameter instead of loading every client: the patronne
 * types a name or phone, then picks one from the filtered list.
 */
export function ClientSelect({
  value,
  onChange,
  invalid,
  describedBy,
  fallback,
}: ClientSelectProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const { data, error, loading } = useApiQuery<Client[]>(clientsPath(debouncedSearch));
  const [selectedLabel, setSelectedLabel] = useState(fallback?.label ?? "");

  const options = useMemo(() => {
    const list = data ?? [];
    if (value && !list.some((client) => client.id === value)) {
      // Keep the current choice visible even when the search excludes it.
      return [
        { id: value, name: selectedLabel || fallback?.label || "Client sélectionné" },
        ...list,
      ];
    }
    return list;
  }, [data, value, selectedLabel, fallback?.label]);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="client-search">Rechercher un client</Label>
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="client-search"
            type="search"
            className="pl-9"
            placeholder="Nom, téléphone…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="demand-client">
          Client <span className="text-destructive">*</span>
        </Label>
        <Select
          id="demand-client"
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            const clientId = event.target.value;
            const found = options.find((client) => client.id === clientId);
            setSelectedLabel(found?.name ?? "");
            onChange(clientId);
          }}
        >
          <option value="">Sélectionner un client…</option>
          {options.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>

        {loading ? (
          <p className="text-muted-foreground text-xs">Chargement des clients…</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-xs">
            Impossible de charger la liste des clients.
          </p>
        ) : null}
        {!loading && !error && options.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Aucun client ne correspond.{" "}
            <Link to="/clients/new" className="underline underline-offset-4">
              Créer un client
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
