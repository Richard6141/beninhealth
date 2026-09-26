import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAccesUrgenceARevoir } from "@/modules/audit/actions";
import { Alert } from "@/components/ui/Alert";
import { ListeAccesUrgenceARevoir } from "./ListeAccesUrgenceARevoir";

/**
 * Ecran "Revoir les accès d'urgence" (F-AUD-02 du pack), réservé à
 * l'administrateur d'établissement, scopé à son propre établissement (même
 * adaptation de rôle que F-AUD-01, voir src/modules/audit/actions.ts).
 */
export default async function AccesUrgenceEtablissementPage() {
  const acces = await getAccesUrgenceARevoir();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/etablissement/audit"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au journal d&apos;audit
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Établissement</p>
        <h1 className="text-[28px] font-bold text-titre">Accès d&apos;urgence à revoir</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Chaque accès d&apos;urgence déclenché par un professionnel de votre établissement doit être revu.
        </p>
      </header>

      {acces === null ? (
        <Alert level="critical" title="Accès refusé">
          Votre session n&apos;a pas les droits nécessaires pour revoir les accès d&apos;urgence.
        </Alert>
      ) : (
        <ListeAccesUrgenceARevoir acces={acces} />
      )}
    </div>
  );
}
