import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getReferencesCommunautairesEtablissement } from "@/modules/communautaire/actions";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { ModuleDesactive } from "@/components/ModuleDesactive";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { BoutonMarquerVue } from "./BoutonMarquerVue";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/**
 * References communautaires (F-COM-03, RG-COM-10) : creees automatiquement
 * quand un agent communautaire coche un signe de danger pendant une visite
 * de terrain (src/modules/communautaire/actions.ts, creerSuiviCommunautaireAction).
 * Reserve au personnel soignant et administratif de l'etablissement
 * (medecin, infirmier, admin_etablissement : role RECEPTIONIST absent de ce
 * depot, meme routage que le reste de F-RDV-04/05) ;
 * getReferencesCommunautairesEtablissement fait de toute facon la meme
 * verification cote Server Action (Zero Trust). RG-COM-11 : jamais de
 * diagnostic ni de traitement affiche ici, uniquement le motif (signes de
 * danger coches) et un bouton pour marquer la reference prise en compte.
 */
export default async function ReferencesCommunautairesPage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  const rolesAutorises = ["medecin", "infirmier", "admin_etablissement"];
  if (!session.roles.some((role) => rolesAutorises.includes(role))) {
    redirect("/app/medecin");
  }

  if (!(await estFonctionnaliteActive("community.module"))) {
    return <ModuleDesactive cle="community.module" />;
  }

  const references = await getReferencesCommunautairesEtablissement();
  const enAttente = references.filter((reference) => reference.statut === "en_attente");
  const dejaVues = references.filter((reference) => reference.statut === "vue");

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/medecin"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <h1 className="text-[28px] font-bold text-titre">Références communautaires</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Signes de danger signalés par les agents communautaires de votre
          établissement lors de leurs visites de terrain (F-COM-03).
        </p>
      </header>

      {references.length === 0 ? (
        <Alert level="info" title="Aucune référence pour le moment">
          Les références apparaîtront ici dès qu&apos;un agent communautaire
          coche un signe de danger pendant une visite.
        </Alert>
      ) : (
        <>
          <section aria-labelledby="titre-attente" className="flex flex-col gap-4">
            <h2 id="titre-attente" className="text-[20px] font-bold text-encre">
              À prendre en compte ({enAttente.length})
            </h2>
            {enAttente.length === 0 ? (
              <p className="text-[13px] text-encre-attenuee">Aucune référence en attente.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {enAttente.map((reference) => (
                  <Card
                    key={reference.id}
                    title={reference.beneficiaireNom}
                    description={formaterDateHeure(reference.dateCreation)}
                    actions={<Badge tone="critical">Urgent</Badge>}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-2 rounded-champ border border-critique bg-critique-clair px-3 py-2.5">
                        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-critique" aria-hidden="true" />
                        <p className="text-[13px] font-semibold text-critique">{reference.motif}</p>
                      </div>
                      <p className="text-[12.5px] text-encre-attenuee">
                        Signalé par {reference.agentNomComplet}
                      </p>
                      <BoutonMarquerVue id={reference.id} />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {dejaVues.length > 0 ? (
            <section aria-labelledby="titre-vues" className="flex flex-col gap-4">
              <h2 id="titre-vues" className="text-[20px] font-bold text-encre">
                Déjà prises en compte
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {dejaVues.map((reference) => (
                  <Card
                    key={reference.id}
                    title={reference.beneficiaireNom}
                    description={formaterDateHeure(reference.dateCreation)}
                    actions={<Badge tone="neutral">Vue</Badge>}
                  >
                    <p className="text-[13px] text-encre-secondaire">{reference.motif}</p>
                    <p className="mt-2 text-[12.5px] text-encre-attenuee">
                      Signalé par {reference.agentNomComplet}
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
