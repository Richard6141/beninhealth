import type { ReactNode } from "react";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logoutAction } from "@/modules/identity/actions";
import type { NomRole } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";

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

  const libelleCompte = session.roles[0]
    ? libellesRole[session.roles[0]]
    : "Utilisateur";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sans-impression border-b border-bordure bg-surface">
        <div className="conteneur-page flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/image.png"
              alt="Ministere de la Sante, Republique du Benin"
              width={141}
              height={40}
              className="h-10 w-auto"
              priority
            />
            <span className="hidden text-[12px] font-semibold text-encre-secondaire sm:inline">
              Bénin Health Intelligence Platform
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Avatar name={libelleCompte} />
            <form action={logoutAction}>
              <IconButton type="submit" icon={LogOut} label="Se déconnecter" />
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 bg-plan">{children}</main>
    </div>
  );
}
