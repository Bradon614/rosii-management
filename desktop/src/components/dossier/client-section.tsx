import { User } from "lucide-react";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import type { Client } from "@/types/api";

/**
 * Client of the dossier. No client page exists yet in the application, so this
 * section is intentionally not linked (nothing to navigate to).
 */
export function ClientSection({ client }: { client: Client }) {
  return (
    <SectionCard
      title="Client"
      description="Coordonnées enregistrées pour cette prestation"
      icon={User}
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
