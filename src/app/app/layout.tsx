import type { ReactNode } from "react";
import {
  ArrowRightLeft,
  Building2,
  CalendarClock,
  ClipboardList,
  FlaskConical,
  FolderOpen,
  History,
  LayoutDashboard,
  HeartPulse,
  Lock,
  MapPin,
  Pill,
  ShieldAlert,
  ShieldCheck,
  Users,
  UserX,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMonProfil, logoutAction } from "@/modules/identity/actions";
import { getNombreNotificationsNonLues } from "@/modules/notification/actions";
import type { NomRole } from "@/types";
import { AvatarMenu } from "@/components/ui/AvatarMenu";
import { ClocheNotifications } from "@/components/ui/ClocheNotifications";
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
    label: "Mes consentements",
    href: "/app/patient/consentements",
    icon: <ShieldCheck size={tailleIconeNav} aria-hidden="true" />,
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
    label: "File du jour",
    href: "/app/etablissement/file-du-jour",
    icon: <CalendarClock size={tailleIconeNav} aria-hidden="true" />,
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
    label: "Référentiel vaccinal",
    href: "/app/ministere/referentiels/vaccins",
    icon: <ClipboardList size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Tutelles",
    href: "/app/ministere/tutelles",
    icon: <UserX size={tailleIconeNav} aria-hidden="true" />,
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
    redirect("/connexion");
  }

  const [profil, nombreNotificationsNonLues] = await Promise.all([
    getMonProfil(),
    getNombreNotificationsNonLues(),
  ]);
  const libelleCompte = profil
    ? `${profil.prenom} ${profil.nom}`
    : session.roles[0]
      ? libellesRole[session.roles[0]]
      : "Utilisateur";

  const navigation = getNavigationPourRole(session.roles[0]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navigation} />

      <div className="flex h-screen flex-1 flex-col overflow-hidden">
        <header className="sans-impression shrink-0 border-b border-bordure bg-marine">
          <div className="flex items-center justify-end gap-2 px-4 py-3 sm:px-6">
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

        <footer className="sans-impression shrink-0 border-t border-bordure bg-surface px-4 py-3 text-center text-[12px] text-encre-attenuee sm:px-6">
          © {new Date().getFullYear()} Ministère de la Santé, République du Bénin.
        </footer>
      </div>
    </div>
  );
}
