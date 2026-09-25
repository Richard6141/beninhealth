import Link from "next/link";
import { FlaskConical, Pill, Stethoscope } from "lucide-react";
import { getMonProfil } from "@/modules/identity/actions";
import { getRendezVousDuProfessionnel, type RendezVousResume } from "@/modules/facility/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

/** Salutation dependante de l'heure du serveur, meme logique que src/app/app/patient/page.tsx. */
function salutation(): string {
  const heure = new Date().getHours();
  return heure >= 5 && heure < 18 ? "Bonjour" : "Bonsoir";
}

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

const NOMBRE_MAX_PROCHAINS_RENDEZ_VOUS = 4;

function ListePatientsDuJour({ rendezVous }: { rendezVous: RendezVousResume[] }) {
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
          className="flex flex-col gap-1.5 border-b border-bordure pb-3 last:border-0 last:pb-0"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-encre">
              {rdv.patientNomComplet ?? "Patient non précisé"}
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
            Démarrer la consultation
          </Link>
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

/** Raccourci de navigation stylisé, pour les trois workflows cliniques centraux du médecin. */
function ActionRapide({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Stethoscope;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3 text-[14px] font-semibold text-encre transition-colors motion-reduce:transition-none hover:border-accent hover:bg-accent-clair hover:text-accent"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      {label}
    </Link>
  );
}

/**
 * Tableau de bord dédié au rôle médecin : patients du jour, rendez-vous à
 * venir, et raccourcis directs vers les trois workflows cliniques qu'il est
 * seul (parmi les rôles professionnels) à pouvoir déclencher (voir
 * create:consultation / create:examen_medical dans
 * src/security/permissions.ts ; la prescription exige toujours une
 * consultationId, donc "Voir mes prescriptions" plutôt qu'un raccourci direct
 * de création).
 */
export async function DashboardMedecin() {
  const [profil, rendezVous] = await Promise.all([
    getMonProfil(),
    getRendezVousDuProfessionnel(),
  ]);

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
            Espace Médecin
          </p>
          <h1 className="text-[28px] font-black text-encre">
            {salutation()}
            {profil ? `, ${profil.prenom}` : ""}
          </h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Retrouvez ici vos patients du jour, vos rendez-vous de consultation
            et vos raccourcis cliniques.
          </p>
        </div>
        {profil ? (
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">Médecin</Badge>
          </div>
        ) : null}
      </header>

      <section aria-labelledby="titre-activite" className="flex flex-col gap-4">
        <h2 id="titre-activite" className="text-[20px] font-bold text-encre">
          Mon activité
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card
            title="Patients du jour"
            description="Rendez-vous confirmés pour aujourd'hui."
            actions={<Badge tone="accent">{patientsDuJour.length}</Badge>}
          >
            <ListePatientsDuJour rendezVous={patientsDuJour} />
          </Card>
          <Card
            title="Rendez-vous"
            description="Prochains rendez-vous à venir."
            actions={<Badge tone="accent">{prochainRendezVous.length}</Badge>}
          >
            <div className="flex flex-col gap-4">
              <ListeProchainsRendezVous rendezVous={prochainRendezVous} />
              <Link
                href="/app/medecin/rendez-vous"
                className="w-fit text-[13px] font-semibold text-accent hover:underline"
              >
                Voir tous mes rendez-vous
              </Link>
            </div>
          </Card>
          <Card title="Actions rapides" description="Démarrer un des trois workflows cliniques.">
            <div className="flex flex-col gap-2.5">
              <ActionRapide
                href="/app/medecin/consultations/nouvelle"
                icon={Stethoscope}
                label="Nouvelle consultation"
              />
              <ActionRapide
                href="/app/medecin/examens/nouvelle"
                icon={FlaskConical}
                label="Demander un examen"
              />
              <ActionRapide
                href="/app/medecin/prescriptions"
                icon={Pill}
                label="Voir mes prescriptions"
              />
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
