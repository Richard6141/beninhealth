import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

/**
 * Layout de l'espace terrain (F-COM-01, F-COM-08), reserve au role
 * agent_communautaire. Controle de session cote serveur avant tout rendu :
 * les ecrans enfants (Composants Client) supposent une session valide.
 */
export default async function LayoutTerrain({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  if (!session.roles.some((role) => can(role, "create", "personne_communautaire"))) {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-semibold text-slate-700">Espace terrain, agent communautaire</p>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
    </div>
  );
}
