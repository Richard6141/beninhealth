import Link from "next/link";
import {
  getRendezVousDeLEtablissementDuProfessionnel,
  type RendezVousResume,
} from "@/modules/facility/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

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
    return new Date(dateIso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateIso;
  }
}

function formaterDateHeure(dateIso: string): string {
  try {
    return new Date(dateIso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return dateIso;
  }
}

const NOMBRE_MAX_PROCHAINS_RENDEZ_VOUS = 5;

/** Tuile de synthèse chiffrée. min-w-0 sur le conteneur du libellé : sans lui,
 * un libellé en majuscules refuse de rétrécir sous sa largeur de contenu et
 * se tronque au lieu de s'envelopper (bug déjà rencontré sur plusieurs
 * tableaux de bord de ce projet). */
function TuileSynthese({ label, valeur }: { label: string; valeur: number }) {
  return (
    <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
        </span>
        <span className="chiffres text-[22px] font-black text-encre">{valeur}</span>
      </div>
    </div>
  );
}

/**
 * Patients à suivre : lecture seule, sans raccourci de démarrage de
 * consultation. L'infirmier détient read:consultation et update:consultation
 * dans la matrice RBAC (src/security/permissions.ts) mais jamais
 * create:consultation, réservé au médecin.
 */
function ListePatientsASuivre({ rendezVous }: { rendezVous: RendezVousResume[] }) {
  if (rendezVous.length === 0) {
    return (
      <p className="text-[13px] text-encre-attenuee">
        Aucun patient confirmé pour aujourd&apos;hui.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rendezVous.map((rdv) => (
        <li
          key={rdv.id}
          className="flex flex-col gap-1 border-b border-bordure pb-3 last:border-0 last:pb-0"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-encre">
              {rdv.patientNomComplet ?? "Patient non précisé"}
            </span>
            <span className="text-[13px] text-encre-secondaire">{formaterHeure(rdv.date)}</span>
          </div>
          <span className="text-[13px] text-encre-secondaire">{rdv.motif}</span>
        </li>
      ))}
    </ul>
  );
}

function libelleStatutRendezVous(statut: string): { texte: string; tone: "warning" | "good" } {
  return statut === "demande"
    ? { texte: "En attente", tone: "warning" }
    : { texte: "Confirmé", tone: "good" };
}

function ListeProchainsRendezVous({ rendezVous }: { rendezVous: RendezVousResume[] }) {
  if (rendezVous.length === 0) {
    return (
      <p className="text-[13px] text-encre-attenuee">
        Aucun autre rendez-vous à venir pour le moment.
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
                {rdv.patientNomComplet ?? "Patient non précisé"}
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
 * Tableau de bord dédié au rôle infirmier : patients à suivre aujourd'hui et
 * rendez-vous à venir, en lecture seule. Volontairement dépourvu de tout
 * raccourci de création clinique (consultation, prescription, examen) : ce
 * rôle ne détient aucune de ces permissions (voir
 * src/security/permissions.ts).
 */
export async function DashboardInfirmier() {
  const rendezVous = await getRendezVousDeLEtablissementDuProfessionnel();

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
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Espace Infirmier
          </p>
          <h1 className="text-[28px] font-black text-encre">Tableau de bord infirmier</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Retrouvez ici les patients à suivre aujourd&apos;hui et votre
            planning de soins.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Infirmier</Badge>
        </div>
      </header>

      <section aria-labelledby="titre-synthese" className="flex flex-col gap-4">
        <h2 id="titre-synthese" className="text-[20px] font-bold text-encre">
          Vue d&apos;ensemble
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TuileSynthese label="Patients à suivre aujourd'hui" valeur={patientsDuJour.length} />
          <TuileSynthese label="Rendez-vous à venir" valeur={prochainRendezVous.length} />
        </div>
      </section>

      <section aria-labelledby="titre-activite" className="flex flex-col gap-4">
        <h2 id="titre-activite" className="text-[20px] font-bold text-encre">
          Mon activité
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            title="Patients à suivre aujourd'hui"
            description="Rendez-vous confirmés pour aujourd'hui."
          >
            <ListePatientsASuivre rendezVous={patientsDuJour} />
          </Card>
          <Card
            title="Rendez-vous"
            description="Prochains rendez-vous à venir."
          >
            <div className="flex flex-col gap-4">
              <ListeProchainsRendezVous rendezVous={prochainRendezVous} />
              <Link
                href="/app/medecin/rendez-vous"
                className="w-fit text-[13px] font-semibold text-accent hover:underline"
              >
                Voir tous les rendez-vous
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
