import type { ReactNode } from "react";
import { garderEspace } from "@/lib/garde-espace";

/** Barriere de navigation de l'espace actif (F-AUTH-07, RG-AUTH-60), voir src/lib/garde-espace.ts. */
export default async function EspaceLayout({ children }: { children: ReactNode }) {
  await garderEspace(["patient"]);
  return children;
}
