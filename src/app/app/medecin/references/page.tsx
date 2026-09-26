import Link from "next/link";
import { getReferencesEnvoyees, getReferencesRecues, type ReferenceResume } from "@/modules/reference/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";

function formaterDate(dateISO: string): string {
  return new Date(dateISO).toLocaleDateString("fr-FR", { dateStyle: "long" });
}

function ListeReferences({ references, sensEnvoye }: { references: ReferenceResume[]; sensEnvoye: boolean }) {
  if (references.length === 0) {
    return (
      <EtatVide
        titre={sensEnvoye ? "Aucune reference envoyee" : "Aucune reference recue"}
        description={
          sensEnvoye
            ? "Les references que vous creez depuis une consultation apparaitront ici."
            : "Les references adressees a votre etablissement par d'autres medecins apparaitront ici."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {references.map((reference) => (
        <Link key={reference.id} href={`/app/medecin/references/${reference.id}`}>
          <Card
            title={reference.patientNomComplet}
            description={`${sensEnvoye ? reference.etablissementDestinationNom : reference.etablissementOrigineNom} · ${formaterDate(reference.dateCreation)}`}
            actions={
              <div className="flex flex-wrap gap-2">
                {reference.niveauUrgence === "urgente" ? <Badge tone="critical">Urgente</Badge> : null}
                <Badge tone={reference.statut === "ouverte" ? "accent" : "neutral"}>
                  {reference.statut === "ouverte" ? "Ouverte" : "Cloturee"}
                </Badge>
              </div>
            }
          >
            <p className="text-[13px] text-encre-secondaire">{reference.motif}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/**
 * Ecran "Mes references" (F-CLI-14) : deux sections, references que le
 * medecin connecte a envoyees (a suivre) et references adressees a son
 * propre etablissement (a traiter, ouvertes a tout medecin de
 * l'etablissement, voir getReferencesRecues).
 */
export default async function ReferencesPage() {
  const [envoyees, recues] = await Promise.all([getReferencesEnvoyees(), getReferencesRecues()]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-bold text-titre">Mes references</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          References vers un specialiste que vous avez envoyees, et references
          adressees a votre etablissement en attente de reponse.
        </p>
      </header>

      <section aria-labelledby="titre-recues" className="flex flex-col gap-4">
        <h2 id="titre-recues" className="text-[20px] font-bold text-encre">
          Recues par mon etablissement
        </h2>
        <ListeReferences references={recues} sensEnvoye={false} />
      </section>

      <section aria-labelledby="titre-envoyees" className="flex flex-col gap-4">
        <h2 id="titre-envoyees" className="text-[20px] font-bold text-encre">
          Envoyees par moi
        </h2>
        <ListeReferences references={envoyees} sensEnvoye={true} />
      </section>
    </div>
  );
}
