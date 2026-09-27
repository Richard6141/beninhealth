import { redirect } from "next/navigation";
import { getMesEspaces } from "@/modules/identity/espaces";
import { SectionEspaces } from "./SectionEspaces";

/**
 * Choix de l'espace actif (F-AUTH-07 du pack). Un compte qui n'a qu'un espace
 * est renvoye directement vers son accueil : il n'y a rien a choisir.
 */
export default async function EspacesPage() {
  const espaces = await getMesEspaces();

  if (espaces.length === 0) {
    redirect("/connexion");
  }

  if (espaces.length === 1) {
    redirect(espaces[0].accueil);
  }

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Mon compte</p>
        <h1 className="text-[28px] font-bold text-titre">Choisir mon espace</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Votre compte donne accès à plusieurs espaces. Vous agissez dans un seul à la fois : son nom reste affiché
          en haut de chaque page, et seuls les droits de cet espace s&apos;appliquent.
        </p>
      </header>

      <SectionEspaces espaces={espaces} />
    </div>
  );
}
