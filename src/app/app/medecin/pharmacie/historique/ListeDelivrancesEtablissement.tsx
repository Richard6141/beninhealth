import { Ban } from "lucide-react";
import type {
  DelivranceHistoriqueEtablissement,
  ResultatHistoriqueDelivrances,
} from "@/modules/prescription/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { libelleMotifNonDelivrance } from "@/modules/prescription/referentiel-delivrance";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

const styleChampFiltre =
  "h-9 rounded-champ border border-bordure-forte bg-surface px-2.5 text-[13px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

function CarteDelivrance({ delivrance }: { delivrance: DelivranceHistoriqueEtablissement }) {
  return (
    <div className="flex flex-col gap-2 rounded-champ border border-bordure bg-plan p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-encre">{formaterDateHeure(delivrance.date)}</p>
          <p className="text-[12px] text-encre-attenuee">
            Ordonnance {delivrance.numeroOrdonnance} · {delivrance.patientNomComplet} ({delivrance.patientAge} ans) ·
            par {delivrance.pharmacienNomComplet}
          </p>
        </div>
        {delivrance.annulee ? <Badge tone="critical">Annulée</Badge> : null}
      </div>
      <ul className="flex flex-col gap-1">
        {delivrance.lignes.map((ligne, index) => (
          <li key={index} className="text-[13px] text-encre-secondaire">
            <span className="font-semibold text-encre">{ligne.medicamentNom}</span> : {ligne.quantiteDelivree} unité
            {ligne.quantiteDelivree > 1 ? "s" : ""}
            {ligne.medicamentDelivreNom ? ` (substitué par ${ligne.medicamentDelivreNom})` : ""}
            {ligne.motifNonDelivrance ? ` : ${libelleMotifNonDelivrance(ligne.motifNonDelivrance)}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Vue transversale de l'historique des delivrances de la pharmacie (F-PHA-04
 * du pack), filtrable par periode et par medicament. Formulaire en GET, meme
 * patron que ListeJournalAudit.tsx : aucun JavaScript necessaire, la page se
 * re-rend cote serveur avec les nouveaux searchParams.
 */
export function ListeDelivrancesEtablissement({
  resultat,
  filtres,
}: {
  resultat: ResultatHistoriqueDelivrances;
  filtres: { dateDebut: string; dateFin: string; medicament: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-champ border border-bordure bg-plan p-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-debut" className="text-[12px] font-semibold text-encre-secondaire">
            Depuis le
          </label>
          <input
            id="filtre-debut"
            type="date"
            name="dateDebut"
            defaultValue={filtres.dateDebut}
            className={styleChampFiltre}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-fin" className="text-[12px] font-semibold text-encre-secondaire">
            Jusqu&apos;au
          </label>
          <input
            id="filtre-fin"
            type="date"
            name="dateFin"
            defaultValue={filtres.dateFin}
            className={styleChampFiltre}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-medicament" className="text-[12px] font-semibold text-encre-secondaire">
            Médicament
          </label>
          <input
            id="filtre-medicament"
            type="text"
            name="medicament"
            placeholder="Nom du médicament"
            defaultValue={filtres.medicament}
            className={styleChampFiltre}
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-champ bg-accent px-4 text-[13px] font-semibold text-surface transition-colors motion-reduce:transition-none hover:opacity-90"
        >
          Filtrer
        </button>
      </form>

      {!resultat.acces ? (
        <Card>
          <p className="text-[13px] text-encre-secondaire">
            Votre session ne dispose pas des droits nécessaires pour consulter cet historique.
          </p>
        </Card>
      ) : resultat.plageInvalide ? (
        <Card>
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
              <Ban size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">Période invalide</p>
            <p className="max-w-[42ch] text-[13px] text-encre-attenuee">
              La date de fin doit être postérieure à la date de début, sur une plage d&apos;au plus 92 jours.
            </p>
          </div>
        </Card>
      ) : resultat.delivrances.length === 0 ? (
        <Card>
          <p className="text-[13px] text-encre-attenuee">Aucune délivrance sur cette période.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {resultat.delivrances.map((delivrance) => (
            <CarteDelivrance key={delivrance.id} delivrance={delivrance} />
          ))}
        </div>
      )}
    </div>
  );
}
