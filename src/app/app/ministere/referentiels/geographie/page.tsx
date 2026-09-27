import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getReferentielGeographie } from "@/modules/administration/referentiel-geographie";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EtatVide } from "@/components/ui/EtatVide";

/**
 * Ecran "Référentiel géographie" (F-ADM-04 du pack, partie 7), réservé au
 * ministère (admin_national). Consultation seule : voir la docstring de
 * src/modules/administration/referentiel-geographie.ts pour la limite
 * assumée (aucun champ "actif", aucune action d'écriture cette prise).
 * Un `<details>` par département, sans composant client : rien n'est
 * interactif au-delà du repli natif du navigateur.
 */
export default async function ReferentielGeographiePage() {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_national")) {
    redirect("/app");
  }

  const departements = await getReferentielGeographie();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/ministere"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
        <h1 className="text-[28px] font-bold text-titre">Référentiel géographie</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Les 12 départements du Bénin, leurs communes et leurs zones sanitaires, tels qu&apos;utilisés
          par la fiche d&apos;un établissement. Consultation seule : ce référentiel n&apos;a pas encore
          d&apos;action d&apos;administration (ajout, désactivation) dans cette version.
        </p>
      </header>

      {!departements || departements.length === 0 ? (
        <EtatVide
          titre="Aucun département"
          description="Le référentiel géographique n'a pas encore été initialisé."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {departements.map((departement) => (
            <Card key={departement.id} className="p-0 sm:p-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="chiffres rounded-champ bg-surface-appui px-2 py-0.5 text-[12px] font-semibold text-encre-secondaire">
                      {departement.code}
                    </span>
                    <span className="text-[16px] font-bold text-titre">{departement.nom}</span>
                  </div>
                  <span className="text-[13px] text-encre-attenuee">
                    {departement.communes.length} commune{departement.communes.length > 1 ? "s" : ""} ·{" "}
                    {departement.zonesSanitaires.length} zone{departement.zonesSanitaires.length > 1 ? "s" : ""}{" "}
                    sanitaire{departement.zonesSanitaires.length > 1 ? "s" : ""}
                  </span>
                </summary>

                <div className="flex flex-col gap-4 border-t border-bordure px-5 py-4">
                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                      Communes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {departement.communes.map((commune) => (
                        <span
                          key={commune.id}
                          className="inline-flex items-center gap-1.5 rounded-champ border border-bordure bg-plan px-2.5 py-1 text-[13px] text-encre"
                        >
                          {commune.nom}
                          {commune.nombreEtablissements > 0 ? (
                            <Badge tone="neutral">{commune.nombreEtablissements}</Badge>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                      Zones sanitaires
                    </p>
                    {departement.zonesSanitaires.length === 0 ? (
                      <p className="text-[13px] text-encre-attenuee">Aucune zone sanitaire pour ce département.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {departement.zonesSanitaires.map((zone) => (
                          <span
                            key={zone.id}
                            className="inline-flex items-center gap-1.5 rounded-champ border border-bordure bg-plan px-2.5 py-1 text-[13px] text-encre"
                          >
                            {zone.nom}
                            {zone.nombreEtablissements > 0 ? (
                              <Badge tone="neutral">{zone.nombreEtablissements}</Badge>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
