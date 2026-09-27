import type { ReactNode } from "react";
import { ROLES_ESPACE_ETABLISSEMENT, garderEspace } from "@/lib/garde-espace";

/** Barriere de navigation de l'espace actif (F-AUTH-07, RG-AUTH-60), voir src/lib/garde-espace.ts. */
export default async function EspaceLayout({ children }: { children: ReactNode }) {
  await garderEspace(ROLES_ESPACE_ETABLISSEMENT);
  return children;
}
