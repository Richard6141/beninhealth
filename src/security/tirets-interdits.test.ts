import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde typographique : aucun tiret cadratin (U+2014) ni demi-cadratin (U+2013)
 * dans le code, sous aucune forme (caractere litteral, entite HTML nommee ou
 * numerique, echappement Unicode). Regle du poste, sans exception : la liste
 * des exceptions ci-dessous est vide et doit le rester.
 *
 * Ce fichier ne contient lui-meme aucune de ces formes : elles sont assemblees
 * a l'execution, sinon le garde se declencherait sur son propre texte.
 * Perimetre : src/, prisma/, scripts/, README.md et CONTRIBUTING.md. Les
 * documents fournis par le ministere (docs/pack claude/), le design system et
 * AGENTS.md (regenere par Next) sont hors perimetre.
 */

const EXCEPTIONS: string[] = [];

const CARACTERES = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];
const FORMES_ECHAPPEES = [
  `&${"mdash"};`,
  `&${"ndash"};`,
  `&#${"8212"};`,
  `&#${"8211"};`,
  `&#x${"2014"};`,
  `&#x${"2013"};`,
  `\\u${"2014"}`,
  `\\u${"2013"}`,
  `\\u{${"2014"}}`,
  `\\u{${"2013"}}`,
];
const FORMES_INTERDITES = [...CARACTERES, ...FORMES_ECHAPPEES];

const RACINE = process.cwd();
const DOSSIERS_IGNORES = new Set(["node_modules", ".next", ".git", "generated"]);
const EXTENSIONS_BINAIRES = /\.(png|jpe?g|gif|ico|webp|avif|woff2?|ttf|otf|pdf|zip|sqlite|db)$/i;

function fichiersDe(dossier: string): string[] {
  const resultat: string[] = [];
  for (const nom of readdirSync(dossier)) {
    if (DOSSIERS_IGNORES.has(nom)) continue;
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      resultat.push(...fichiersDe(chemin));
    } else if (!EXTENSIONS_BINAIRES.test(nom)) {
      resultat.push(chemin);
    }
  }
  return resultat;
}

const relatif = (chemin: string) => path.relative(RACINE, chemin).replaceAll("\\", "/");

function fichiersSurveilles(): string[] {
  const dossiers = ["src", "prisma", "scripts"]
    .map((nom) => path.join(RACINE, nom))
    .filter((chemin) => {
      try {
        return statSync(chemin).isDirectory();
      } catch {
        return false;
      }
    })
    .flatMap(fichiersDe);
  const racine = ["README.md", "CONTRIBUTING.md"].map((nom) => path.join(RACINE, nom));
  return [...dossiers, ...racine].filter((chemin) => {
    try {
      return statSync(chemin).isFile();
    } catch {
      return false;
    }
  });
}

function infractions(chemins: string[]): string[] {
  const trouvees: string[] = [];
  for (const chemin of chemins) {
    const nom = relatif(chemin);
    if (EXCEPTIONS.includes(nom)) continue;
    const lignes = readFileSync(chemin, "utf8").split("\n");
    lignes.forEach((ligne, index) => {
      if (FORMES_INTERDITES.some((forme) => ligne.includes(forme))) {
        trouvees.push(`${nom}:${index + 1}`);
      }
    });
  }
  return trouvees;
}

describe("garde typographique : aucun tiret cadratin ni demi-cadratin", () => {
  it("la liste des exceptions est vide", () => {
    expect(EXCEPTIONS).toEqual([]);
  });

  it("le garde detecte chacune des formes interdites (il ne peut pas passer a vide)", () => {
    for (const forme of FORMES_INTERDITES) {
      expect(FORMES_INTERDITES.some((interdite) => `texte ${forme} texte`.includes(interdite))).toBe(true);
    }
    expect(FORMES_INTERDITES).toHaveLength(12);
  });

  it("aucun fichier de src/, prisma/, scripts/, README.md, CONTRIBUTING.md n'en contient", () => {
    const surveilles = fichiersSurveilles();
    expect(surveilles.length).toBeGreaterThan(100);
    expect(infractions(surveilles)).toEqual([]);
  });
});
