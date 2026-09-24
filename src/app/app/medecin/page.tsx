import type { LucideIcon } from "lucide-react";
import { Bell, CalendarClock, Users } from "lucide-react";
import { getSession } from "@/lib/session";
import type { NomRole } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

/**
 * Libellés des rôles applicatifs. Repris de src/app/app/layout.tsx (non
 * exporté depuis ce fichier) pour rester cohérent avec l'en-tête de
 * l'espace authentifié sans y toucher.
 */
const libellesRole: Record<NomRole, string> = {
  patient: "Patient",
  medecin: "Médecin",
  infirmier: "Infirmier",
  agent_communautaire: "Agent communautaire",
  pharmacien: "Pharmacien",
  laboratoire: "Laboratoire",
  admin_etablissement: "Administrateur d'établissement",
  admin_national: "Administrateur national",
};

/** Message d'accueil personnalisé selon le rôle principal de l'utilisateur connecté. */
const messagesParRole: Record<NomRole, string> = {
  patient: "Retrouvez ici vos informations de santé personnelles.",
  medecin:
    "Retrouvez ici vos patients du jour, vos rendez-vous de consultation et les alertes cliniques nécessitant votre attention.",
  infirmier:
    "Retrouvez ici les patients à suivre aujourd'hui, votre planning de soins et les alertes nécessitant votre attention.",
  agent_communautaire:
    "Retrouvez ici vos visites de terrain du jour, votre planning et les alertes de suivi communautaire.",
  pharmacien:
    "Retrouvez ici les prescriptions à délivrer, votre planning et les alertes de disponibilité des médicaments.",
  laboratoire:
    "Retrouvez ici les examens à traiter, votre planning et les alertes de résultats à transmettre.",
  admin_etablissement:
    "Retrouvez ici l'activité de votre établissement, le planning des équipes et les alertes de gestion.",
  admin_national:
    "Retrouvez ici les indicateurs nationaux de santé, le suivi des établissements et les alertes de pilotage.",
};

const messageParDefaut =
  "Retrouvez ici vos patients du jour, vos rendez-vous et vos alertes dès que ces fonctionnalités seront disponibles.";

function EtatVide({
  icon: Icon,
  titre,
  description,
  phase,
}: {
  icon: LucideIcon;
  titre: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="text-[14px] font-semibold text-encre">{titre}</p>
      <p className="max-w-[30ch] text-[13px] text-encre-attenuee">{description}</p>
      <Badge tone="info">{phase}</Badge>
    </div>
  );
}

/**
 * Espace professionnel (Phase 2) : écran générique pour tous les rôles non
 * patients (médecin, infirmier, agent communautaire, pharmacien,
 * laboratoire, administrateurs). L'en-tête est personnalisé selon les rôles
 * réels de l'utilisateur connecté (getSession()). Uniquement des états vides
 * honnêtes, aucune donnée simulée ; les zones seront branchées à des données
 * réelles en Phase 3+.
 */
export default async function EspaceProfessionnelPage() {
  const session = await getSession();
  const roles = session?.roles ?? [];
  const rolePrincipal = roles[0];
  const message = rolePrincipal ? messagesParRole[rolePrincipal] : messageParDefaut;

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Espace professionnel
          </p>
          <h1 className="text-[28px] font-black text-encre">Mon tableau de bord</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">{message}</p>
        </div>
        {roles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <Badge key={role} tone="accent">
                {libellesRole[role]}
              </Badge>
            ))}
          </div>
        ) : null}
      </header>

      <section aria-labelledby="titre-activite" className="flex flex-col gap-4">
        <h2 id="titre-activite" className="text-[20px] font-bold text-encre">
          Mon activité
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            title="Patients du jour"
            description="Consultations prévues aujourd'hui."
            actions={<Badge tone="info">Phase 4</Badge>}
          >
            <EtatVide
              icon={Users}
              titre="Aucun patient à afficher"
              description="La liste des patients du jour arrivera avec le module Consultations, en phase 4 du projet."
              phase="Phase 4"
            />
          </Card>
          <Card
            title="Rendez-vous"
            description="Planning des prochains jours."
            actions={<Badge tone="info">Phase 4</Badge>}
          >
            <EtatVide
              icon={CalendarClock}
              titre="Aucun rendez-vous planifié"
              description="Votre planning de rendez-vous sera disponible ici dès que le module Rendez-vous sera activé, en phase 4."
              phase="Phase 4"
            />
          </Card>
          <Card
            title="Alertes"
            description="Signaux nécessitant une attention."
            actions={<Badge tone="info">Phase 4</Badge>}
          >
            <EtatVide
              icon={Bell}
              titre="Aucune alerte pour le moment"
              description="Les alertes cliniques et de suivi apparaîtront ici dès que les modules correspondants seront disponibles."
              phase="Phase 4"
            />
          </Card>
        </div>
      </section>
    </div>
  );
}
