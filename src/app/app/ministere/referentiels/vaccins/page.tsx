import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getReferentielVaccinsComplet } from "@/modules/administration/referentiel-vaccinal";
import { SectionReferentielVaccinal } from "./SectionReferentielVaccinal";

/**
 * Ecran "Référentiel vaccinal" (F-ADM-04 du pack, périmètre réduit à ce seul
 * référentiel : voir src/modules/administration/referentiel-vaccinal.ts
 * pour le détail des limites assumées), réservé au ministère
 * (admin_national). Remplace le tableau statique historique de
 * src/modules/vaccination/referentiel.ts par une liste administrable :
 * ajout, activation/désactivation (RG-ADM-20 : jamais de suppression),
 * réordonnancement.
 */
export default async function ReferentielVaccinsPage() {
  const referentiel = await getReferentielVaccinsComplet();

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
        <h1 className="text-[28px] font-bold text-titre">Référentiel vaccinal</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Liste des vaccins proposés dans le formulaire d&apos;enregistrement d&apos;une vaccination. Une
          entrée désactivée disparaît du formulaire mais reste visible sur toute vaccination déjà
          enregistrée sous ce nom.
        </p>
      </header>

      <SectionReferentielVaccinal referentiel={referentiel} />
    </div>
  );
}
