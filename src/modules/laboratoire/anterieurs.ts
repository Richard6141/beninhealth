/**
 * Antecedents d'un resultat d'examen (F-LAB-04 du pack : "antecedents du
 * patient pour cet examen, s'il y en a dans le meme laboratoire"). Module pur
 * (pas de "use server", pas d'acces base) : la liste des examens du
 * laboratoire est deja chargee par l'appelant, on ne relit rien.
 */

export interface ExamenPourAnterieurs {
  id: string;
  patientId: string;
  typeExamen: string;
  date: Date;
  statut: string;
  resultat: string | null;
}

export interface AnterieurResultat {
  date: string; // ISO, date de la demande
  resultat: string | null;
}

/**
 * Construit, pour chaque examen, ses antecedents : resultats VALIDES (statut
 * "termine") du meme patient pour le meme type d'examen, strictement plus
 * anciens, les plus recents d'abord, au plus `max`. Un resultat non valide n'est
 * jamais un antecedent (il n'existe pas encore hors du laboratoire, RG-LAB-30).
 */
export function construireAnterieurs(
  examens: readonly ExamenPourAnterieurs[],
  max: number
): (idExamen: string) => AnterieurResultat[] {
  const valides = new Map<string, ExamenPourAnterieurs[]>();
  for (const examen of examens) {
    if (examen.statut !== "termine") continue;
    const cle = `${examen.patientId}|${examen.typeExamen}`;
    const groupe = valides.get(cle);
    if (groupe) groupe.push(examen);
    else valides.set(cle, [examen]);
  }
  for (const groupe of valides.values()) {
    groupe.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  const parId = new Map(examens.map((examen) => [examen.id, examen]));

  return (idExamen) => {
    const courant = parId.get(idExamen);
    if (!courant) return [];
    const groupe = valides.get(`${courant.patientId}|${courant.typeExamen}`) ?? [];
    return groupe
      .filter((candidat) => candidat.id !== courant.id && candidat.date.getTime() < courant.date.getTime())
      .slice(0, max)
      .map((candidat) => ({ date: candidat.date.toISOString(), resultat: candidat.resultat }));
  };
}
