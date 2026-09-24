import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Droplet,
  FolderOpen,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import {
  getMesConsentements,
  getMonDossierPatient,
  type DossierPatientResume,
} from "@/modules/patient/actions";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";

const actionsRapides = [
  { label: "Prendre rendez-vous" },
  { label: "Consulter mon dossier" },
  { label: "Voir mes traitements" },
];

const styleBoutonLien =
  "inline-flex h-11 items-center justify-center rounded-champ px-4 text-[15px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

/**
 * Complétude du dossier patient : indicateur calculé à partir de quatre
 * champs réellement renseignés (groupe sanguin connu, allergies, antécédents,
 * contact d'urgence), chacun comptant pour 25%. Aucune valeur inventée : soit
 * le champ est rempli, soit il ne l'est pas.
 */
function calculerCompletudeDossier(dossier: DossierPatientResume): number {
  let score = 0;
  if (dossier.groupeSanguin && dossier.groupeSanguin !== "inconnu") score += 25;
  if (dossier.allergies.length > 0) score += 25;
  if (dossier.antecedents.length > 0) score += 25;
  if (dossier.contactsUrgence.length > 0) score += 25;
  return score;
}

function champsManquants(dossier: DossierPatientResume): string[] {
  const manquants: string[] = [];
  if (!dossier.groupeSanguin || dossier.groupeSanguin === "inconnu") {
    manquants.push("Groupe sanguin");
  }
  if (dossier.allergies.length === 0) manquants.push("Allergies");
  if (dossier.antecedents.length === 0) manquants.push("Antécédents");
  if (dossier.contactsUrgence.length === 0) manquants.push("Contact d'urgence");
  return manquants;
}

function TuileStat({
  icon: Icon,
  label,
  value,
  ton = "neutre",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  ton?: "neutre" | "vigilance";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-champ border px-4 py-3",
        ton === "vigilance"
          ? "border-vigilance bg-vigilance-clair"
          : "border-bordure bg-plan"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface",
          ton === "vigilance" ? "text-vigilance" : "text-accent"
        )}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="flex flex-col">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
        </span>
        <span className="text-[15px] font-bold text-encre">{value}</span>
      </div>
    </div>
  );
}

/** Etat vide qualitatif : icône, texte explicite sur ce qui arrive et à quelle phase. */
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
 * Tableau de bord patient (Phase 3) : le résumé santé provient de
 * getMonDossierPatient() et le résumé des autorisations de
 * getMesConsentements() (module patient). Les zones rendez-vous, traitements
 * et documents restent des états vides honnêtes : elles seront branchées à
 * des données réelles en Phase 4/5.
 */
export default async function PatientPage() {
  const [dossier, consentements] = await Promise.all([
    getMonDossierPatient(),
    getMesConsentements(),
  ]);

  const consentementsActifs = consentements.filter((c) => c.statut === "actif");
  const completude = dossier ? calculerCompletudeDossier(dossier) : null;
  const manquants = dossier ? champsManquants(dossier) : [];

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Espace patient
          </p>
          <h1 className="text-[28px] font-black text-encre">Mon tableau de bord</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Retrouvez ici vos rendez-vous, vos traitements et vos documents dès
            que ces fonctionnalités seront disponibles.
          </p>
        </div>

        {dossier && completude !== null ? (
          <div className="flex flex-col gap-1.5 rounded-carte border border-bordure bg-surface px-4 py-3 shadow-[var(--ombre-carte)] sm:min-w-[240px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-encre-secondaire">
                Dossier complet à
              </span>
              <span className="chiffres text-[16px] font-black text-accent">
                {completude}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-appui">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${completude}%` }}
              />
            </div>
            {manquants.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] text-encre-attenuee">
                  À compléter : {manquants.join(", ")}
                </p>
                <Tooltip
                  content="Complétez ces informations depuis votre dossier santé pour une prise en charge optimale."
                  label="Pourquoi compléter mon dossier"
                />
              </div>
            ) : (
              <p className="text-[12px] font-semibold text-bon">Dossier entièrement renseigné</p>
            )}
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <section aria-labelledby="titre-resume" className="flex flex-col gap-4">
            <h2 id="titre-resume" className="text-[20px] font-bold text-encre">
              Mon résumé santé
            </h2>
            {dossier ? (
              <Card
                title="Résumé santé"
                description={`Identifiant santé : ${dossier.identifiantSante} · Né(e) le ${formaterDate(dossier.dateNaissance)}`}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <TuileStat
                    icon={Droplet}
                    label="Groupe sanguin"
                    value={dossier.groupeSanguin || "Inconnu"}
                  />
                  <TuileStat
                    icon={UserRound}
                    label="Sexe"
                    value={dossier.sexe === "M" ? "Homme" : "Femme"}
                  />
                  <TuileStat
                    icon={TriangleAlert}
                    label="Allergies"
                    value={dossier.allergies.length}
                    ton={dossier.allergies.length > 0 ? "vigilance" : "neutre"}
                  />
                  <TuileStat
                    icon={ClipboardList}
                    label="Antécédents"
                    value={dossier.antecedents.length}
                  />
                </div>

                {dossier.allergies.length > 0 ? (
                  <div className="mt-5 flex items-start gap-3 rounded-champ border border-vigilance bg-vigilance-clair p-4">
                    <TriangleAlert
                      size={18}
                      className="mt-0.5 shrink-0 text-vigilance"
                      aria-hidden="true"
                    />
                    <div className="flex flex-col gap-2">
                      <p className="text-[14px] font-semibold text-encre">
                        Allergies connues : information de sécurité
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {dossier.allergies.map((allergie) => (
                          <Badge key={allergie} tone="warning">
                            {allergie}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 text-[13px] text-encre-attenuee">
                    Aucune allergie connue à ce jour.
                  </p>
                )}

                <dl className="mt-6 grid gap-5 border-t border-bordure pt-5 sm:grid-cols-2">
                  <div>
                    <dt className="text-[13px] font-semibold text-encre-secondaire">
                      Maladies chroniques
                    </dt>
                    <dd className="mt-1.5">
                      {dossier.maladiesChroniques.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-5 text-[14px] text-encre">
                          {dossier.maladiesChroniques.map((maladie) => (
                            <li key={maladie}>{maladie}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[13px] text-encre-attenuee">
                          Aucune maladie chronique connue.
                        </p>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-semibold text-encre-secondaire">
                      Antécédents
                    </dt>
                    <dd className="mt-1.5">
                      {dossier.antecedents.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-5 text-[14px] text-encre">
                          {dossier.antecedents.map((antecedent) => (
                            <li key={antecedent}>{antecedent}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[13px] text-encre-attenuee">
                          Aucun antécédent connu.
                        </p>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 flex flex-wrap gap-3 border-t border-bordure pt-5">
                  <Link
                    href="/app/patient/dossier"
                    className={cn(styleBoutonLien, "bg-accent text-white hover:bg-accent-fonce")}
                  >
                    Voir mon dossier complet
                  </Link>
                  <Link
                    href="/app/patient/consentements"
                    className={cn(
                      styleBoutonLien,
                      "border border-bordure-forte bg-surface text-encre hover:bg-surface-appui"
                    )}
                  >
                    Gérer mes autorisations d&apos;accès
                  </Link>
                </div>
              </Card>
            ) : (
              <Alert level="info" title="Aucun dossier patient associé">
                Votre compte n&apos;est pas encore relié à un dossier patient.
                Cette section s&apos;activera dès qu&apos;un dossier sera créé.
              </Alert>
            )}
          </section>

          <section aria-labelledby="titre-suivi" className="flex flex-col gap-4">
            <h2 id="titre-suivi" className="text-[20px] font-bold text-encre">
              Mon suivi
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card
                title="Prochains rendez-vous"
                description="Consultations planifiées."
                actions={<Badge tone="info">Phase 4</Badge>}
              >
                <EtatVide
                  icon={CalendarClock}
                  titre="Aucun rendez-vous planifié"
                  description="La prise de rendez-vous en ligne arrivera avec le module Rendez-vous, en phase 4 du projet."
                  phase="Phase 4"
                />
              </Card>
              <Card
                title="Traitements actifs"
                description="Prescriptions en cours."
                actions={<Badge tone="info">Phase 4</Badge>}
              >
                <EtatVide
                  icon={Activity}
                  titre="Aucun traitement en cours affiché"
                  description="Vos prescriptions actives apparaîtront ici dès que le module Prescriptions sera disponible."
                  phase="Phase 4"
                />
              </Card>
              <Card
                title="Documents récents"
                description="Résultats et comptes-rendus."
                actions={<Badge tone="info">Phase 5</Badge>}
              >
                <EtatVide
                  icon={FolderOpen}
                  titre="Aucun document disponible"
                  description="Vos résultats d'examens et comptes-rendus seront consultables ici en phase 5 du projet."
                  phase="Phase 5"
                />
              </Card>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <Card
            title="Mes autorisations d'accès"
            description="Professionnels de santé actuellement autorisés."
            actions={<Badge tone="accent">{consentementsActifs.length}</Badge>}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
                <ShieldCheck size={20} aria-hidden="true" />
              </span>
              <p className="text-[13px] text-encre-secondaire">
                {consentementsActifs.length === 0
                  ? "Aucun professionnel n'est actuellement autorisé à consulter votre dossier."
                  : consentementsActifs.length === 1
                    ? "1 professionnel de santé peut actuellement consulter tout ou partie de votre dossier."
                    : `${consentementsActifs.length} professionnels de santé peuvent actuellement consulter tout ou partie de votre dossier.`}
              </p>
            </div>
            <Link
              href="/app/patient/consentements"
              className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
            >
              Gérer mes autorisations d&apos;accès
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </Card>

          <Card
            title="Actions rapides"
            description="Ces actions seront activées au fil des prochaines phases."
          >
            <div className="flex flex-col gap-3">
              {actionsRapides.map((action) => (
                <div key={action.label} className="flex items-center gap-2">
                  <Button variant="secondary" disabled className="w-full justify-start">
                    {action.label}
                  </Button>
                  <Tooltip
                    content="Bientôt disponible"
                    label={`${action.label} : bientôt disponible`}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
