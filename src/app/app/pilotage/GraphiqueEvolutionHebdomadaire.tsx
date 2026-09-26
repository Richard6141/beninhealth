import type { PointHebdomadaireNational } from "@/modules/pilotage/lecture";

/** Transforme "AAAA-MM-JJ" (fin de semaine) en libellé court, ex. "15/01". */
function libelleFinSemaine(dateIso: string): string {
  const [, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}`;
}

interface SousGraphiqueProps {
  titre: string;
  donnees: { finSemaine: string; valeur: number | null }[];
  classeCouleurBarre: string;
}

/**
 * Meme principe de masquage que GraphiqueConsultationsQuotidiennes.tsx
 * (barre a hauteur fixe minimale, jamais proportionnelle, pour une semaine
 * masquee RG-PIL-02) mais au grain semaine (12 dernieres semaines glissantes
 * de 7 jours, finSemaine = dernier jour inclus de chaque semaine).
 */
function SousGraphiqueHebdomadaire({ titre, donnees, classeCouleurBarre }: SousGraphiqueProps) {
  const maximum = Math.max(1, ...donnees.map((point) => point.valeur ?? 0));
  const descriptionAccessible = donnees
    .map((point) => `semaine se terminant le ${libelleFinSemaine(point.finSemaine)} : ${point.valeur === null ? "moins de 5" : point.valeur}`)
    .join(", ");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-encre">{titre}</p>
      <div
        role="img"
        aria-label={`${titre}, evolution hebdomadaire sur 12 semaines. ${descriptionAccessible}.`}
        className="flex h-28 items-end gap-1 border-b border-bordure-forte px-1"
      >
        {donnees.map((point) => {
          const masque = point.valeur === null;
          const hauteurPourcent = masque ? 8 : Math.max(4, Math.round((point.valeur! / maximum) * 100));
          const libelleValeur = masque ? "< 5" : String(point.valeur);
          return (
            <div key={point.finSemaine} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="chiffres text-[10px] font-semibold text-encre">{libelleValeur}</span>
              <div
                aria-hidden="true"
                title={`Semaine se terminant le ${libelleFinSemaine(point.finSemaine)} : ${libelleValeur}`}
                style={{ height: `${hauteurPourcent}%` }}
                className={masque ? "w-full bg-encre-attenuee/40" : `w-full ${classeCouleurBarre}`}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="flex gap-1 px-1">
        {donnees.map((point) => (
          <span key={point.finSemaine} className="flex-1 text-center text-[9px] text-encre-attenuee">
            {libelleFinSemaine(point.finSemaine)}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface GraphiqueEvolutionHebdomadaireProps {
  donnees: PointHebdomadaireNational[];
}

export function GraphiqueEvolutionHebdomadaire({ donnees }: GraphiqueEvolutionHebdomadaireProps) {
  if (donnees.length === 0) {
    return <p className="text-[13px] text-encre-attenuee">Aucune donnée disponible.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <SousGraphiqueHebdomadaire
        titre="Consultations"
        donnees={donnees.map((point) => ({ finSemaine: point.finSemaine, valeur: point.consultations }))}
        classeCouleurBarre="bg-accent"
      />
      <SousGraphiqueHebdomadaire
        titre="Cas de paludisme"
        donnees={donnees.map((point) => ({ finSemaine: point.finSemaine, valeur: point.paludisme }))}
        classeCouleurBarre="bg-critique"
      />
    </div>
  );
}
