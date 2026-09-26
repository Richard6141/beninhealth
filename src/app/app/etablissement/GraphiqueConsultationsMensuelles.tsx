import type { PointMensuel } from "@/modules/analytics/actions";

const LIBELLES_MOIS_COURTS = [
  "Janv",
  "Févr",
  "Mars",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sept",
  "Oct",
  "Nov",
  "Déc",
];

/** Transforme "AAAA-MM" en libellé court francais, ex. "2026-09" en "Sept 2026". */
function libelleMoisCourt(moisIso: string): string {
  const [annee, mois] = moisIso.split("-");
  const indexMois = Number(mois) - 1;
  const libelleMois = LIBELLES_MOIS_COURTS[indexMois] ?? mois ?? moisIso;
  return `${libelleMois} ${annee ?? ""}`.trim();
}

export interface GraphiqueConsultationsMensuellesProps {
  donnees: PointMensuel[];
}

/**
 * Graphique en barres simple (HTML/Tailwind pur, aucune librairie) pour la
 * tendance mensuelle des consultations, une seule serie : teinte unique
 * bg-accent, barres ancrees sur une ligne de base commune, valeur affichee
 * directement au dessus de chaque barre, infobulle via l'attribut title
 * natif, axe des mois en dessous, pas de second axe. Aucune animation
 * declenchee au rendu, donc prefers-reduced-motion est respecte de fait.
 * Alternative accessible : tableau HTML simple (repli <details>/<summary>)
 * avec les memes donnees, en plus du role="img" + aria-label sur le
 * graphique lui-meme.
 */
export function GraphiqueConsultationsMensuelles({
  donnees,
}: GraphiqueConsultationsMensuellesProps) {
  const donneesTriees = [...donnees].sort((a, b) => a.mois.localeCompare(b.mois));

  if (donneesTriees.length === 0) {
    return (
      <p className="text-[13px] text-encre-attenuee">
        Aucune donnée de consultation disponible pour les derniers mois.
      </p>
    );
  }

  const maximum = Math.max(1, ...donneesTriees.map((point) => point.total));
  const descriptionAccessible = donneesTriees
    .map((point) => `${libelleMoisCourt(point.mois)} : ${point.total}`)
    .join(", ");

  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={`Nombre de consultations par mois. ${descriptionAccessible}.`}
        className="flex h-40 items-end gap-[3px] border-b border-bordure-forte px-1"
      >
        {donneesTriees.map((point) => {
          const hauteurPourcent = Math.max(4, Math.round((point.total / maximum) * 100));
          return (
            <div
              key={point.mois}
              className="flex flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="chiffres text-[12px] font-semibold text-encre">
                {point.total}
              </span>
              <div
                aria-hidden="true"
                title={`${libelleMoisCourt(point.mois)} : ${point.total} consultation${point.total > 1 ? "s" : ""}`}
                style={{ height: `${hauteurPourcent}%` }}
                className="w-full max-w-[28px] bg-accent"
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="flex gap-[3px] px-1">
        {donneesTriees.map((point) => (
          <span
            key={point.mois}
            className="flex-1 text-center text-[11px] text-encre-attenuee"
          >
            {libelleMoisCourt(point.mois)}
          </span>
        ))}
      </div>

      <details>
        <summary className="w-fit cursor-pointer text-[13px] font-semibold text-accent hover:underline">
          Afficher les données sous forme de tableau
        </summary>
        <table className="mt-2 w-full border-collapse text-[13px]">
          <caption className="sr-only">Nombre de consultations par mois</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-bordure px-2 py-1.5 text-left font-semibold text-encre-secondaire"
              >
                Mois
              </th>
              <th
                scope="col"
                className="border-b border-bordure px-2 py-1.5 text-right font-semibold text-encre-secondaire"
              >
                Consultations
              </th>
            </tr>
          </thead>
          <tbody>
            {donneesTriees.map((point) => (
              <tr key={point.mois}>
                <td className="border-b border-bordure px-2 py-1.5 text-encre">
                  {libelleMoisCourt(point.mois)}
                </td>
                <td className="chiffres border-b border-bordure px-2 py-1.5 text-right text-encre">
                  {point.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
