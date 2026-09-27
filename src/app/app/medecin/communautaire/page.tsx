import { MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getMesSuivisCommunautaires,
  getPersonnesEnregistrees,
  getSignesDangerParType,
  type SuiviCommunautaireResume,
} from "@/modules/communautaire/actions";
import { LIBELLES_TYPE_VISITE } from "@/modules/communautaire/communautaire-catalogue";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { ModuleDesactive } from "@/components/ModuleDesactive";
import { FormulaireSuiviCommunautaire } from "./FormulaireSuiviCommunautaire";

const tonesTypeVisite: Record<string, BadgeTone> = {
  suivi_general: "neutral",
  enfant_moins_5_ans: "good",
  femme_enceinte: "accent",
  suivi_apres_sortie: "info",
  sensibilisation: "warning",
  vaccination: "good",
  depistage: "info",
  autre: "neutral",
  suivi_grossesse: "accent",
};

function libelleTypeVisite(type: string): string {
  return LIBELLES_TYPE_VISITE[type as keyof typeof LIBELLES_TYPE_VISITE] ?? type;
}

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return date;
  }
}

function CarteVisite({ visite }: { visite: SuiviCommunautaireResume }) {
  return (
    <Card
      title={visite.beneficiaireNom}
      description={formaterDateHeure(visite.dateVisite)}
      actions={
        <Badge tone={tonesTypeVisite[visite.typeVisite] ?? "neutral"}>
          {libelleTypeVisite(visite.typeVisite)}
        </Badge>
      }
    >
      <div className="flex flex-col gap-2">
        {visite.localisation ? (
          <p className="text-[13px] text-encre-secondaire">
            <span className="font-semibold text-encre">Lieu : </span>
            {visite.localisation}
          </p>
        ) : null}
        {visite.notes ? (
          <p className="whitespace-pre-wrap text-[13px] text-encre-secondaire">{visite.notes}</p>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Espace agent communautaire (module suivi communautaire, construit pour
 * donner un vrai tableau de bord a ce role, jusqu'ici sans aucune
 * implementation malgre une permission declaree, voir
 * src/security/permissions.ts). Reserve au role "agent_communautaire" ;
 * getMesSuivisCommunautaires fait de toute facon la meme verification cote
 * Server Action (Zero Trust, pas de confiance dans le seul routage cote
 * ecran), a l'image de src/app/app/medecin/laboratoire/page.tsx.
 */
export default async function CommunautairePage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  if (!session.roles.includes("agent_communautaire")) {
    redirect("/app/medecin");
  }

  if (!(await estFonctionnaliteActive("community.module"))) {
    return <ModuleDesactive cle="community.module" />;
  }

  const [visites, personnes, signesDangerParType] = await Promise.all([
    getMesSuivisCommunautaires(),
    getPersonnesEnregistrees(),
    getSignesDangerParType(),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Suivi communautaire
        </p>
        <h1 className="text-[28px] font-bold text-titre">Mes visites de terrain</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Enregistrez vos visites (vaccination, dépistage, suivi de grossesse,
          sensibilisation) et retrouvez votre historique complet.
        </p>
      </header>

      <FormulaireSuiviCommunautaire personnes={personnes} signesDangerParType={signesDangerParType} />

      <section aria-labelledby="titre-historique" className="flex flex-col gap-4">
        <h2 id="titre-historique" className="text-[20px] font-bold text-encre">
          Historique
        </h2>
        {visites.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
                <MapPin size={20} aria-hidden="true" />
              </span>
              <p className="text-[14px] font-semibold text-encre">
                Aucune visite enregistrée
              </p>
              <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
                Vos visites de terrain apparaîtront ici une fois enregistrées
                avec le formulaire ci-dessus.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visites.map((visite) => (
              <CarteVisite key={visite.id} visite={visite} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
