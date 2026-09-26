import Link from "next/link";
import { FlaskConical, Pill, Stethoscope } from "lucide-react";
import { getMonProfil } from "@/modules/identity/actions";
import { getRendezVousDuProfessionnel, type RendezVousResume } from "@/modules/facility/actions";
import { getConsultationsDuProfessionnel } from "@/modules/clinical/actions";
import { getExamensDemandesParProfessionnel } from "@/modules/laboratoire/actions";
import { getPrescriptionsDuProfessionnel } from "@/modules/prescription/actions";
import { getMonQrCode } from "@/modules/verification/actions";
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

/** Tuile de synthese chiffree, meme composant que src/app/app/medecin/DashboardInfirmier.tsx. */
function TuileSynthese({ label, valeur }: { label: string; valeur: number }) {
  return (
    <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
        </span>
        <span className="chiffres text-[22px] font-bold text-encre">{valeur}</span>
      </div>
    </div>
  );
}

function estDansLes7DerniersJours(dateIso: string): boolean {
  const date = new Date(dateIso);
  const ilYA7Jours = new Date();
  ilYA7Jours.setDate(ilYA7Jours.getDate() - 7);
  return date >= ilYA7Jours;
}

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

/**
 * Resultats d'examens sensibles dont l'annonce au patient reste a faire
 * (F-LAB-05 du pack, voir src/modules/laboratoire/referentiel-examens-sensibles.ts) :
 * mis en avant sur le tableau de bord car sinon invisible tant qu'on ne va
 * pas ouvrir "Mes examens demandes" par hasard.
 */
function ListeResultatsAAnnoncer({
  examens,
}: {
  examens: { id: string; patientNomComplet: string | null; date: string }[];
}) {
  if (examens.length === 0) {
    return (
      <p className="text-[13px] text-encre-attenuee">
        Aucun resultat sensible en attente d&apos;annonce.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {examens.map((examen) => (
        <li
          key={examen.id}
          className="flex flex-col gap-1 border-b border-bordure pb-3 last:border-0 last:pb-0"
        >
          <span className="font-semibold text-encre">
            {examen.patientNomComplet ?? "Patient non précisé"}
          </span>
          <span className="text-[13px] text-encre-secondaire">{formaterDateHeure(examen.date)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Brouillons de consultation encore ouverts (F-CLI-05 du pack). Sans tache
 * planifiee d'abandon automatique a 7 jours (RG-CLI-43, voir
 * docs/audit-cote-medecin.md), c'est le seul rappel qu'une saisie est restee
 * en cours ; chaque ligne mene directement a sa reprise.
 */
function ListeBrouillonsEnCours({
  consultations,
}: {
  consultations: { id: string; patientId: string; patientNomComplet: string | null; date: string }[];
}) {
  if (consultations.length === 0) {
    return (
      <p className="text-[13px] text-encre-attenuee">Aucun brouillon en cours.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {consultations.map((consultation) => (
        <li
          key={consultation.id}
          className="flex flex-col gap-1 border-b border-bordure pb-3 last:border-0 last:pb-0"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-encre">
              {consultation.patientNomComplet ?? "Patient non précisé"}
            </span>
            <span className="text-[13px] text-encre-secondaire">{formaterDateHeure(consultation.date)}</span>
          </div>
          <Link
            href={`/app/medecin/consultations/nouvelle?patientId=${encodeURIComponent(consultation.patientId)}`}
            className="w-fit text-[13px] font-semibold text-accent hover:underline"
          >
            Continuer la saisie
          </Link>
        </li>
      ))}
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
  const [profil, rendezVous, qrCode, consultations, prescriptions, examens] = await Promise.all([
    getMonProfil(),
    getRendezVousDuProfessionnel(),
    getMonQrCode(),
    getConsultationsDuProfessionnel(),
    getPrescriptionsDuProfessionnel(),
    getExamensDemandesParProfessionnel(),
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

  // Ne compte que les consultations validees : un brouillon encore ouvert
  // n'est pas une activite clinique terminee (F-CLI-05/07 du pack).
  const consultationsCetteSemaine = consultations.filter(
    (consultation) => consultation.statut === "terminee" && estDansLes7DerniersJours(consultation.date)
  );
  // RG-CLI-40/43 du pack : sans tache planifiee d'abandon automatique a 7
  // jours (voir docs/audit-cote-medecin.md, "Limites assumees"), le
  // tableau de bord reste le seul rappel qu'un brouillon est resté ouvert.
  const brouillonsEnCours = consultations.filter((consultation) => consultation.statut === "brouillon");
  const prescriptionsActives = prescriptions.filter(
    (prescription) => prescription.statut === "validee" || prescription.statut === "delivree_partiellement"
  );
  const resultatsAAnnoncer = examens.filter(
    (examen) =>
      examen.sensible && examen.statut === "termine" && !examen.resultatAnnonceAuPatient
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-bold text-titre">
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

      <section aria-labelledby="titre-synthese" className="flex flex-col gap-4">
        <h2 id="titre-synthese" className="text-[20px] font-bold text-encre">
          Vue d&apos;ensemble
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <TuileSynthese label="Consultations cette semaine" valeur={consultationsCetteSemaine.length} />
          <TuileSynthese label="Brouillons en cours" valeur={brouillonsEnCours.length} />
          <TuileSynthese label="Prescriptions actives" valeur={prescriptionsActives.length} />
          <TuileSynthese label="Résultats à annoncer" valeur={resultatsAAnnoncer.length} />
          <TuileSynthese label="Rendez-vous à venir" valeur={prochainRendezVous.length} />
        </div>
      </section>

      <section aria-labelledby="titre-activite" className="flex flex-col gap-4">
        <h2 id="titre-activite" className="text-[20px] font-bold text-encre">
          Mon activité
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {resultatsAAnnoncer.length > 0 ? (
            <Card
              className="border-critique bg-critique-clair"
              title="Résultats à annoncer"
              description="Résultats sensibles en attente d'annonce au patient."
              actions={<Badge tone="critical">{resultatsAAnnoncer.length}</Badge>}
            >
              <div className="flex flex-col gap-4">
                <ListeResultatsAAnnoncer examens={resultatsAAnnoncer} />
                <Link
                  href="/app/medecin/examens"
                  className="w-fit text-[13px] font-semibold text-accent hover:underline"
                >
                  Voir mes examens demandés
                </Link>
              </div>
            </Card>
          ) : null}
          {brouillonsEnCours.length > 0 ? (
            <Card
              title="Brouillons en cours"
              description="Consultations démarrées mais pas encore validées."
              actions={<Badge tone="warning">{brouillonsEnCours.length}</Badge>}
            >
              <div className="flex flex-col gap-4">
                <ListeBrouillonsEnCours consultations={brouillonsEnCours} />
                <Link
                  href="/app/medecin/consultations"
                  className="w-fit text-[13px] font-semibold text-accent hover:underline"
                >
                  Voir toutes mes consultations
                </Link>
              </div>
            </Card>
          ) : null}
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
          {qrCode ? (
            <Card
              title="Mon QR code"
              description="À présenter pour vérification (badge professionnel)."
            >
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL genere localement, pas une image distante */}
                <img
                  src={qrCode.dataUrl}
                  alt="QR code de vérification de mon compte"
                  width={140}
                  height={140}
                  className="rounded-champ border border-bordure"
                />
              </div>
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
}
