import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Bell, CalendarClock, Users } from "lucide-react";
import { getSession } from "@/lib/session";
import type { NomRole } from "@/types";
import {
  getRendezVousDuProfessionnel,
  type RendezVousResume,
} from "@/modules/facility/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

/**
 * Roles porteurs d'un profil ProfessionnelSante susceptible d'avoir des
 * rendez-vous personnels (voir src/types/domain-identity.ts, docstring de
 * ProfessionnelSante). admin_national en est volontairement exclu : ce role
 * pilote des indicateurs nationaux, pas un planning individuel de patients.
 */
const rolesAvecRendezVous: NomRole[] = [
  "medecin",
  "infirmier",
  "agent_communautaire",
  "pharmacien",
  "laboratoire",
  "admin_etablissement",
];

function estAujourdHui(dateIso: string): boolean {
  const date = new Date(dateIso);
  const maintenant = new Date();
  return (
    date.getFullYear() === maintenant.getFullYear() &&
    date.getMonth() === maintenant.getMonth() &&
    date.getDate() === maintenant.getDate()
  );
}

function formaterHeure(dateIso: string): string {
  try {
    return new Date(dateIso).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateIso;
  }
}

function formaterDateHeure(dateIso: string): string {
  try {
    return new Date(dateIso).toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return dateIso;
  }
}

const NOMBRE_MAX_PROCHAINS_RENDEZ_VOUS = 4;

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
  badgeTexte,
  badgeTone = "info",
}: {
  icon: LucideIcon;
  titre: string;
  description: string;
  badgeTexte: string;
  badgeTone?: "info" | "neutral";
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="text-[14px] font-semibold text-encre">{titre}</p>
      <p className="max-w-[30ch] text-[13px] text-encre-attenuee">{description}</p>
      <Badge tone={badgeTone}>{badgeTexte}</Badge>
    </div>
  );
}

function libelleStatutRendezVous(statut: string): { texte: string; tone: "warning" | "good" } {
  return statut === "demande"
    ? { texte: "En attente", tone: "warning" }
    : { texte: "Confirme", tone: "good" };
}

/**
 * Liste des rendez-vous confirmes du jour, avec un raccourci direct vers le
 * demarrage de la consultation correspondante.
 */
function ListePatientsDuJour({ rendezVous }: { rendezVous: RendezVousResume[] }) {
  if (rendezVous.length === 0) {
    return (
      <p className="text-[13px] text-encre-attenuee">
        Aucun patient confirme pour aujourd&apos;hui.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rendezVous.map((rdv) => (
        <li
          key={rdv.id}
          className="flex flex-col gap-1.5 border-b border-bordure pb-3 last:border-0 last:pb-0"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-encre">
              {rdv.patientNomComplet ?? "Patient non precise"}
            </span>
            <span className="text-[13px] text-encre-secondaire">{formaterHeure(rdv.date)}</span>
          </div>
          <span className="text-[13px] text-encre-secondaire">{rdv.motif}</span>
          <Link
            href={`/app/medecin/consultations/nouvelle?patientId=${encodeURIComponent(
              rdv.patientId
            )}&rendezVousId=${encodeURIComponent(rdv.id)}`}
            className="w-fit text-[13px] font-semibold text-accent hover:underline"
          >
            Demarrer la consultation
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Aperçu des prochains rendez-vous (demande ou confirme), hors ceux du jour deja montres dans "Patients du jour". */
function ListeProchainsRendezVous({ rendezVous }: { rendezVous: RendezVousResume[] }) {
  if (rendezVous.length === 0) {
    return (
      <p className="text-[13px] text-encre-attenuee">
        Aucun autre rendez-vous a venir pour le moment.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rendezVous.map((rdv) => {
        const statut = libelleStatutRendezVous(rdv.statut);
        return (
          <li
            key={rdv.id}
            className="flex flex-col gap-1 border-b border-bordure pb-3 last:border-0 last:pb-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-encre">
                {rdv.patientNomComplet ?? "Patient non precise"}
              </span>
              <Badge tone={statut.tone}>{statut.texte}</Badge>
            </div>
            <span className="text-[13px] text-encre-secondaire">
              {formaterDateHeure(rdv.date)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Espace professionnel (Phase 4) : écran générique pour tous les rôles non
 * patients (médecin, infirmier, agent communautaire, pharmacien,
 * laboratoire, administrateurs). L'en-tête est personnalisé selon les rôles
 * réels de l'utilisateur connecté (getSession()). "Patients du jour" et
 * "Rendez-vous" sont branchés sur getRendezVousDuProfessionnel (module
 * facility, autre agent) pour les rôles porteurs d'un profil
 * ProfessionnelSante pertinent ; "Alertes" reste un état vide honnête,
 * fonctionnalité prévue pour une phase ultérieure.
 */
export default async function EspaceProfessionnelPage() {
  const session = await getSession();
  const roles = session?.roles ?? [];
  const rolePrincipal = roles[0];
  const message = rolePrincipal ? messagesParRole[rolePrincipal] : messageParDefaut;

  const gereRendezVous = rolePrincipal ? rolesAvecRendezVous.includes(rolePrincipal) : false;
  const rendezVous = gereRendezVous ? await getRendezVousDuProfessionnel() : [];

  const patientsDuJour = rendezVous.filter(
    (rdv) => rdv.statut === "confirme" && estAujourdHui(rdv.date)
  );
  const idsPatientsDuJour = new Set(patientsDuJour.map((rdv) => rdv.id));
  const prochainRendezVous = rendezVous
    .filter(
      (rdv) =>
        (rdv.statut === "demande" || rdv.statut === "confirme") &&
        !idsPatientsDuJour.has(rdv.id)
    )
    .slice(0, NOMBRE_MAX_PROCHAINS_RENDEZ_VOUS);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            {rolePrincipal ? `Espace ${libellesRole[rolePrincipal]}` : "Espace professionnel"}
          </p>
          <h1 className="text-[28px] font-black text-encre">
            {rolePrincipal
              ? `Tableau de bord ${libellesRole[rolePrincipal].toLowerCase()}`
              : "Mon tableau de bord"}
          </h1>
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
            description="Rendez-vous confirmés pour aujourd'hui."
            actions={<Badge tone="accent">{patientsDuJour.length}</Badge>}
          >
            {gereRendezVous ? (
              <ListePatientsDuJour rendezVous={patientsDuJour} />
            ) : (
              <EtatVide
                icon={Users}
                titre="Non applicable à votre rôle"
                description="Les patients du jour concernent les rôles disposant d'un planning individuel de consultations, pas le pilotage national."
                badgeTexte="Non applicable"
                badgeTone="neutral"
              />
            )}
          </Card>
          <Card
            title="Rendez-vous"
            description="Prochains rendez-vous à venir."
            actions={<Badge tone="accent">{prochainRendezVous.length}</Badge>}
          >
            <div className="flex flex-col gap-4">
              {gereRendezVous ? (
                <ListeProchainsRendezVous rendezVous={prochainRendezVous} />
              ) : (
                <EtatVide
                  icon={CalendarClock}
                  titre="Non applicable à votre rôle"
                  description="Le planning de rendez-vous individuels ne concerne pas le pilotage national."
                  badgeTexte="Non applicable"
                  badgeTone="neutral"
                />
              )}
              {gereRendezVous ? (
                <Link
                  href="/app/medecin/rendez-vous"
                  className="w-fit text-[13px] font-semibold text-accent hover:underline"
                >
                  Voir tous mes rendez-vous
                </Link>
              ) : null}
            </div>
          </Card>
          <Card
            title="Alertes"
            description="Signaux nécessitant une attention."
            actions={<Badge tone="info">Phase 5</Badge>}
          >
            <EtatVide
              icon={Bell}
              titre="Aucune alerte pour le moment"
              description="Les alertes cliniques et de suivi apparaîtront ici dès que les modules correspondants seront disponibles, à une phase ultérieure du projet."
              badgeTexte="Phase 5"
            />
          </Card>
        </div>
      </section>
    </div>
  );
}
