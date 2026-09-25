import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  CalendarClock,
  ChevronRight,
  Circle,
  ClipboardList,
  Droplet,
  FlaskConical,
  Heart,
  Pill,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { getMonProfil } from "@/modules/identity/actions";
import {
  getMesConsentements,
  getMonDossierPatient,
  type DossierPatientResume,
} from "@/modules/patient/actions";
import { getMesRendezVous, type RendezVousResume } from "@/modules/facility/actions";
import {
  getMesPrescriptions,
  type PrescriptionResume,
} from "@/modules/prescription/actions";
import { getMesExamens } from "@/modules/laboratoire/actions";
import { estPrescriptionEnCours } from "./prescriptions/lib";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";

const styleBoutonLien =
  "inline-flex h-11 items-center justify-center gap-2 rounded-champ px-4 text-[15px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

type TonCouleur = "accent" | "info" | "vigilance" | "sombre";

const TONS_PLEINS: Record<TonCouleur, string> = {
  accent: "bg-accent text-white",
  info: "bg-info text-white",
  vigilance: "bg-vigilance text-white",
  sombre: "bg-[#162233] text-white",
};

const TONS_TEINTES: Record<TonCouleur, string> = {
  accent: "bg-accent-clair text-accent",
  info: "bg-info-clair text-info",
  vigilance: "bg-vigilance-clair text-vigilance",
  sombre: "bg-surface-appui text-encre-secondaire",
};

/** Pastille circulaire d'icone, pleine ou teintee : vocabulaire visuel commun a tout le tableau de bord. */
function IconCercle({
  icon: Icon,
  ton = "accent",
  plein = false,
  taille = 40,
  tailleIcone = 18,
}: {
  icon: LucideIcon;
  ton?: TonCouleur;
  plein?: boolean;
  taille?: number;
  tailleIcone?: number;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        plein ? TONS_PLEINS[ton] : TONS_TEINTES[ton]
      )}
      style={{ width: taille, height: taille }}
    >
      <Icon size={tailleIcone} aria-hidden="true" />
    </span>
  );
}

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

function formaterDateCourte(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return date;
  }
}

function formaterHeure(date: string): string {
  try {
    return new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return date;
  }
}

/** Meme mapping statut -> libelle/ton que src/app/app/patient/examens/page.tsx. */
function libelleStatutExamen(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "En attente", tone: "vigilance" as BadgeTone };
  if (cle === "en_cours") return { texte: "En cours", tone: "warning" };
  if (cle === "termine") return { texte: "Terminé", tone: "good" };
  if (cle === "annule") return { texte: "Annulé", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

/**
 * Rendez-vous "à venir" pour le tableau de bord : statut demande ou
 * confirme, dont la date n'est pas déjà passée. getMesRendezVous() renvoie
 * déjà les rendez-vous triés par date croissante ; le tri est refait ici par
 * prudence, sans hypothèse sur l'ordre reçu.
 */
function rendezVousAVenir(rendezVous: RendezVousResume[]): RendezVousResume[] {
  const maintenant = Date.now();
  return rendezVous
    .filter(
      (rdv) =>
        (rdv.statut === "demande" || rdv.statut === "confirme") &&
        new Date(rdv.date).getTime() >= maintenant
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Prescriptions "en cours" pour le tableau de bord : getMesPrescriptions()
 * renvoie déjà les prescriptions triées par date décroissante, il suffit donc
 * de filtrer sur estPrescriptionEnCours (voir ./prescriptions/lib.ts, règle
 * partagée avec l'historique complet) pour obtenir les plus récentes en
 * premier.
 */
function prescriptionsEnCours(prescriptions: PrescriptionResume[]): PrescriptionResume[] {
  return prescriptions.filter(estPrescriptionEnCours);
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

/**
 * Tuile d'indicateur cle, cliquable, en tete de page : icone pleine
 * couleur + valeur + sous-texte + chevron, sur le modele d'une carte de
 * raccourci plutot que d'une simple statistique passive.
 */
function TuileKpi({
  icon,
  ton,
  label,
  value,
  sousTexte,
  href,
}: {
  icon: LucideIcon;
  ton: TonCouleur;
  label: string;
  value: ReactNode;
  sousTexte: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-carte border border-bordure bg-surface p-5 shadow-[var(--ombre-carte)] transition-colors motion-reduce:transition-none hover:border-bordure-forte"
    >
      <IconCercle icon={icon} ton={ton} plein taille={48} tailleIcone={22} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
        </span>
        <span className="truncate text-[19px] font-black text-encre">{value}</span>
        <span className="truncate text-[12px] text-encre-attenuee">{sousTexte}</span>
      </div>
      <ChevronRight size={18} className="shrink-0 text-encre-attenuee" aria-hidden="true" />
    </Link>
  );
}

function TuileStat({
  icon,
  ton,
  label,
  value,
}: {
  icon: LucideIcon;
  ton: TonCouleur;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
      <IconCercle icon={icon} ton={ton} taille={36} tailleIcone={16} />
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
        </span>
        <span className="text-[15px] font-bold text-encre">{value}</span>
      </div>
    </div>
  );
}

/** Salutation dependante de l'heure du serveur, pour un en-tete plus vivant qu'un titre statique. */
function salutation(): string {
  const heure = new Date().getHours();
  return heure >= 5 && heure < 18 ? "Bonjour" : "Bonsoir";
}

/** Titre de section avec pastille d'icone pleine et sous-titre, reutilise pour chaque bloc du tableau de bord. */
function TitreSection({
  icon,
  ton,
  titre,
  sousTitre,
}: {
  icon: LucideIcon;
  ton: TonCouleur;
  titre: string;
  sousTitre?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconCercle icon={icon} ton={ton} plein taille={36} tailleIcone={17} />
      <div className="flex flex-col">
        <h2 className="text-[20px] font-bold text-encre">{titre}</h2>
        {sousTitre ? (
          <p className="text-[13px] text-encre-secondaire">{sousTitre}</p>
        ) : null}
      </div>
    </div>
  );
}

export default async function PatientPage() {
  const [profil, dossier, consentements, rendezVous, prescriptions, examens] = await Promise.all([
    getMonProfil(),
    getMonDossierPatient(),
    getMesConsentements(),
    getMesRendezVous(),
    getMesPrescriptions(),
    getMesExamens(),
  ]);

  const consentementsActifs = consentements.filter((c) => c.statut === "actif");
  const completude = dossier ? calculerCompletudeDossier(dossier) : null;
  const manquants = dossier ? champsManquants(dossier) : [];
  const rendezVousFuturs = rendezVousAVenir(rendezVous);
  const prochainsRendezVous = rendezVousFuturs.slice(0, 2);
  const prescriptionsActives = prescriptionsEnCours(prescriptions);
  const traitementsEnCours = prescriptionsActives.slice(0, 2);
  const examensEnAttente = examens.filter((examen) =>
    ["demande", "en_cours"].includes(examen.statut.trim().toLowerCase())
  );
  const examensRecents = examens.slice(0, 2);
  const prochainRendezVous = rendezVousFuturs[0];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
              Espace patient
            </p>
            {dossier ? (
              <span className="chiffres rounded-full border border-bordure-forte bg-surface-appui px-2.5 py-0.5 text-[12px] font-semibold text-encre-secondaire">
                {dossier.identifiantSante}
              </span>
            ) : null}
          </div>
          <h1 className="text-[28px] font-black text-encre">
            {salutation()}
            {profil ? `, ${profil.prenom}` : ""}
          </h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Votre résumé santé, vos rendez-vous, vos traitements et vos
            examens, réunis au même endroit.
          </p>
        </div>

        {dossier && completude !== null ? (
          <div className="flex flex-col gap-1.5 rounded-carte border border-bordure bg-surface px-5 py-4 shadow-[var(--ombre-carte)] sm:min-w-[280px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-encre-secondaire">
                Dossier complet à
              </span>
              <span className="chiffres text-[18px] font-black text-accent">
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TuileKpi
          icon={CalendarClock}
          ton="accent"
          label="Prochain rendez-vous"
          href="/app/patient/rendez-vous"
          value={prochainRendezVous ? formaterDateCourte(prochainRendezVous.date) : "Aucun"}
          sousTexte={
            prochainRendezVous
              ? `à ${formaterHeure(prochainRendezVous.date)}`
              : "Aucun rendez-vous prévu"
          }
        />
        <TuileKpi
          icon={Pill}
          ton="info"
          label="Traitements actifs"
          href="/app/patient/prescriptions"
          value={prescriptionsActives.length}
          sousTexte="traitements en cours"
        />
        <TuileKpi
          icon={FlaskConical}
          ton="vigilance"
          label="Examens en attente"
          href="/app/patient/examens"
          value={examensEnAttente.length}
          sousTexte="examens à réaliser"
        />
        <TuileKpi
          icon={ClipboardList}
          ton="sombre"
          label="Dossier complet"
          href="/app/patient/dossier"
          value={completude !== null ? `${completude}%` : "—"}
          sousTexte={manquants.length === 0 ? "toutes les informations" : "à compléter"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <section aria-labelledby="titre-resume" className="flex flex-col gap-4">
            {dossier ? (
              <Card
                title={
                  <div className="flex items-center gap-3">
                    <IconCercle icon={Heart} ton="accent" plein taille={36} tailleIcone={17} />
                    <span>Résumé santé</span>
                  </div>
                }
                description="Vos informations médicales principales."
              >
                <p className="mb-4 text-[13px] text-encre-attenuee">
                  Identifiant santé : {dossier.identifiantSante} · Né(e) le{" "}
                  {formaterDate(dossier.dateNaissance)}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <TuileStat
                    icon={Droplet}
                    ton="accent"
                    label="Groupe sanguin"
                    value={dossier.groupeSanguin || "Inconnu"}
                  />
                  <TuileStat
                    icon={UserRound}
                    ton="info"
                    label="Sexe"
                    value={dossier.sexe === "M" ? "Homme" : "Femme"}
                  />
                  <TuileStat
                    icon={TriangleAlert}
                    ton="vigilance"
                    label="Allergies"
                    value={dossier.allergies.length}
                  />
                  <TuileStat
                    icon={ClipboardList}
                    ton="accent"
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
                    <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-encre-secondaire">
                      <Activity size={14} className="text-accent" aria-hidden="true" />
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
                    <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-encre-secondaire">
                      <ClipboardList size={14} className="text-accent" aria-hidden="true" />
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
                    href="/app/patient/rendez-vous"
                    className={cn(styleBoutonLien, "bg-accent text-white hover:bg-accent-fonce")}
                  >
                    <CalendarClock size={16} aria-hidden="true" />
                    Prendre un rendez-vous
                  </Link>
                  <Link
                    href="/app/patient/dossier"
                    className={cn(
                      styleBoutonLien,
                      "border border-bordure-forte bg-surface text-encre hover:bg-surface-appui"
                    )}
                  >
                    <ClipboardList size={16} aria-hidden="true" />
                    Voir mon dossier complet
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
        </div>

        <div className="flex flex-col gap-6">
          <Card
            title={
              <div className="flex items-center gap-3">
                <IconCercle icon={ShieldCheck} ton="accent" plein taille={36} tailleIcone={17} />
                <span>Mes autorisations d&apos;accès</span>
              </div>
            }
            actions={<Badge tone="accent">{consentementsActifs.length}</Badge>}
          >
            <div className="flex items-start gap-3">
              <IconCercle icon={UserRound} ton="accent" taille={40} tailleIcone={18} />
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
        </div>
      </div>

      <section aria-labelledby="titre-suivi" className="flex flex-col gap-4">
        <TitreSection
          icon={BarChart3}
          ton="accent"
          titre="Mon suivi"
          sousTitre="Consultez l'état de vos rendez-vous, traitements et examens."
        />
        <div className="grid gap-4 sm:grid-cols-3">
              <Card
                title={
                  <div className="flex items-center gap-2.5">
                    <IconCercle icon={CalendarClock} ton="accent" plein taille={32} tailleIcone={15} />
                    <span className="text-[16px]">Prochains rendez-vous</span>
                  </div>
                }
                actions={
                  prochainsRendezVous.length > 0 ? (
                    <Badge tone="accent">{prochainsRendezVous.length} à venir</Badge>
                  ) : undefined
                }
              >
                {prochainsRendezVous.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {prochainsRendezVous.map((rdv) => {
                      const estConfirme = rdv.statut === "confirme";
                      return (
                        <li key={rdv.id}>
                          <Link
                            href="/app/patient/rendez-vous"
                            className="flex items-center gap-2.5 rounded-champ px-1.5 py-2.5 transition-colors hover:bg-plan"
                          >
                            <Circle
                              size={9}
                              className={cn(
                                "shrink-0 fill-current",
                                estConfirme ? "text-bon" : "text-info"
                              )}
                              aria-hidden="true"
                            />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-[14px] font-semibold text-encre">
                                {rdv.motif}
                              </span>
                              <span className="truncate text-[12.5px] text-encre-attenuee">
                                {formaterDateCourte(rdv.date)} · {formaterHeure(rdv.date)}
                              </span>
                            </div>
                            <Badge tone={estConfirme ? "good" : "info"} className="shrink-0">
                              {estConfirme ? "Confirmé" : "Demande"}
                            </Badge>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
                    <IconCercle icon={CalendarClock} ton="accent" taille={44} tailleIcone={20} />
                    <p className="text-[14px] font-semibold text-encre">
                      Aucun rendez-vous à venir
                    </p>
                    <p className="max-w-[30ch] text-[13px] text-encre-attenuee">
                      Prenez rendez-vous auprès d&apos;un établissement de santé.
                    </p>
                  </div>
                )}
                <Link
                  href="/app/patient/rendez-vous"
                  className="mt-3 inline-flex items-center gap-1 border-t border-bordure pt-3 text-[13px] font-semibold text-accent hover:underline"
                >
                  {prochainsRendezVous.length > 0
                    ? "Voir tout"
                    : "Prendre rendez-vous"}
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </Card>
              <Card
                title={
                  <div className="flex items-center gap-2.5">
                    <IconCercle icon={Pill} ton="info" plein taille={32} tailleIcone={15} />
                    <span className="text-[16px]">Traitements actifs</span>
                  </div>
                }
                actions={
                  traitementsEnCours.length > 0 ? (
                    <Badge tone="info">{traitementsEnCours.length}</Badge>
                  ) : undefined
                }
              >
                {traitementsEnCours.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {traitementsEnCours.map((prescription) => {
                      const [lignePrincipale] = prescription.lignes;
                      const autresLignes = prescription.lignes.length - 1;
                      return (
                        <li key={prescription.id}>
                          <Link
                            href="/app/patient/prescriptions"
                            className="flex items-center gap-2.5 rounded-champ px-1.5 py-2.5 transition-colors hover:bg-plan"
                          >
                            <IconCercle icon={Pill} ton="info" taille={28} tailleIcone={13} />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-[14px] font-semibold text-encre">
                                {lignePrincipale?.medicamentNom ?? "Médicament non précisé"}
                              </span>
                              <span className="truncate text-[12.5px] text-encre-attenuee">
                                {lignePrincipale
                                  ? `${lignePrincipale.posologie} · ${lignePrincipale.dureeTraitementJours} jours`
                                  : autresLignes > 0
                                    ? `+ ${autresLignes} médicament${autresLignes > 1 ? "s" : ""}`
                                    : ""}
                              </span>
                            </div>
                            <Badge tone="good">En cours</Badge>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
                    <IconCercle icon={Activity} ton="info" taille={44} tailleIcone={20} />
                    <p className="text-[14px] font-semibold text-encre">
                      Aucun traitement en cours
                    </p>
                    <p className="max-w-[30ch] text-[13px] text-encre-attenuee">
                      Vos prescriptions actives apparaîtront ici après une
                      consultation médicale.
                    </p>
                  </div>
                )}
                <Link
                  href="/app/patient/prescriptions"
                  className="mt-3 inline-flex items-center gap-1 border-t border-bordure pt-3 text-[13px] font-semibold text-accent hover:underline"
                >
                  Voir tout
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </Card>
              <Card
                title={
                  <div className="flex items-center gap-2.5">
                    <IconCercle icon={FlaskConical} ton="vigilance" plein taille={32} tailleIcone={15} />
                    <span className="text-[16px]">Mes examens</span>
                  </div>
                }
                actions={
                  examensRecents.length > 0 ? (
                    <Badge tone="warning">{examensRecents.length}</Badge>
                  ) : undefined
                }
              >
                {examensRecents.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {examensRecents.map((examen) => {
                      const statut = libelleStatutExamen(examen.statut);
                      return (
                        <li key={examen.id}>
                          <Link
                            href="/app/patient/examens"
                            className="flex items-center gap-2.5 rounded-champ px-1.5 py-2.5 transition-colors hover:bg-plan"
                          >
                            <IconCercle icon={FlaskConical} ton="vigilance" taille={28} tailleIcone={13} />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-[14px] font-semibold text-encre">
                                {examen.typeExamen}
                              </span>
                              <span className="truncate text-[12.5px] text-encre-attenuee">
                                {formaterDateCourte(examen.date)}
                              </span>
                            </div>
                            <Badge tone={statut.tone}>{statut.texte}</Badge>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
                    <IconCercle icon={FlaskConical} ton="vigilance" taille={44} tailleIcone={20} />
                    <p className="text-[14px] font-semibold text-encre">
                      Aucun examen pour le moment
                    </p>
                    <p className="max-w-[30ch] text-[13px] text-encre-attenuee">
                      Vos examens de laboratoire apparaîtront ici après une
                      demande de votre médecin.
                    </p>
                  </div>
                )}
                <Link
                  href="/app/patient/examens"
                  className="mt-3 inline-flex items-center gap-1 border-t border-bordure pt-3 text-[13px] font-semibold text-accent hover:underline"
                >
                  Voir tout
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </Card>
            </div>
      </section>
    </div>
  );
}
