import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { libelleModule, MESSAGE_MODULE_INACTIF, type CleModuleMetier } from "@/modules/administration/modules-actifs";

/**
 * Ecran affiche a la place d'une page de module metier retiree par
 * l'administration nationale (F-ADM-07, fonctionnalite pharmacy.module,
 * lab.module ou community.module inactive). Composant serveur, aucune donnee.
 */
export function ModuleDesactive({ cle }: { cle: CleModuleMetier }) {
  return (
    <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href="/app/medecin" className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>
      <Alert level="warning" title={`Module ${libelleModule(cle)} désactivé`}>
        {MESSAGE_MODULE_INACTIF}
      </Alert>
    </div>
  );
}
