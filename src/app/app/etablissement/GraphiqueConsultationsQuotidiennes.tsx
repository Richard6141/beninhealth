import type { PointJournalierConsultations } from "@/modules/pilotage/lecture";

const LIBELLES_JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/** Transforme "AAAA-MM-JJ" en libellé court francais, ex. "15/01". */
function libelleJourCourt(dateIso: string): string {
  const [, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}`;
}

function jourDeLaSemaine(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  return LIBELLES_JOURS_COURTS[date.getUTCDay()] ?? "";
}

export interface GraphiqueConsultationsQuotidiennesProps {
  donnees: PointJournalierConsultations[];
}

/**
 * Meme patron que GraphiqueConsultationsMensuelles.tsx (barres HTML/Tailwind
 * pures, aucune librairie, alternative en tableau via <details>), mais au
 * grain jour et masquage petits effectifs (RG-PIL-02) : un point dont
 * `valeur` est null est un jour de 1 a 4 consultations, jamais transmis en
 * clair par le serveur (voir src/modules/pilotage/lecture.ts). Il est
 * represente par une barre a hauteur fixe minimale (jamais proportionnelle a
 * la vraie valeur, qui n'existe meme pas cote client) et le libelle "< 5",
 * pour ne pas laisser deviner la valeur exacte par la hauteur de la barre.
 */
export function GraphiqueConsultationsQuotidiennes({
  donnees,
}: GraphiqueConsultationsQuotidiennesProps) {
  if (donnees.length === 0) {
    return (
      <p className="text-[13px] text-encre-attenuee">
        Aucune donnée de consultation disponible pour cette période.
      </p>
    );
  }

  const maximum = Math.max(1, ...donnees.map((point) => point.valeur ?? 0));
  const descriptionAccessible = donnees
    .map((point) => `${libelleJourCourt(point.date)} : ${point.valeur === null ? "moins de 5" : point.valeur}`)
    .join(", ");

  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={`Nombre de consultations par jour. ${descriptionAccessible}.`}
        className="flex h-40 items-end gap-[3px] border-b border-bordure-forte px-1"
      >
        {donnees.map((point) => {
          const masque = point.valeur === null;
          const hauteurPourcent = masque ? 8 : Math.max(4, Math.round((point.valeur! / maximum) * 100));
          const libelleValeur = masque ? "< 5" : String(point.valeur);
          return (
            <div key={point.date} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="chiffres text-[11px] font-semibold text-encre">{libelleValeur}</span>
              <div
                aria-hidden="true"
                title={`${libelleJourCourt(point.date)} : ${libelleValeur} consultation${point.valeur === 1 ? "" : "s"}`}
                style={{ height: `${hauteurPourcent}%` }}
                className={masque ? "w-full max-w-[18px] bg-encre-attenuee/40" : "w-full max-w-[18px] bg-accent"}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="flex gap-[3px] px-1">
        {donnees.map((point) => (
          <span key={point.date} className="flex-1 text-center text-[10px] text-encre-attenuee">
            {jourDeLaSemaine(point.date)}
            <br />
            {libelleJourCourt(point.date)}
          </span>
        ))}
      </div>

      <details>
        <summary className="w-fit cursor-pointer text-[13px] font-semibold text-accent hover:underline">
          Afficher les données sous forme de tableau
        </summary>
        <table className="mt-2 w-full border-collapse text-[13px]">
          <caption className="sr-only">Nombre de consultations par jour</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-bordure px-2 py-1.5 text-left font-semibold text-encre-secondaire">
                Jour
              </th>
              <th scope="col" className="border-b border-bordure px-2 py-1.5 text-right font-semibold text-encre-secondaire">
                Consultations
              </th>
            </tr>
          </thead>
          <tbody>
            {donnees.map((point) => (
              <tr key={point.date}>
                <td className="border-b border-bordure px-2 py-1.5 text-encre">{libelleJourCourt(point.date)}</td>
                <td className="chiffres border-b border-bordure px-2 py-1.5 text-right text-encre">
                  {point.valeur === null ? "< 5" : point.valeur}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
