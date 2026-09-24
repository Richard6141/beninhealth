import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStatistiquesNationales } from "@/modules/analytics/actions";
import { listEtablissementsDetail } from "@/modules/identity/gestion-comptes";
import { Tabs } from "@/components/ui/Tabs";
import { ChangerMotDePasseModal } from "./ChangerMotDePasseModal";
import { EtablissementsSection } from "./EtablissementsSection";
import { IndicateursNationaux } from "./IndicateursNationaux";

/**
 * Ecran ministere (Phase 6, role admin_national) : indicateurs nationaux
 * agreges (module analytics) et gestion des etablissements du reseau
 * (module identity/gestion-comptes).
 *
 * Defense en profondeur : la redirection post-connexion vers /app/ministere
 * pour admin_national est deja geree ailleurs (src/modules/identity/actions.ts,
 * src/app/page.tsx, non modifies ici), mais cet ecran verifie a nouveau le
 * role de l'appelant avant de rendre quoi que ce soit, comme
 * src/app/app/layout.tsx le fait deja pour la session. getStatistiquesNationales
 * et listEtablissementsDetail verifient elles-memes le role cote serveur et
 * ne renvoient jamais de donnee si l'appelant n'est pas admin_national (Zero
 * Trust) : cette verification supplementaire n'est qu'un confort d'usage,
 * jamais le seul rempart.
 */
export default async function MinisterePage() {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_national")) {
    redirect("/app");
  }

  const [statistiques, etablissements] = await Promise.all([
    getStatistiquesNationales(),
    listEtablissementsDetail(),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Espace ministere
          </p>
          <h1 className="text-[28px] font-black text-encre">Pilotage national</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Indicateurs sanitaires agreges et gestion des etablissements du
            reseau national de sante.
          </p>
        </div>
        <ChangerMotDePasseModal />
      </header>

      <Tabs
        label="Sections du tableau de bord ministere"
        items={[
          {
            id: "indicateurs",
            label: "Indicateurs nationaux",
            content: <IndicateursNationaux statistiques={statistiques} />,
          },
          {
            id: "etablissements",
            label: "Etablissements",
            content: <EtablissementsSection etablissements={etablissements} />,
          },
        ]}
      />
    </div>
  );
}
