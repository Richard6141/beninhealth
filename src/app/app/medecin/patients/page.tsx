import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { getPatientsAvecConsentement } from "@/modules/clinical/actions";
import { DUREES_ACCES_HEURES, MOTIFS_ACCES, libelleDuree } from "@/modules/transfert/code-acces";
import { FormulaireAccesParCode } from "./FormulaireAccesParCode";
import { FormulaireCodePartage } from "./FormulaireCodePartage";
import { ListePatients } from "./ListePatients";

const optionsMotif = Object.entries(MOTIFS_ACCES).map(([value, libelle]) => ({
  value,
  label: libelle.charAt(0).toUpperCase() + libelle.slice(1),
}));
const optionsDuree = DUREES_ACCES_HEURES.map((heures) => ({
  value: String(heures),
  label: libelleDuree(heures),
}));

/**
 * Ecran "Mes patients" (F-CLI-02 du pack) : liste des patients ayant
 * accorde un consentement au medecin connecte (getPatientsAvecConsentement,
 * meme source que le selecteur de consultations), avec recherche en direct
 * et creation rapide d'un patient sans compte (F-CLI-03).
 */
export default async function PatientsPage() {
  const [patients, npiActif] = await Promise.all([
    getPatientsAvecConsentement(),
    estFonctionnaliteActive("access.by_npi"),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/medecin"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-bold text-titre">Mes patients</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Patients vous ayant accordé l&apos;accès à leur dossier.
        </p>
      </header>

      <FormulaireAccesParCode npiActif={npiActif} optionsMotif={optionsMotif} optionsDuree={optionsDuree} />

      <FormulaireCodePartage />

      <ListePatients patients={patients} />
    </div>
  );
}
