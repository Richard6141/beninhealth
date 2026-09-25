"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ElementNavigation {
  label: string;
  href: string;
  /**
   * Icone deja rendue (ex. <LayoutDashboard size={18} />), pas le composant
   * lui-meme : un composant lucide-react (objet forwardRef) ne peut pas
   * traverser la frontiere Server -> Client Component en tant que prop brute.
   */
  icon: ReactNode;
}

export interface SidebarProps {
  items: ElementNavigation[];
}

/**
 * Un lien est actif sur sa propre route et sur toutes ses sous-routes (ex :
 * /app/patient/dossier reste actif sur /app/patient/dossier/xyz), sauf pour
 * le tableau de bord racine qui ne doit s'allumer que sur sa propre page.
 */
function estActif(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/app/patient" || href === "/app/medecin") return false;
  return pathname.startsWith(`${href}/`);
}

/**
 * Navigation laterale, responsive (voir design-system-base-fundlab.md §6,
 * "Panneau coulissant depuis le bord" : glissement horizontal, 0.22-0.24s
 * ease-out). Sous le palier "md" (tablette large / bureau), la sidebar reste
 * fixe et toujours visible comme avant. En dessous (mobile, tablette
 * portrait), elle est masquee par defaut et s'ouvre en tiroir par-dessus le
 * contenu, declenchee par un bouton hamburger dans l'en-tete. Se ferme
 * automatiquement a chaque changement de page, comme attendu d'un tiroir de
 * navigation mobile.
 */
export function Sidebar({ items }: SidebarProps) {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);

  // Fermeture du tiroir a chaque changement de page : ajustement d'etat
  // pendant le rendu (comparaison avec le pathname precedent), plutot qu'un
  // appel setState dans un effet, meme pattern que FormulaireNouveauRendezVous.tsx.
  const [pathnamePrecedent, setPathnamePrecedent] = useState(pathname);
  if (pathname !== pathnamePrecedent) {
    setPathnamePrecedent(pathname);
    setOuvert(false);
  }

  useEffect(() => {
    if (!ouvert) return;
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = precedent;
    };
  }, [ouvert]);

  const contenuNavigation = (
    <>
      <div className="flex items-center justify-between px-2">
        <Link href="/" className="flex items-center">
          <Image
            src="/image.png"
            alt="Ministere de la Sante, Republique du Benin"
            width={141}
            height={40}
            className="h-11 w-auto"
            priority
          />
        </Link>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          aria-label="Fermer le menu"
          title="Fermer le menu"
          className="flex h-9 w-9 items-center justify-center rounded-champ text-encre-secondaire hover:bg-surface-appui hover:text-encre focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 md:hidden"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Navigation principale" className="flex flex-col gap-1">
        {items.map((item) => {
          const actif = estActif(pathname ?? "", item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={actif ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-champ px-3 py-2.5 text-[14px] font-semibold transition-colors motion-reduce:transition-none",
                "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                actif
                  ? "bg-marine text-white"
                  : "text-encre-secondaire hover:bg-surface-appui hover:text-encre"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Declencheur mobile : bouton hamburger flottant, jamais affiche a partir du palier md (sidebar fixe visible a la place). */}
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label="Ouvrir le menu de navigation"
        title="Ouvrir le menu de navigation"
        className="sans-impression fixed left-4 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-champ border border-bordure-forte bg-surface text-encre shadow-[var(--ombre-carte)] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 md:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {/* Fond assombri du tiroir mobile : ferme le tiroir au clic, jamais affiche a partir du palier md. */}
      {ouvert ? (
        <div
          role="presentation"
          onClick={() => setOuvert(false)}
          className="sans-impression fixed inset-0 z-40 bg-encre/40 md:hidden"
        />
      ) : null}

      <div
        className={cn(
          "sans-impression fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col gap-6 border-r border-bordure bg-surface px-3 py-6 transition-transform duration-[240ms] ease-out motion-reduce:transition-none",
          "md:static md:z-auto md:w-60 md:translate-x-0",
          ouvert ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {contenuNavigation}
      </div>
    </>
  );
}
