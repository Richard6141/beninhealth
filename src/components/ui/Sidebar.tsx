"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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

export function Sidebar({ items }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="sans-impression flex w-60 shrink-0 flex-col gap-6 border-r border-bordure bg-surface px-3 py-6">
      <Link href="/" className="flex items-center px-2">
        <Image
          src="/image.png"
          alt="Ministere de la Sante, Republique du Benin"
          width={141}
          height={40}
          className="h-9 w-auto"
          priority
        />
      </Link>

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
                  ? "bg-[#162233] text-white"
                  : "text-encre-secondaire hover:bg-surface-appui hover:text-encre"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
