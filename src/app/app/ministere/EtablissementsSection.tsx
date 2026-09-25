import { MapPin, UserCog, Users } from "lucide-react";
import type { EtablissementDetail } from "@/modules/identity/gestion-comptes";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CreationEtablissementModal } from "./CreationEtablissementModal";
import { libelleTypeEtablissement } from "./lib";

export interface EtablissementsSectionProps {
  etablissements: EtablissementDetail[];
}

/**
 * Section "Etablissements" (Phase 6, ecran ministere) : liste des
 * etablissements existants (listEtablissementsDetail, module
 * identity/gestion-comptes) et point d'entree de creation d'un nouvel
 * etablissement (CreationEtablissementModal).
 */
export function EtablissementsSection({ etablissements }: EtablissementsSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-encre-secondaire">
          {etablissements.length}{" "}
          {etablissements.length > 1 ? "etablissements enregistres" : "etablissement enregistre"}
        </p>
        <CreationEtablissementModal />
      </div>

      {etablissements.length === 0 ? (
        <Card>
          <p className="text-[13px] text-encre-attenuee">
            Aucun etablissement n&apos;est encore enregistre. Creez le premier
            etablissement du reseau avec le bouton ci-dessus.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {etablissements.map((etablissement) => (
            <Card
              key={etablissement.id}
              title={etablissement.nom}
              description={etablissement.identifiant}
              actions={<Badge tone="accent">{libelleTypeEtablissement(etablissement.type)}</Badge>}
            >
              <div className="flex flex-col gap-2 text-[13px] text-encre-secondaire">
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="shrink-0 text-encre-attenuee" aria-hidden="true" />
                  <span>{etablissement.localisation}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={14} className="shrink-0 text-encre-attenuee" aria-hidden="true" />
                  <span className="chiffres">
                    {etablissement.nombreProfessionnels}{" "}
                    {etablissement.nombreProfessionnels > 1 ? "professionnels" : "professionnel"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <UserCog size={14} className="shrink-0 text-encre-attenuee" aria-hidden="true" />
                  <span>
                    {etablissement.adminNomComplet ?? "Aucun administrateur identifie"}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
