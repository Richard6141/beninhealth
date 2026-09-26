import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde de securite des Server Actions (RG-ARC-12 du pack, adapte).
 *
 * Chaque fonction exportee d'un fichier "use server" est un point d'entree
 * atteignable par POST, meme si aucun ecran ne l'appelle. Deux regles, verifiees
 * ici sur tout src/ :
 *
 * 1. Un fichier "use server" n'exporte que des fonctions async (et des types).
 *    Une constante ou une fonction synchrone exportee fait echouer `next build`,
 *    sans que le serveur de developpement le signale.
 * 2. Chaque fonction async exportee controle une session dans son corps, ou est
 *    listee dans LECTURES_PUBLIQUES ci-dessous avec sa raison. Ajouter une action
 *    sans controle fait echouer ce test : sortir la fonction dans un module sans
 *    "use server" (ecriture interne), ou ajouter le controle.
 */

const RACINE = path.join(process.cwd(), "src");

function fichiers(dossier: string): string[] {
  const resultat: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      resultat.push(...fichiers(chemin));
    } else if (/\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom)) {
      resultat.push(chemin);
    }
  }
  return resultat;
}

function estUseServer(source: string): boolean {
  const sansCommentaires = source.replace(/^\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*/, "");
  return /^\s*["']use server["']/.test(source) || /^\s*["']use server["']/.test(sansCommentaires);
}

interface Exportee {
  fichier: string;
  nom: string;
  corps: string;
}

function fonctionsAsyncExportees(source: string, fichier: string): Exportee[] {
  const resultat: Exportee[] = [];
  const motif = /^export async function (\w+)/gm;
  const positions: { nom: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = motif.exec(source)) !== null) {
    positions.push({ nom: m[1], index: m.index });
  }
  const debutsExports = [...source.matchAll(/^export /gm)].map((x) => x.index ?? 0);
  for (const { nom, index } of positions) {
    const suivant = debutsExports.find((d) => d > index) ?? source.length;
    resultat.push({ fichier, nom, corps: source.slice(index, suivant) });
  }
  return resultat;
}

const fichiersUseServer = fichiers(RACINE)
  .map((chemin) => ({ chemin, source: readFileSync(chemin, "utf8") }))
  .filter(({ source }) => estUseServer(source));

const relatif = (chemin: string) => path.relative(process.cwd(), chemin).replaceAll("\\", "/");

/**
 * Lectures sans session, volontaires : catalogues et annuaire publics, ou parcours
 * qui precedent la connexion. Ajouter ici exige une raison ecrite.
 */
const LECTURES_PUBLIQUES: Record<string, string> = {
  "src/modules/facility/annuaire-public.ts:getAnnuairePublicEtablissements": "annuaire public des etablissements actifs (F-ETA-01)",
  "src/modules/facility/annuaire-public.ts:getEtablissementPublicParId": "fiche publique d'un etablissement (F-ETA-02)",
  "src/modules/identity/reinitialisation-mot-de-passe.ts:demanderReinitialisationMotDePasseAction": "mot de passe oublie : parcours deconnecte, limite par compte et par adresse",
  "src/modules/identity/reinitialisation-mot-de-passe.ts:reinitialiserMotDePasseAction": "mot de passe oublie : parcours deconnecte, limite d'essais par compte",
  "src/modules/identity/actions.ts:registerPatientAction": "inscription : parcours deconnecte",
  "src/modules/identity/actions.ts:loginAction": "connexion : parcours deconnecte, verrouillage apres 5 echecs",
  "src/modules/identity/actions.ts:verifierCodeEmailEtConnecterAction": "connexion : jeton de pre-authentification signe",
  "src/modules/identity/actions.ts:verifierMfaEtConnecterAction": "connexion : jeton de pre-authentification signe, 5 essais",
  "src/modules/identity/actions.ts:logoutAction": "deconnexion : sans effet sans cookie",
  "src/modules/identity/reclamation.ts:reclamerDossierAction": "reclamation d'un dossier : parcours deconnecte, code a usage unique",
  "src/modules/patient/carte-sante.ts:verifierCarteSanteAction": "a durcir : accepte toute session (voir docs/reste-a-faire.md 3.4)",
  "src/modules/administration/parametres.ts:estFonctionnaliteActive": "lecture d'un interrupteur (booleen), aucune donnee",
  "src/modules/facility/actions.ts:listEtablissements": "catalogue public : meme contenu que l'annuaire public",
  "src/modules/laboratoire/actions.ts:listLaboratoires": "catalogue public : etablissements de type laboratoire (nom et localisation)",
};

/** Fonctions internes qui contiennent le controle de session ou de role (la fonction exportee les appelle ou leur delegue). */
const GARDES_CONNUES = [
  "etablissementAutorise",
  "etablissementDeLAdminConnecte",
  "verifierExportPilotageAction",
  "getComparaisonTerritoires",
];

describe("fichiers \"use server\" : uniquement des fonctions async exportees", () => {
  it("il y a bien des fichiers \"use server\" a verifier", () => {
    expect(fichiersUseServer.length).toBeGreaterThan(20);
  });

  it("aucune constante, classe ni fonction synchrone n'est exportee (types autorises)", () => {
    const violations: string[] = [];

    for (const { chemin, source } of fichiersUseServer) {
      for (const ligne of source.split("\n")) {
        if (!ligne.startsWith("export ")) continue;
        const autorise =
          /^export async function \w+/.test(ligne) ||
          /^export (interface|type) \w+/.test(ligne) ||
          /^export type \{/.test(ligne);
        if (!autorise) {
          violations.push(`${relatif(chemin)} : ${ligne.slice(0, 90)}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("fichiers \"use server\" : chaque action controle une session", () => {
  const sansControle: string[] = [];

  for (const { chemin, source } of fichiersUseServer) {
    for (const fonction of fonctionsAsyncExportees(source, relatif(chemin))) {
      const controleSession =
        /Session\w*\s*\(|estAdminNationalConnecte\s*\(|adminEtablissement\w*\s*\(/.test(fonction.corps) ||
        GARDES_CONNUES.some((garde) => fonction.corps.includes(`${garde}(`));
      const cle = `${fonction.fichier}:${fonction.nom}`;
      if (!controleSession && !(cle in LECTURES_PUBLIQUES)) {
        sansControle.push(cle);
      }
    }
  }

  it("aucune action exportee sans controle de session (sinon : la sortir de \"use server\" ou la lister avec sa raison)", () => {
    expect(sansControle).toEqual([]);
  });

  it("la liste des lectures publiques ne contient que des fonctions qui existent encore", () => {
    const existantes = new Set<string>();
    for (const { chemin, source } of fichiersUseServer) {
      for (const f of fonctionsAsyncExportees(source, relatif(chemin))) existantes.add(`${f.fichier}:${f.nom}`);
    }
    const obsoletes = Object.keys(LECTURES_PUBLIQUES).filter((cle) => !existantes.has(cle));
    expect(obsoletes).toEqual([]);
  });
});
