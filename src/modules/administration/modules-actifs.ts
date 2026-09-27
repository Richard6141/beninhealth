import type { CleFonctionnalite } from "./fonctionnalites-catalogue";

/**
 * Modules metier activables (F-ADM-07 du pack) : un module retire par
 * l'administration nationale disparait de la navigation et refuse ses
 * actions. Module pur (pas de "use server") : la lecture des drapeaux en base
 * est faite par l'appelant (estFonctionnaliteActive, parametres.ts).
 *
 * Les actions serveur d'un module inactif renvoient MESSAGE_MODULE_INACTIF ;
 * la navigation est filtree par prefixe d'URL. Les autres routes du module
 * (sous-pages) affichent, elles, l'ecran "module desactive" quand elles
 * appellent modulePageActive.
 */

export type CleModuleMetier = Extract<CleFonctionnalite, "pharmacy.module" | "lab.module" | "community.module">;

export const MODULES_METIER: readonly { cle: CleModuleMetier; libelle: string; prefixeUrl: string }[] = [
  { cle: "pharmacy.module", libelle: "pharmacie", prefixeUrl: "/app/medecin/pharmacie" },
  { cle: "lab.module", libelle: "laboratoire", prefixeUrl: "/app/medecin/laboratoire" },
  { cle: "community.module", libelle: "suivi communautaire", prefixeUrl: "/app/medecin/communautaire" },
];

export const MESSAGE_MODULE_INACTIF = "Ce module a été désactivé par l'administration nationale.";

export type EtatModules = Record<CleModuleMetier, boolean>;

/** Retire de la navigation les entrees dont l'URL appartient a un module inactif (l'URL du module elle-meme ou ses sous-pages). */
export function filtrerNavigationParModules<T extends { href: string }>(elements: readonly T[], etat: EtatModules): T[] {
  return elements.filter((element) =>
    MODULES_METIER.every((definition) => {
      const appartient = element.href === definition.prefixeUrl || element.href.startsWith(`${definition.prefixeUrl}/`);
      return !appartient || etat[definition.cle];
    })
  );
}

/** Libelle lisible du module pour l'ecran "module desactive". */
export function libelleModule(cle: CleModuleMetier): string {
  return MODULES_METIER.find((definition) => definition.cle === cle)?.libelle ?? cle;
}
