import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Pill, Stethoscope, Users } from "lucide-react";
import {
  listPersonnelEtablissement,
  type MembrePersonnel,
} from "@/modules/identity/gestion-comptes";
import {
  getStatistiquesEtablissement,
  type StatistiquesEtablissement,
} from "@/modules/analytics/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { GraphiqueConsultationsMensuelles } from "./GraphiqueConsultationsMensuelles";
import { FormulaireAjoutPersonnel } from "./FormulaireAjoutPersonnel";
import { FormulaireChangementMotDePasse } from "./FormulaireChangementMotDePasse";

/** Libelles en toutes lettres des roles pouvant apparaitre dans le personnel d'un etablissement. */
const libellesRolePersonnel: Record<string, string> = {
  medecin: "Médecin",
  infirmier: "Infirmier",
  agent_communautaire: "Agent communautaire",
  pharmacien: "Pharmacien",
  laboratoire: "Laboratoire",
  admin_etablissement: "Administrateur d'établissement",
};

function libelleRole(role: string): string {
  return libellesRolePersonnel[role] ?? role;
}

function libelleStatutValidation(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "valide") return { texte: "Validé", tone: "good" };
  if (cle === "en_attente") return { texte: "En attente", tone: "warning" };
  if (cle === "rejete") return { texte: "Rejeté", tone: "critical" };
  if (cle === "suspendu") return { texte: "Suspendu", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

function libelleStatutRendezVous(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "Demande", tone: "warning" };
  if (cle === "confirme") return { texte: "Confirmé", tone: "info" };
  if (cle === "termine") return { texte: "Terminé", tone: "good" };
  if (cle === "annule") return { texte: "Annulé", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

function TuileStatistique({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
        </span>
        <span className="chiffres text-[22px] font-black text-encre">{value}</span>
      </div>
    </div>
  );
}

function SectionIndicateurs({
  statistiques,
}: {
  statistiques: StatistiquesEtablissement | null;
}) {
  if (statistiques === null) {
    return (
      <Alert level="warning" title="Compte non rattaché à un établissement">
        Votre compte administrateur n&apos;est actuellement rattaché à aucun
        établissement de santé, ce qui est anormal. Les indicateurs ne peuvent
        pas être affichés tant que ce rattachement n&apos;est pas régularisé.
        Contactez le support technique de la plateforme.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[15px] font-semibold text-encre">
        {statistiques.etablissementNom}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <TuileStatistique
            icon={Stethoscope}
            label="Consultations"
            value={statistiques.totalConsultations}
          />
        </Card>
        <Card>
          <TuileStatistique
            icon={Pill}
            label="Prescriptions"
            value={statistiques.totalPrescriptions}
          />
        </Card>
        <Card>
          <TuileStatistique
            icon={Users}
            label="Professionnels"
            value={statistiques.nombreProfessionnels}
          />
        </Card>
      </div>

      <Card
        title="Rendez-vous par statut"
        description="Répartition de l'ensemble des rendez-vous de l'établissement."
      >
        {statistiques.rendezVousParStatut.length === 0 ? (
          <p className="text-[13px] text-encre-attenuee">
            Aucun rendez-vous enregistré pour le moment.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {statistiques.rendezVousParStatut.map((entree) => {
              const statut = libelleStatutRendezVous(entree.statut);
              return (
                <Badge key={entree.statut} tone={statut.tone}>
                  {statut.texte} : {entree.total}
                </Badge>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        title="Consultations par mois"
        description="Nombre de consultations réalisées, six derniers mois."
      >
        <GraphiqueConsultationsMensuelles donnees={statistiques.consultationsParMois} />
      </Card>
    </div>
  );
}

function SectionPersonnel({ personnel }: { personnel: MembrePersonnel[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-encre-secondaire">
          {personnel.length === 0
            ? "Aucun membre du personnel enregistré pour le moment."
            : personnel.length === 1
              ? "1 membre du personnel rattaché à votre établissement."
              : `${personnel.length} membres du personnel rattachés à votre établissement.`}
        </p>
        <FormulaireAjoutPersonnel />
      </div>

      <Card>
        {personnel.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <Users size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">
              Aucun membre du personnel enregistré
            </p>
            <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
              Ajoutez un premier professionnel de santé à votre établissement
              avec le bouton ci-dessus.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border-b border-bordure px-3 py-2 text-left font-semibold text-encre-secondaire"
                  >
                    Nom complet
                  </th>
                  <th
                    scope="col"
                    className="border-b border-bordure px-3 py-2 text-left font-semibold text-encre-secondaire"
                  >
                    Rôle
                  </th>
                  <th
                    scope="col"
                    className="border-b border-bordure px-3 py-2 text-left font-semibold text-encre-secondaire"
                  >
                    Spécialité
                  </th>
                  <th
                    scope="col"
                    className="border-b border-bordure px-3 py-2 text-left font-semibold text-encre-secondaire"
                  >
                    Statut
                  </th>
                  <th
                    scope="col"
                    className="border-b border-bordure px-3 py-2 text-left font-semibold text-encre-secondaire"
                  >
                    Email
                  </th>
                </tr>
              </thead>
              <tbody>
                {personnel.map((membre) => {
                  const statut = libelleStatutValidation(membre.statutValidation);
                  return (
                    <tr key={membre.userId}>
                      <td className="border-b border-bordure px-3 py-2 font-semibold text-encre">
                        {membre.nomComplet}
                      </td>
                      <td className="border-b border-bordure px-3 py-2 text-encre">
                        {libelleRole(membre.role)}
                      </td>
                      <td className="border-b border-bordure px-3 py-2 text-encre-secondaire">
                        {membre.specialite || "Non précisée"}
                      </td>
                      <td className="border-b border-bordure px-3 py-2">
                        <Badge tone={statut.tone}>{statut.texte}</Badge>
                      </td>
                      <td className="border-b border-bordure px-3 py-2 text-encre-secondaire">
                        {membre.email}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Ecran ETABLISSEMENT (Phase 6, role admin_etablissement) : indicateurs de
 * l'etablissement (getStatistiquesEtablissement, module analytics, autre
 * agent) et gestion du personnel (listPersonnelEtablissement /
 * creerProfessionnelAction, module identity/gestion-comptes, autre agent),
 * plus le changement de mot de passe de l'administrateur connecte
 * (changerMotDePasseAction, meme module). Aucune donnee simulee : tout
 * provient de ces fonctions serveur.
 */
export default async function EtablissementPage() {
  const [statistiques, personnel] = await Promise.all([
    getStatistiquesEtablissement(),
    listPersonnelEtablissement(),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Espace établissement
          </p>
          <h1 className="text-[28px] font-black text-encre">Mon établissement</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Suivez l&apos;activité de votre établissement et gérez les comptes
            de votre personnel de santé.
          </p>
        </div>
        <FormulaireChangementMotDePasse />
      </header>

      <section aria-labelledby="titre-indicateurs" className="flex flex-col gap-4">
        <h2 id="titre-indicateurs" className="text-[20px] font-bold text-encre">
          Indicateurs de l&apos;établissement
        </h2>
        <SectionIndicateurs statistiques={statistiques} />
      </section>

      <section aria-labelledby="titre-personnel" className="flex flex-col gap-4">
        <h2 id="titre-personnel" className="text-[20px] font-bold text-encre">
          Mon personnel
        </h2>
        <SectionPersonnel personnel={personnel} />
      </section>
    </div>
  );
}
