import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { FormulaireAccesUrgence } from "./FormulaireAccesUrgence";

/**
 * Ecran "Acces d'urgence" (F-CLI-10 du pack, bris de glace) : reserve aux
 * situations ou le patient est incapable de consentir (inconscient, detresse
 * vitale, confus). Chaque acces est trace, limite a 5 par professionnel et
 * par 24h (RG-CLI-90), exclut les donnees sensibles (RG-CLI-91), expire
 * automatiquement apres 4 heures sans possibilite de prolongation
 * (RG-CLI-93).
 */
export default function AccesUrgencePage() {
  return (
    <div className="conteneur-page mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/medecin"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-critique">
          <ShieldAlert size={16} aria-hidden="true" />
          Acces d&apos;urgence
        </p>
        <h1 className="text-[28px] font-bold text-titre">Bris de glace</h1>
        <p className="max-w-xl text-[15px] text-encre-secondaire">
          Reserve aux situations ou le patient est incapable de consentir. Chaque acces est trace,
          controle et limite dans le temps.
        </p>
      </header>

      <Alert level="warning" title="A n'utiliser qu'en dernier recours">
        Cet acces contourne l&apos;autorisation habituelle du patient. Il est limite a 5 declenchements
        par professionnel et par 24 heures, n&apos;ouvre jamais les resultats sensibles, expire
        automatiquement apres 4 heures, et fait l&apos;objet d&apos;une revue.
      </Alert>

      <FormulaireAccesUrgence />
    </div>
  );
}
