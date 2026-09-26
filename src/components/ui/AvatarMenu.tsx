"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export interface AvatarMenuProps {
  nom: string;
  avatarUrl?: string | null;
  /** Identifiant public (BJ-SANTE-<CODE>-0001), absent pour un role qui n'en a pas encore (voir identifiants.ts). */
  identifiant?: string | null;
  /** Server Action de deconnexion (src/modules/identity/actions.ts). */
  logoutAction: () => void;
}

/**
 * Avatar cliquable dans le header : ouvre un menu (Mon profil, Se
 * deconnecter) plutot que d'exposer la deconnexion comme seule action
 * disponible. Fermeture au clic exterieur, a Echap, ou apres selection.
 */
export function AvatarMenu({ nom, avatarUrl, identifiant, logoutAction }: AvatarMenuProps) {
  const [ouvert, setOuvert] = useState(false);
  const conteneurRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;

    function surClicExterieur(evenement: MouseEvent) {
      if (!conteneurRef.current?.contains(evenement.target as Node)) {
        setOuvert(false);
      }
    }

    function surEchap(evenement: KeyboardEvent) {
      if (evenement.key === "Escape") setOuvert(false);
    }

    document.addEventListener("mousedown", surClicExterieur);
    document.addEventListener("keydown", surEchap);
    return () => {
      document.removeEventListener("mousedown", surClicExterieur);
      document.removeEventListener("keydown", surEchap);
    };
  }, [ouvert]);

  return (
    <div ref={conteneurRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((valeur) => !valeur)}
        className={cn(
          "flex items-center gap-1.5 rounded-full p-0.5 transition-colors motion-reduce:transition-none",
          "focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2",
          ouvert ? "bg-white/10" : "hover:bg-white/10"
        )}
      >
        <Avatar name={nom} avatarUrl={avatarUrl} />
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="text-[13px] font-semibold text-white">{nom}</span>
          {identifiant ? (
            <span className="chiffres text-[11px] text-white/60">{identifiant}</span>
          ) : null}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn(
            "mr-1 text-white/70 transition-transform motion-reduce:transition-none",
            ouvert ? "rotate-180" : ""
          )}
        />
      </button>

      {ouvert ? (
        <div
          role="menu"
          aria-label="Menu du compte"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-flottant border border-bordure bg-surface py-1.5 shadow-[var(--ombre-carte)]"
        >
          <div className="border-b border-bordure px-3.5 py-2.5">
            <p className="truncate text-[14px] font-semibold text-encre">{nom}</p>
            {identifiant ? (
              <p className="chiffres text-[12px] text-encre-attenuee">{identifiant}</p>
            ) : null}
          </div>

          <Link
            href="/app/profil"
            role="menuitem"
            onClick={() => setOuvert(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] font-medium text-encre-secondaire transition-colors hover:bg-surface-appui hover:text-encre motion-reduce:transition-none"
          >
            <UserRound size={16} aria-hidden="true" />
            Mon profil
          </Link>

          <Link
            href="/app/securite"
            role="menuitem"
            onClick={() => setOuvert(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] font-medium text-encre-secondaire transition-colors hover:bg-surface-appui hover:text-encre motion-reduce:transition-none"
          >
            <ShieldCheck size={16} aria-hidden="true" />
            Ma sécurité
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-medium text-encre-secondaire transition-colors hover:bg-critique-clair hover:text-critique motion-reduce:transition-none"
            >
              <LogOut size={16} aria-hidden="true" />
              Se déconnecter
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
