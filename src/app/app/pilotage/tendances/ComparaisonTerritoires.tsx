import type { PointComparaison, TerritoireOption } from "@/modules/pilotage/tendances-constantes";

/**
 * Palette categorielle (pas les couleurs semantiques bon/vigilance/alerte du
 * design system : ici la couleur ne code aucune gravite, seulement une
 * identite de territoire). Inspiree d'Okabe-Ito (distinguable en
 * daltonisme), et doublee d'un motif de tirets distinct par territoire pour
 * ne jamais reposer sur la seule couleur (voir aussi le tableau de donnees
 * ci-dessous, repere accessible faisant foi).
 */
const PALETTE: { couleur: string; tiret?: string }[] = [
  { couleur: "#0072B2" },
  { couleur: "#D55E00", tiret: "7 4" },
  { couleur: "#009E73", tiret: "2 3" },
  { couleur: "#E69F00", tiret: "9 3 2 3" },
  { couleur: "#CC79A7", tiret: "1 3" },
];

function valeurNumerique(valeur: number | "< 5" | undefined): number {
  if (valeur === undefined) return 0;
  return valeur === "< 5" ? 2 : valeur;
}

const LARGEUR = 720;
const HAUTEUR = 260;
const MARGE = { haut: 12, bas: 24, gauche: 8, droite: 8 };

interface ComparaisonTerritoiresProps {
  territoires: TerritoireOption[];
  points: PointComparaison[];
}

export function ComparaisonTerritoires({ territoires, points }: ComparaisonTerritoiresProps) {
  if (points.length === 0 || territoires.length === 0) {
    return <p className="text-[13px] text-encre-attenuee">Aucune donnée disponible pour cette sélection.</p>;
  }

  const maximum = Math.max(
    1,
    ...points.flatMap((point) => territoires.map((territoire) => valeurNumerique(point.valeurs[territoire.id])))
  );
  const largeurUtile = LARGEUR - MARGE.gauche - MARGE.droite;
  const hauteurUtile = HAUTEUR - MARGE.haut - MARGE.bas;

  function x(index: number): number {
    if (points.length === 1) return MARGE.gauche + largeurUtile / 2;
    return MARGE.gauche + (index / (points.length - 1)) * largeurUtile;
  }
  function y(valeur: number): number {
    return MARGE.haut + hauteurUtile - (valeur / maximum) * hauteurUtile;
  }

  const pasLibelle = Math.max(1, Math.ceil(points.length / 10));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5" aria-hidden="true">
        {territoires.map((territoire, index) => {
          const style = PALETTE[index % PALETTE.length];
          return (
            <span key={territoire.id} className="flex items-center gap-1.5 text-[12px] font-semibold text-encre-secondaire">
              <svg width={18} height={10} aria-hidden="true">
                <line x1={0} y1={5} x2={18} y2={5} stroke={style.couleur} strokeWidth={2.5} strokeDasharray={style.tiret} />
              </svg>
              {territoire.nom}
            </span>
          );
        })}
      </div>

      <div
        role="img"
        aria-label={`Graphique en courbes comparant ${territoires.map((territoire) => territoire.nom).join(", ")} sur ${points.length} période(s). Le détail chiffré est disponible dans le tableau ci-dessous.`}
      >
        <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} className="w-full" aria-hidden="true">
          <line
            x1={MARGE.gauche}
            y1={HAUTEUR - MARGE.bas}
            x2={LARGEUR - MARGE.droite}
            y2={HAUTEUR - MARGE.bas}
            stroke="var(--bordure-forte)"
            strokeWidth={1}
          />
          {territoires.map((territoire, indexTerritoire) => {
            const style = PALETTE[indexTerritoire % PALETTE.length];
            const chemin = points
              .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(valeurNumerique(point.valeurs[territoire.id]))}`)
              .join(" ");
            return (
              <g key={territoire.id}>
                <path
                  d={chemin}
                  fill="none"
                  stroke={style.couleur}
                  strokeWidth={2}
                  strokeDasharray={style.tiret}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {points.map((point, index) => {
                  const valeurCellule = point.valeurs[territoire.id];
                  const masque = valeurCellule === "< 5";
                  return (
                    <circle
                      key={point.debut}
                      cx={x(index)}
                      cy={y(valeurNumerique(valeurCellule))}
                      r={masque ? 2.5 : 3}
                      fill={masque ? "var(--surface)" : style.couleur}
                      stroke={style.couleur}
                      strokeWidth={masque ? 1.5 : 0}
                    >
                      <title>{`${territoire.nom}, ${point.libelle} : ${masque ? "< 5" : valeurCellule}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
          {points.map((point, index) =>
            index % pasLibelle === 0 ? (
              <text
                key={point.debut}
                x={x(index)}
                y={HAUTEUR - MARGE.bas + 14}
                fontSize={9}
                textAnchor="middle"
                fill="var(--encre-attenuee)"
              >
                {point.libelle}
              </text>
            ) : null
          )}
        </svg>
      </div>

      <div className="max-h-[360px] overflow-auto rounded-champ border border-bordure">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-surface-appui">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-encre-secondaire">
                Période
              </th>
              {territoires.map((territoire) => (
                <th key={territoire.id} scope="col" className="px-3 py-2 text-right font-semibold text-encre-secondaire">
                  {territoire.nom}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.debut} className="border-t border-bordure">
                <th scope="row" className="px-3 py-1.5 text-left font-normal text-encre">
                  {point.libelle}
                </th>
                {territoires.map((territoire) => (
                  <td key={territoire.id} className="chiffres px-3 py-1.5 text-right text-encre">
                    {point.valeurs[territoire.id]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
