/**
 * Construction du contenu des exports de pilotage (F-PIL-05), partagee entre
 * les deux routes de telechargement (csv, pdf). Ne lit jamais Prisma
 * directement : prend en entree les objets deja masques
 * (VueNationalePilotage / TableauBordEtablissement, RG-PIL-41), assemble
 * uniquement la mise en forme.
 */

import type { MotifExport } from "./exports-constantes";
import type { TableauBordEtablissement, VueNationalePilotage } from "./lecture";
import { MOTIFS_EXPORT } from "./exports-constantes";
import { CATALOGUE_INDICATEURS } from "./indicateurs";

export function libelleMotif(motif: MotifExport, motifTexte?: string): string {
  const option = MOTIFS_EXPORT.find((item) => item.value === motif);
  const base = option?.label ?? motif;
  return motif === "autre" && motifTexte ? `${base} : ${motifTexte}` : base;
}

export function libellePeriode(periode: string): string {
  switch (periode) {
    case "aujourdhui":
      return "Aujourd'hui";
    case "7j":
      return "7 derniers jours";
    case "30j":
      return "30 derniers jours";
    case "mois":
      return "Mois en cours";
    default:
      return periode;
  }
}

function ligneCSV(cellules: (string | number)[]): string {
  return cellules
    .map((cellule) => {
      const valeur = String(cellule);
      return /[;"\n]/.test(valeur) ? `"${valeur.replace(/"/g, '""')}"` : valeur;
    })
    .join(";");
}

export function construireCSVNational(vue: VueNationalePilotage): string {
  const sections: string[] = [];

  sections.push(
    [
      ligneCSV(["Indicateur", "Valeur", "Variation (%)"]),
      ligneCSV(["Consultations (IND-01)", vue.consultations.valeur, vue.consultations.variationPourcent ?? ""]),
      ligneCSV(["Patients vus (IND-02)", vue.patientsVus.valeur, vue.patientsVus.variationPourcent ?? ""]),
      ligneCSV([
        "Établissements actifs (IND-05)",
        `${vue.etablissementsActifs.actifs}/${vue.etablissementsActifs.total}`,
        "",
      ]),
      ligneCSV(["Cas de paludisme (IND-04)", vue.casPaludisme.valeur, vue.casPaludisme.variationPourcent ?? ""]),
      ligneCSV(["Taux de délivrance des ordonnances (IND-08)", vue.tauxDelivranceOrdonnances, ""]),
      ligneCSV(["Vaccinations (IND-10)", vue.vaccinations.valeur, vue.vaccinations.variationPourcent ?? ""]),
    ].join("\n")
  );

  sections.push(
    [
      ligneCSV(["Top des diagnostics (IND-03)", "", ""]),
      ligneCSV(["Code", "Libellé", "Valeur"]),
      ...vue.topDiagnostics.map((diagnostic) => ligneCSV([diagnostic.code, diagnostic.libelle, diagnostic.valeur])),
    ].join("\n")
  );

  sections.push(
    [
      ligneCSV(["Évolution hebdomadaire (12 dernières semaines)", "", ""]),
      ligneCSV(["Semaine (fin)", "Consultations", "Paludisme"]),
      ...vue.evolutionHebdomadaire.map((point) =>
        ligneCSV([point.finSemaine, point.consultations ?? "< 5", point.paludisme ?? "< 5"])
      ),
    ].join("\n")
  );

  return sections.join("\n\n");
}

export function construireCSVEtablissement(bord: TableauBordEtablissement): string {
  const sections: string[] = [];

  const lignesIndicateurs: string[] = [
    ligneCSV(["Indicateur", "Valeur"]),
    ligneCSV(["Consultations (IND-01)", bord.consultations]),
    ligneCSV(["Patients vus (IND-02)", bord.patientsVus]),
    ligneCSV(["Taux de délivrance des ordonnances (IND-08)", bord.tauxDelivranceOrdonnances]),
  ];
  if (bord.rendezVousDuJour) {
    lignesIndicateurs.push(
      ligneCSV(["Rendez-vous pris (aujourd'hui, IND-07)", bord.rendezVousDuJour.pris]),
      ligneCSV(["Rendez-vous honorés (aujourd'hui, IND-07)", bord.rendezVousDuJour.honores]),
      ligneCSV(["Rendez-vous annulés (aujourd'hui, IND-07)", bord.rendezVousDuJour.annules])
    );
  }
  sections.push(lignesIndicateurs.join("\n"));

  sections.push(
    [
      ligneCSV(["Évolution des consultations", ""]),
      ligneCSV(["Date", "Consultations"]),
      ...bord.evolutionConsultations.map((point) => ligneCSV([point.date, point.valeur ?? "< 5"])),
    ].join("\n")
  );

  sections.push(
    [
      ligneCSV(["Top des diagnostics (IND-03)", "", ""]),
      ligneCSV(["Code", "Libellé", "Valeur"]),
      ...bord.topDiagnostics.map((diagnostic) => ligneCSV([diagnostic.code, diagnostic.libelle, diagnostic.valeur])),
    ].join("\n")
  );

  if (bord.activiteParProfessionnel.length > 0) {
    sections.push(
      [
        ligneCSV(["Activité par professionnel", ""]),
        ligneCSV(["Nom", "Total actes"]),
        ...bord.activiteParProfessionnel.map((ligne) => ligneCSV([ligne.nomComplet, ligne.totalActes])),
      ].join("\n")
    );
  }

  return sections.join("\n\n");
}

/** Definitions des indicateurs presents dans un rapport (RG-PIL-10), dans l'ordre des codes fournis. */
export function definitionsPourCodes(codes: string[]): { code: string; libelle: string; definition: string }[] {
  return codes
    .map((code) => CATALOGUE_INDICATEURS.find((indicateur) => indicateur.code === code))
    .filter((indicateur): indicateur is (typeof CATALOGUE_INDICATEURS)[number] => indicateur !== undefined)
    .map((indicateur) => ({ code: indicateur.code, libelle: indicateur.libelle, definition: indicateur.definition }));
}

export const CODES_INDICATEURS_NATIONAL = ["IND-01", "IND-02", "IND-03", "IND-04", "IND-05", "IND-08", "IND-10"];
export const CODES_INDICATEURS_ETABLISSEMENT = ["IND-01", "IND-02", "IND-03", "IND-07", "IND-08"];
