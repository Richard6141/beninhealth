import Link from "next/link";
import { ArrowLeft, FileWarning } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMesDemandesRectificationRecues } from "@/modules/patient/droits-donnees";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormulaireReponseRectification } from "./FormulaireReponseRectification";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/**
 * Demandes de rectification (F-CIT-13, type 2) adressees au professionnel
 * connecte : un patient a "Signale une erreur" sur une information que ce
 * professionnel a confirmee (RG-CIT-30). Reserve a medecin/infirmier ;
 * getMesDemandesRectificationRecues fait de toute facon la meme verification
 * cote Server Action (Zero Trust). Aucun ecran de ce depot n'ecrit encore le
 * statut "confirme" sur une information declaree (voir la limite deja
 * documentee dans src/modules/patient/informations-declarees.ts) : cet
 * ecran restera donc vide en usage reel tant que ce mecanisme n'existe pas
 * ailleurs, deja construit et teste pour ce jour-la.
 */
export default async function RectificationsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  const rolesAutorises = ["medecin", "infirmier"];
  if (!session.roles.some((role) => rolesAutorises.includes(role))) {
    redirect("/app/medecin");
  }

  const demandes = await getMesDemandesRectificationRecues();
  const enAttente = demandes.filter((demande) => demande.statut === "en_attente");
  const traitees = demandes.filter((demande) => demande.statut !== "en_attente");

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
        <h1 className="text-[28px] font-bold text-titre">Demandes de rectification</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Un patient a signalé une erreur sur une information que vous avez
          confirmée (F-CIT-13).
        </p>
      </header>

      {demandes.length === 0 ? (
        <Alert level="info" title="Aucune demande pour le moment">
          Les demandes de rectification apparaîtront ici dès qu&apos;un
          patient signale une erreur sur une information que vous avez
          confirmée.
        </Alert>
      ) : (
        <>
          <section aria-labelledby="titre-attente" className="flex flex-col gap-4">
            <h2 id="titre-attente" className="text-[20px] font-bold text-encre">
              À traiter ({enAttente.length})
            </h2>
            {enAttente.length === 0 ? (
              <p className="text-[13px] text-encre-attenuee">Aucune demande en attente.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {enAttente.map((demande) => (
                  <Card
                    key={demande.id}
                    title={demande.elementConteste ?? "Signalement général"}
                    description={formaterDateHeure(demande.dateCreation)}
                    actions={<Badge tone="warning">En attente</Badge>}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-2 rounded-champ border border-bordure bg-plan px-3 py-2.5">
                        <FileWarning size={16} className="mt-0.5 shrink-0 text-encre-attenuee" aria-hidden="true" />
                        <p className="text-[13px] text-encre">{demande.description}</p>
                      </div>
                      <FormulaireReponseRectification id={demande.id} />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {traitees.length > 0 ? (
            <section aria-labelledby="titre-traitees" className="flex flex-col gap-4">
              <h2 id="titre-traitees" className="text-[20px] font-bold text-encre">
                Traitées
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {traitees.map((demande) => (
                  <Card
                    key={demande.id}
                    title={demande.elementConteste ?? "Signalement général"}
                    description={formaterDateHeure(demande.dateCreation)}
                    actions={
                      <Badge tone={demande.statut === "escaladee" ? "critical" : "neutral"}>
                        {demande.statut === "escaladee" ? "Escaladée" : "Traitée"}
                      </Badge>
                    }
                  >
                    <p className="text-[13px] text-encre-secondaire">{demande.description}</p>
                    {demande.reponseProfessionnel ? (
                      <p className="mt-2 text-[13px] text-encre">
                        <span className="font-semibold">Votre réponse : </span>
                        {demande.reponseProfessionnel}
                      </p>
                    ) : null}
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
