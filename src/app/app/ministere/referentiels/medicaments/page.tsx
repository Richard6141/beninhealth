import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getReferentielMedicamentsComplet } from "@/modules/administration/referentiel-medicaments";
import { SectionReferentielMedicaments } from "./SectionReferentielMedicaments";

/**
 * Ecran "Référentiel médicaments" (F-ADM-04 du pack, deuxième référentiel
 * couvert après le référentiel vaccinal : voir
 * src/modules/administration/referentiel-medicaments.ts pour le détail des
 * limites assumées), réservé au ministère (admin_national). Catalogue déjà
 * utilisé par le médecin (prescription) et le pharmacien (délivrance) :
 * désactiver une entrée (RG-ADM-20, jamais de suppression) la retire des
 * nouveaux choix proposés mais ne touche jamais aux prescriptions déjà
 * enregistrées sous ce médicament.
 */
export default async function ReferentielMedicamentsPage() {
  const referentiel = await getReferentielMedicamentsComplet();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/ministere"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
        <h1 className="text-[28px] font-bold text-titre">Référentiel médicaments</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Catalogue proposé au médecin à la création d&apos;une prescription. Une entrée désactivée
          disparaît des nouveaux choix mais reste visible sur toute prescription déjà enregistrée.
        </p>
      </header>

      <SectionReferentielMedicaments referentiel={referentiel} />
    </div>
  );
}
