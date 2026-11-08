import { Link } from "react-router-dom";
import { ArrowUpRight, User } from "lucide-react";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import type { Client } from "@/types/api";

/**
 * Client of the dossier. Feature 19 added the client screens, so the section now
 * links to the client's own record (`/clients/{id}`); `client.id` is part of the
 * F17 payload, nothing is guessed.
 */
export function ClientSection({ client }: { client: Client }) {
  return (
    <SectionCard
      title="Client"
      description="Coordonnées enregistrées pour cette prestation"
      icon={User}
      action={
        <Link
          to={`/clients/${client.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          Fiche client
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <DetailList>
        <DetailItem label="Nom" value={client.name} />
        <DetailItem label="Téléphone principal" value={client.phone1} />
        <DetailItem label="Téléphone secondaire" value={client.phone2} />
        <DetailItem label="Email" value={client.email} />
      </DetailList>
    </SectionCard>
  );
}
