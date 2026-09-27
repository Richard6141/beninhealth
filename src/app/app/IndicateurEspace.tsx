import Link from "next/link";
import { Repeat2 } from "lucide-react";
import type { EspaceUtilisateur } from "@/modules/identity/espaces-regles";

/**
 * Espace actif affiche en permanence dans l'en-tete (F-AUTH-07 : "il doit
 * toujours savoir dans quel espace il agit"), avec un lien vers le choix
 * d'espace quand le compte en a plusieurs. Composant serveur : l'espace vient
 * de la session serveur, jamais du navigateur (RG-AUTH-60).
 */
export function IndicateurEspace({ espaces }: { espaces: EspaceUtilisateur[] }) {
  const actif = espaces.find((espace) => espace.actif);

  if (!actif) return null;

  const nom = actif.etablissementNom ? `${actif.libelle}, ${actif.etablissementNom}` : actif.libelle;

  return (
    <div className="mr-auto flex min-w-0 items-center gap-3">
      <p className="truncate text-[13px] font-semibold text-white" aria-label={`Espace actif : ${nom}`}>
        <span className="mr-2 text-[11px] uppercase tracking-[0.1em] text-white/70">Espace</span>
        {nom}
      </p>
      {espaces.length > 1 ? (
        <Link
          href="/app/espaces"
          className="inline-flex shrink-0 items-center gap-1 rounded-champ border border-white/40 px-2.5 py-1 text-[12px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
        >
          <Repeat2 size={13} aria-hidden="true" />
          Changer d&apos;espace
        </Link>
      ) : null}
    </div>
  );
}
