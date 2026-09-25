import type { ReactNode } from "react";
import {
  CalendarClock,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  Pill,
  ShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMonProfil, logoutAction } from "@/modules/identity/actions";
import type { NomRole } from "@/types";
import { AvatarMenu } from "@/components/ui/AvatarMenu";
import { Sidebar, type ElementNavigation } from "@/components/ui/Sidebar";

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

/**
 * Roles rattaches au tableau de bord "/app/medecin" (voir le meme decoupage
 * dans src/app/app/medecin/page.tsx) : tout professionnel de sante, pas
 * seulement les medecins au sens strict.
 */
const rolesProfessionnels: NomRole[] = [
  "medecin",
  "infirmier",
  "agent_communautaire",
  "pharmacien",
  "laboratoire",
  "admin_etablissement",
];

const tailleIconeNav = 18;

const navigationPatient: ElementNavigation[] = [
  {
    label: "Tableau de bord",
    href: "/app/patient",
    icon: <LayoutDashboard size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mes rendez-vous",
    href: "/app/patient/rendez-vous",
    icon: <CalendarClock size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mon dossier",
    href: "/app/patient/dossier",
    icon: <FolderOpen size={tailleIconeNav} aria-hidden="true" />,
  },
  {
    label: "Mes consentements",
    href: "/app/patient/consentements",
    icon: <ShieldCheck size={tailleIconeNav} aria-hidden="true" />,
  },
];

const navigationProfessionnel: ElementNavigation[] = [
  {
    label: "Tableau de bord",
    href: "/app/medecin",
    icon: <LayoutDashboard size={tailleIconeNav} aria-hidden="true" />,
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
];

/**
 * Phase 9 : lien pharmacie ajoute uniquement pour ce role, en plus de la
 * navigation professionnelle commune (pas en remplacement) : un pharmacien
 * reste un professionnel de sante comme un autre pour le reste de l'espace.
 */
const elementPharmacie: ElementNavigation = {
  label: "Prescriptions à délivrer",
  href: "/app/medecin/pharmacie",
  icon: <Pill size={tailleIconeNav} aria-hidden="true" />,
};

function getNavigationPourRole(role: NomRole | undefined): ElementNavigation[] {
  if (role === "patient") return navigationPatient;
  if (role === "pharmacien") return [...navigationProfessionnel, elementPharmacie];
  if (role && rolesProfessionnels.includes(role)) return navigationProfessionnel;
  return [];
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

  const profil = await getMonProfil();
  const libelleCompte = profil
    ? `${profil.prenom} ${profil.nom}`
    : session.roles[0]
      ? libellesRole[session.roles[0]]
      : "Utilisateur";

  const navigation = getNavigationPourRole(session.roles[0]);

  return (
    <div className="flex min-h-screen">
      <Sidebar items={navigation} />

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sans-impression border-b border-bordure bg-[#162233]">
          <div className="flex items-center justify-end gap-3 px-4 py-3 sm:px-6">
            <AvatarMenu
              nom={libelleCompte}
              avatarUrl={profil?.avatarUrl}
              logoutAction={logoutAction}
            />
          </div>
        </header>

        <main className="flex-1 bg-plan">{children}</main>
      </div>
    </div>
  );
}
