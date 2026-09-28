import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, FlaskConical, Phone, Pill, ShieldAlert, ShieldCheck, Stethoscope, Syringe, UserRound } from "lucide-react";
import { getResumePatient } from "@/modules/clinical/actions";
import { getVaccinationsDuPatient } from "@/modules/vaccination/actions";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { ListeDocuments } from "../../documents/ListeDocuments";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { ListeVaccinations } from "../../vaccinations/ListeVaccinations";
import { PanneauResumeIa } from "./PanneauResumeIa";

interface PatientDetailPageProps {
  params: Promise<{ id: string }>;
}

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

/**
 * RG-ACC-50 : niveau de verification d'identite affiche au professionnel
 * (N0 a N3, chapitre 5.6 du pack, voir le commentaire de
 * User.niveauVerification dans prisma/schema.prisma). N0 signale l'absence
 * de verification (aucune piece ni telephone confirmes), les autres niveaux
 * sont une confirmation croissante.
 */
const LIBELLES_NIVEAU_VERIFICATION: Record<string, string> = {
  N0: "Déclaratif",
  N1: "Téléphone vérifié",
  N2: "Vérifié en établissement",
  N3: "Vérifié ANIP",
};

function badgeNiveauVerification(niveau: string) {
  const libelle = LIBELLES_NIVEAU_VERIFICATION[niveau] ?? niveau;
  const tone = niveau === "N0" ? "warning" : niveau === "N1" ? "info" : "good";
  const Icon = niveau === "N0" ? ShieldAlert : ShieldCheck;
  return (
    <Badge tone={tone}>
      <span className="flex items-center gap-1.5">
        <Icon size={13} aria-hidden="true" />
        Identité {niveau} · {libelle}
      </span>
    </Badge>
  );
}

function LienAction({
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
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-champ bg-accent px-4 text-[14px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-accent-fonce",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}

/**
 * Fiche resume d'un patient (F-CLI-04 du pack) : bandeau, alertes cliniques,
 * traitements en cours, 5 derniers evenements, puis actions rapides. Ordre
 * impose par le pack. getResumePatient retourne null si le medecin connecte
 * n'a pas de consentement actif pour ce patient (Zero Trust, RG-CLI-30) :
 * jamais de donnee partielle affichee dans ce cas, un message neutre a la
 * place.
 */
export default async function PatientDetailPage({ params }: PatientDetailPageProps) {
  const { id } = await params;
  const [resume, vaccinations, resumeIaActif] = await Promise.all([
    getResumePatient(id),
    getVaccinationsDuPatient(id),
    estFonctionnaliteActive("ai.summary"),
  ]);

  if (!resume) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <Link
          href="/app/medecin/patients"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour à mes patients
        </Link>
        <Alert level="critical" title="Dossier inaccessible">
          Ce patient est introuvable, ou vous n&apos;avez pas (ou plus) d&apos;accès à son
          dossier.
        </Alert>
      </div>
    );
  }

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/medecin/patients"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour à mes patients
      </Link>

      {resume.accesUrgenceExpirationLe ? (
        <div className="flex items-center gap-2 rounded-champ bg-critique px-4 py-3 text-[14px] font-semibold text-white">
          <ShieldAlert size={18} aria-hidden="true" />
          Accès d&apos;urgence, tracé et contrôlé, expire à{" "}
          {new Date(resume.accesUrgenceExpirationLe).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </div>
      ) : null}

      {resume.accesReferenceExpirationLe ? (
        <div className="flex items-center gap-2 rounded-champ bg-info px-4 py-3 text-[14px] font-semibold text-white">
          <ArrowRightLeft size={18} aria-hidden="true" />
          Accès accordé via une référence médicale, expire le{" "}
          {new Date(resume.accesReferenceExpirationLe).toLocaleDateString("fr-FR", { dateStyle: "long" })}.
        </div>
      ) : null}

      {resume.elementsSensiblesMasques ? (
        <div className="flex items-center gap-2 rounded-champ border border-vigilance bg-vigilance-clair px-4 py-3 text-[14px] font-semibold text-encre">
          <ShieldAlert size={18} aria-hidden="true" />
          Ce résumé est incomplet : des éléments sensibles du dossier ne sont pas affichés avec cet accès.
        </div>
      ) : null}

      <header className="flex flex-col gap-6 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={resume.nomComplet} avatarUrl={resume.avatarUrl} size={72} />
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
              {resume.identifiantSante} · {resume.age} an{resume.age > 1 ? "s" : ""} ·{" "}
              {resume.sexe === "F" ? "Féminin" : "Masculin"}
            </p>
            <h1 className="text-[28px] font-bold text-titre">{resume.nomComplet}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-encre-secondaire">
              <span className="flex items-center gap-1.5">
                <UserRound size={14} aria-hidden="true" />
                Né(e) le {formaterDate(resume.dateNaissance)}
              </span>
              {resume.telephone && resume.telephone !== "inconnu" ? (
                <span className="flex items-center gap-1.5">
                  <Phone size={14} aria-hidden="true" />
                  {resume.telephone}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {badgeNiveauVerification(resume.niveauVerification)}
          <Badge tone="accent">Groupe {resume.groupeSanguin}</Badge>
        </div>
      </header>

      {resumeIaActif ? <PanneauResumeIa patientId={resume.id} /> : null}

      {resume.allergies.length > 0 ? (
        <Alert level="critical" title="Allergies connues">
          {resume.allergies.join(", ")}
        </Alert>
      ) : null}

      {resume.maladiesChroniques.length > 0 ? (
        <Card title="Maladies chroniques">
          <div className="flex flex-wrap gap-1.5">
            {resume.maladiesChroniques.map((maladie) => (
              <Badge key={maladie} tone="warning">
                {maladie}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}

      {resume.antecedents.length > 0 ? (
        <Card title="Antécédents">
          <ul className="flex list-disc flex-col gap-1 pl-4 text-[14px] text-encre-secondaire">
            {resume.antecedents.map((antecedent) => (
              <li key={antecedent}>{antecedent}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {resume.contactsUrgence.length > 0 ? (
        <Card title="Contacts d'urgence">
          <ul className="flex flex-col gap-2">
            {resume.contactsUrgence.map((contact, index) => (
              <li key={index} className="text-[14px] text-encre">
                <span className="font-semibold">{contact.nom || "Contact"}</span>
                {contact.lienParente ? ` (${contact.lienParente})` : ""}
                {contact.telephone ? `, ${contact.telephone}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section aria-labelledby="titre-traitements" className="flex flex-col gap-4">
        <h2 id="titre-traitements" className="text-[20px] font-bold text-encre">
          Traitements en cours
        </h2>
        {resume.traitementsActifs.length === 0 ? (
          <Card>
            <p className="text-[13px] text-encre-attenuee">Aucun traitement actif.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {resume.traitementsActifs.map((traitement) => (
              <Card key={traitement.id} description={`Prescrit par ${traitement.medecinNomComplet}`}>
                <ul className="flex flex-col gap-2">
                  {traitement.lignes.map((ligne, index) => (
                    <li key={index} className="text-[14px] text-encre">
                      <span className="font-semibold">{ligne.medicamentNom}</span> : {ligne.posologie}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="titre-evenements" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titre-evenements" className="text-[20px] font-bold text-encre">
            Derniers événements
          </h2>
          <Link
            href={`/app/medecin/patients/${resume.id}/historique`}
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            Voir l&apos;historique complet
          </Link>
        </div>
        {resume.derniersEvenements.length === 0 ? (
          <Card>
            <p className="text-[13px] text-encre-attenuee">Aucune consultation validée pour le moment.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {resume.derniersEvenements.map((evenement) => (
              <Card key={evenement.id} title={evenement.motif} description={formaterDate(evenement.date)}>
                <p className="text-[13px] text-encre-secondaire">
                  <span className="font-semibold text-encre">{evenement.medecinNomComplet}</span>
                  {evenement.conclusion ? ` : ${evenement.conclusion}` : ""}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ListeVaccinations vaccinations={vaccinations} />

      <ListeDocuments patientId={resume.id} />

      <section aria-labelledby="titre-actions" className="flex flex-col gap-4">
        <h2 id="titre-actions" className="text-[20px] font-bold text-encre">
          Actions rapides
        </h2>
        <div className="flex flex-wrap gap-3">
          <LienAction
            href={`/app/medecin/consultations/nouvelle?patientId=${encodeURIComponent(resume.id)}`}
            icon={Stethoscope}
            label="Démarrer une consultation"
          />
          <LienAction
            href={`/app/medecin/examens/nouvelle?patientId=${encodeURIComponent(resume.id)}`}
            icon={FlaskConical}
            label="Demander un examen"
          />
          <LienAction
            href="/app/medecin/prescriptions/nouvelle"
            icon={Pill}
            label="Nouvelle prescription"
          />
          <LienAction
            href={`/app/medecin/vaccinations/nouvelle?patientId=${encodeURIComponent(resume.id)}`}
            icon={Syringe}
            label="Enregistrer une vaccination"
          />
        </div>
      </section>
    </div>
  );
}
