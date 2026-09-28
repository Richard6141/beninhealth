import Link from "next/link";
import { UserRound, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import type { OngletPersonne } from "@/modules/patient/tableau-de-bord-regles";

/**
 * Selecteur de personne du tableau de bord citoyen (F-CIT-02) : onglets
 * "Moi" puis une entree par personne a charge geree (F-CIT-07/08). Simple
 * navigation par lien (`?personne=<id>`), rendue cote serveur, sans
 * JavaScript client : aucune logique d'acces ici, la page cible reverifie
 * tout via proches/actions.ts (voir modules/patient/tableau-de-bord-regles.ts).
 * N'est affiche que si le citoyen gere au moins une personne a charge.
 */
export function SelecteurPersonne({ onglets }: { onglets: OngletPersonne[] }) {
  if (onglets.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Choisir la personne dont afficher le tableau de bord">
      <ul className="flex flex-wrap gap-2">
        {onglets.map((onglet) => {
          const Icone = onglet.procheId === null ? UserRound : Users;
          return (
            <li key={onglet.procheId ?? "moi"}>
              <Link
                href={onglet.href}
                aria-current={onglet.actif ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                  onglet.actif
                    ? "border-accent bg-accent text-white"
                    : "border-bordure-forte bg-surface text-encre hover:bg-surface-appui"
                )}
              >
                <Icone size={16} aria-hidden="true" />
                {onglet.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
