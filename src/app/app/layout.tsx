import type { ReactNode } from "react";
import Image from "next/image";
import {
  ArrowRightLeft,
  BadgeCheck,
  Building2,
  CalendarClock,
  CalendarOff,
  ClipboardList,
  CreditCard,
  FileText,
  FileWarning,
  FlaskConical,
  FolderOpen,
  Gauge,
  History,
  Hospital,
  Inbox,
  LayoutDashboard,
  HeartPulse,
  Lock,
  Map,
  MapPin,
  Merge,
  MessageCircleQuestion,
  MessageSquare,
  Pill,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Send,
  Sparkles,
  Stethoscope,
  TrendingUp,
  UserCog,
  Users,
  UserX,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getSession, getSessionPourActivationMfa } from "@/lib/session";
import { getMonProfil, logoutAction } from "@/modules/identity/actions";
import { getNombreNotificationsNonLues } from "@/modules/notification/actions";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { filtrerNavigationParModules } from "@/modules/administration/modules-actifs";
import type { NomRole } from "@/types";
import { AvatarMenu } from "@/components/ui/AvatarMenu";
import { ClocheNotifications } from "@/components/ui/ClocheNotifications";
import { getMesEspaces } from "@/modules/identity/espaces";
import { IndicateurEspace } from "./IndicateurEspace";
import { Sidebar, type ElementNavigation } from "@/components/ui/Sidebar";
import { VerrouillageInactivite } from "@/components/VerrouillageInactivite";

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

const tailleIconeNav = 18;

const iconeTableauDeBord = <LayoutDashboard size={tailleIconeNav} aria-hidden="true" />;

const navigationPatient: ElementNavigation[] = [
  {
    label: "Tableau de bord",
    href: "/app/patient",
    icon: iconeTableauDeBord,
  },
  {
    label: "Mes rendez-vous",
    href: "/app/patient/rendez-vous",
    icon: <CalendarClock size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mes proches",
    href: "/app/patient/proches",
    icon: <Users size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mon dossier",
    href: "/app/patient/dossier",
    icon: <FolderOpen size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mes prescriptions",
    href: "/app/patient/prescriptions",
    icon: <Pill size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mes examens",
    href: "/app/patient/examens",
    icon: <FlaskConical size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mes documents",
    href: "/app/patient/documents",
    icon: <FileText size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Ma carte santé",
    href: "/app/patient/carte",
    icon: <CreditCard size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mes consentements",
    href: "/app/patient/consentements",
    icon: <ShieldCheck size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Demandes d'accès reçues",
    href: "/app/patient/demandes-acces",
    icon: <Inbox size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Qui a consulté mon dossier",
    href: "/app/patient/acces",
    icon: <History size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mes droits sur mes données",
    href: "/app/patient/droits",
    icon: <Lock size={tailleIconeNav} aria-hidden="true" />,
  },
];

/**
 * Navigation par role professionnel (Phase 7-durcissement) : chaque role ne
 * voit que les fonctionnalites que la matrice RBAC (src/security/permissions.ts)
 * lui accorde reellement, jamais un menu generique partage. L'URL
 * "/app/medecin" reste commune au niveau technique, mais chaque role y
 * affiche desormais son propre tableau de bord entierement distinct (voir
 * src/app/app/medecin/page.tsx et ses composants Dashboard*.tsx) : jamais un
 * ecran generique filtre, jamais un lien vers une action que ce role n'a pas
 * le droit d'effectuer.
 */
const navigationMedecin: ElementNavigation[] = [
  { label: "Tableau de bord", href: "/app/medecin", icon: iconeTableauDeBord },
  {
    label: "Patients",
    href: "/app/medecin/patients",
    icon: <Users size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Rendez-vous",
    href: "/app/medecin/rendez-vous",
    icon: <CalendarClock size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Consultations",
    href: "/app/medecin/consultations",
    icon: <ClipboardList size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Prescriptions",
    href: "/app/medecin/prescriptions",
    icon: <Pill size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Examens",
    href: "/app/medecin/examens",
    icon: <FlaskConical size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Références",
    href: "/app/medecin/references",
    icon: <ArrowRightLeft size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Rectifications",
    href: "/app/medecin/rectifications",
    icon: <FileWarning size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Accès d'urgence",
    href: "/app/medecin/urgence",
    icon: <ShieldAlert size={tailleIconeNav} aria-hidden="true" />,
  },
];

/** Infirmier : lecture des consultations et rendez-vous, jamais de creation (voir permissions.ts). */
const navigationInfirmier: ElementNavigation[] = [
  { label: "Tableau de bord", href: "/app/medecin", icon: iconeTableauDeBord },
  {
    label: "Prise en charge",
    href: "/app/medecin/soins",
    icon: <HeartPulse size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Patients",
    href: "/app/medecin/patients",
    icon: <Users size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Rendez-vous",
    href: "/app/medecin/rendez-vous",
    icon: <CalendarClock size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Consultations",
    href: "/app/medecin/consultations",
    icon: <ClipboardList size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Rectifications",
    href: "/app/medecin/rectifications",
    icon: <FileWarning size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Accès d'urgence",
    href: "/app/medecin/urgence",
    icon: <ShieldAlert size={tailleIconeNav} aria-hidden="true" />,
  },
];

/** Agent communautaire : visites de terrain (module suivi communautaire), jamais l'espace clinique medecin. */
const navigationAgentCommunautaire: ElementNavigation[] = [
  { label: "Tableau de bord", href: "/app/medecin", icon: iconeTableauDeBord },
  {
    label: "Mes visites",
    href: "/app/medecin/communautaire",
    icon: <MapPin size={tailleIconeNav} aria-hidden="true" />,
  },
];

/** Pharmacien : delivrance des prescriptions uniquement, jamais l'espace clinique (consultations/examens). */
const navigationPharmacien: ElementNavigation[] = [
  { label: "Tableau de bord", href: "/app/medecin", icon: iconeTableauDeBord },
  {
    label: "Prescriptions à délivrer",
    href: "/app/medecin/pharmacie",
    icon: <Pill size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Historique des délivrances",
    href: "/app/medecin/pharmacie/historique",
    icon: <History size={tailleIconeNav} aria-hidden="true" />,
  },
];

/** Laboratoire : file d'examens a traiter uniquement, jamais l'espace clinique medecin. */
const navigationLaboratoire: ElementNavigation[] = [
  { label: "Tableau de bord", href: "/app/medecin", icon: iconeTableauDeBord },
  {
    label: "Laboratoire",
    href: "/app/medecin/laboratoire",
    icon: <FlaskConical size={tailleIconeNav} aria-hidden="true" />,
  },
];

/**
 * Administrateur d'etablissement : SON PROPRE tableau de bord ("/app/etablissement",
 * personnel + indicateurs locaux, voir Phase 6), jamais l'espace clinique
 * "/app/medecin" partage par les professionnels de sante.
 */
const navigationAdminEtablissement: ElementNavigation[] = [
  { label: "Tableau de bord", href: "/app/etablissement", icon: iconeTableauDeBord },
  {
    label: "Demandes de rendez-vous",
    href: "/app/etablissement/demandes",
    icon: <ClipboardList size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "File du jour",
    href: "/app/etablissement/file-du-jour",
    icon: <CalendarClock size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Fiche de l'établissement",
    href: "/app/etablissement/fiche",
    icon: <Building2 size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Journal d'audit",
    href: "/app/etablissement/audit",
    icon: <History size={tailleIconeNav} aria-hidden="true" />,
  },
];

/** Ministere : SON PROPRE tableau de bord ("/app/ministere", indicateurs nationaux agreges, voir Phase 6). */
const navigationAdminNational: ElementNavigation[] = [
  {
    label: "Tableau de bord",
    href: "/app/ministere",
    icon: <Building2 size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Pilotage",
    href: "/app/pilotage",
    icon: <Gauge size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Journal d'audit",
    href: "/app/ministere/audit",
    icon: <History size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Établissements",
    href: "/app/ministere/etablissements",
    icon: <Hospital size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Référentiel vaccinal",
    href: "/app/ministere/referentiels/vaccins",
    icon: <ClipboardList size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Référentiel médicaments",
    href: "/app/ministere/referentiels/medicaments",
    icon: <Pill size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Référentiel des examens",
    href: "/app/ministere/referentiels/examens",
    icon: <FlaskConical size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Catalogue des notifications",
    href: "/app/ministere/referentiels/notifications",
    icon: <MessageSquare size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Jours fériés",
    href: "/app/ministere/referentiels/jours-feries",
    icon: <CalendarOff size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Listes de référence",
    href: "/app/ministere/referentiels/listes",
    icon: <ClipboardList size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Diagnostics CIM-10",
    href: "/app/ministere/referentiels/cim10",
    icon: <Stethoscope size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Référentiel géographie",
    href: "/app/ministere/referentiels/geographie",
    icon: <Map size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Validation des professionnels",
    href: "/app/ministere/validation-professionnels",
    icon: <BadgeCheck size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Gestion des comptes",
    href: "/app/ministere/comptes",
    icon: <UserCog size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Doublons patients",
    href: "/app/ministere/doublons",
    icon: <Merge size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Tutelles",
    href: "/app/ministere/tutelles",
    icon: <UserX size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Paramètres",
    href: "/app/ministere/parametres",
    icon: <Settings size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Boîte d'envoi SMS",
    href: "/app/ministere/sms",
    icon: <Send size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Analyses assistées",
    href: "/app/ministere/analyses",
    icon: <TrendingUp size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Gouvernance de l'IA",
    href: "/app/ministere/ia",
    icon: <Sparkles size={tailleIconeNav} aria-hidden="true" />,
  },
];

function getNavigationPourRole(role: NomRole | undefined): ElementNavigation[] {
  switch (role) {
    case "patient":
      return navigationPatient;
    case "medecin":
      return navigationMedecin;
    case "infirmier":
      return navigationInfirmier;
    case "agent_communautaire":
      return navigationAgentCommunautaire;
    case "pharmacien":
      return navigationPharmacien;
    case "laboratoire":
      return navigationLaboratoire;
    case "admin_etablissement":
      return navigationAdminEtablissement;
    case "admin_national":
      return navigationAdminNational;
    default:
      return [];
  }
}

/**
 * Layout de l'espace authentifie, sous le segment d'URL "/app" (patient et
 * medecin y sont rattaches : /app/patient, /app/medecin). Defense en
 * profondeur : verifie a nouveau la session ici, en plus du middleware,
 * avant de rendre quoi que ce soit.
 */
export default async function EspaceAuthentifieLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    // F-AUTH-06 (CA-1) : un compte dont le second facteur est obligatoire et
    // pas encore active n'a acces a rien d'autre qu'a son activation.
    const restreinte = await getSessionPourActivationMfa();
    redirect(restreinte?.activationMfaRequise ? "/activation-mfa" : "/connexion");
  }

  // F-ADM-07 : etat des modules metier et du bandeau de demonstration, relu en base a chaque rendu (RG-ADM-50).
  const [profil, nombreNotificationsNonLues, pharmacieActive, laboratoireActif, communautaireActif, bandeauDemo, espaces] =
    await Promise.all([
      getMonProfil(),
      getNombreNotificationsNonLues(),
      estFonctionnaliteActive("pharmacy.module"),
      estFonctionnaliteActive("lab.module"),
      estFonctionnaliteActive("community.module"),
      estFonctionnaliteActive("demo.banner"),
      getMesEspaces(),
    ]);
  const libelleCompte = profil
    ? `${profil.prenom} ${profil.nom}`
    : session.roles[0]
      ? libellesRole[session.roles[0]]
      : "Utilisateur";

  const navigation = filtrerNavigationParModules(getNavigationPourRole(session.roles[0]), {
    "pharmacy.module": pharmacieActive,
    "lab.module": laboratoireActif,
    "community.module": communautaireActif,
  });

  // F-IA-02 : l'assistant citoyen n'apparait dans le menu que si sa fonctionnalite est active (relue en base a chaque rendu).
  if (session.roles[0] === "patient" && (await estFonctionnaliteActive("ai.citizen_assistant"))) {
    navigation.push({
      label: "Assistant",
      href: "/app/patient/assistant",
      icon: <MessageCircleQuestion size={tailleIconeNav} aria-hidden="true" />,
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navigation} />

      <div className="flex h-screen flex-1 flex-col overflow-hidden">
        {bandeauDemo ? (
          <p role="status" className="sans-impression shrink-0 bg-vigilance-clair px-4 py-1.5 text-center text-[13px] font-semibold text-vigilance">
            Environnement de démonstration : les données affichées sont fictives.
          </p>
        ) : null}
        <header className="sans-impression shrink-0 border-b border-bordure bg-marine">
          <div className="flex items-center justify-end gap-2 px-4 py-3 sm:px-6">
            <IndicateurEspace espaces={espaces} />
            <ClocheNotifications nombreNonLues={nombreNotificationsNonLues} />
            <AvatarMenu
              nom={libelleCompte}
              avatarUrl={profil?.avatarUrl}
              identifiant={profil?.identifiant}
              logoutAction={logoutAction}
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-plan">
          <VerrouillageInactivite role={session.roles[0]} logoutAction={logoutAction}>
            {children}
          </VerrouillageInactivite>
        </main>

        <footer className="sans-impression flex shrink-0 flex-wrap items-center justify-between gap-3 bg-marine-fonce px-4 py-3 sm:px-6">
          <Image
            src="/logo-header-blanc.png"
            alt="Ministere de la Sante, Republique du Benin"
            width={106}
            height={30}
            className="h-6 w-auto"
          />
          <p className="text-[12px] text-white/70">
            © {new Date().getFullYear()} Ministère de la Santé, République du Bénin.
          </p>
        </footer>
      </div>
    </div>
  );
}
