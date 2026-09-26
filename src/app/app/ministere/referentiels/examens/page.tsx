import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getReferentielExamensComplet } from "@/modules/administration/referentiel-examens";
import { FAMILLES_EXAMENS } from "@/modules/laboratoire/referentiel-examens";
import { SectionReferentielExamens } from "./SectionReferentielExamens";

/**
 * Ecran "Référentiel des examens" (F-ADM-04 du pack, 3e référentiel concret
 * après vaccins et médicaments : voir
 * src/modules/administration/referentiel-examens.ts pour le détail des
 * limites assumées), réservé au ministère (admin_national). Remplace le
 * tableau statique historique de
 * src/modules/laboratoire/referentiel-examens.ts par une liste
 * administrable : ajout, activation/désactivation (RG-ADM-20 : jamais de
 * suppression), réordonnancement au sein de chaque famille.
 */
export default async function ReferentielExamensPage() {
  const referentiel = await getReferentielExamensComplet();

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
        <h1 className="text-[28px] font-bold text-titre">Référentiel des examens</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Liste des examens proposés dans le formulaire de demande d&apos;examen, groupés par famille. Une
          entrée désactivée disparaît du formulaire mais reste visible sur tout examen déjà enregistré sous
          ce libellé.
        </p>
      </header>

      <SectionReferentielExamens referentiel={referentiel} familles={FAMILLES_EXAMENS} />
    </div>
  );
}
