"use server";

/**
 * Sous-liste CIM-10 administrable (F-ADM-04, F-CLI-06 du pack) : code,
 * libelle, chapitre, groupe de maladies (section 18.6) et caractere sensible
 * (RG-CLI-53 : un code sensible protege la consultation). Table dediee
 * (DiagnosticCim10). Meme principe que les autres referentiels : role
 * admin_national, RG-ADM-20 (desactivation seule, jamais suppression),
 * versionnement (RG-ADM-21) hors perimetre.
 *
 * Le groupe et le chapitre se deduisent du code (cim10-groupes.ts) ; le
 * caractere sensible prend par defaut celui du groupe et peut etre corrige
 * code par code ("la liste des codes sensibles est un parametre de
 * referentiel"). Les valeurs de depart (cim10-catalogue.ts) sont semees une
 * seule fois par code, sans jamais ecraser une entree existante.
 *
 * Perimetre : administration et recherche (rechercherDiagnosticsCim10, pour
 * le formulaire de consultation). Brancher le diagnostic principal de la
 * consultation et l'agregation du pilotage sur ces codes releve de leurs
 * modules proprietaires.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { DIAGNOSTICS_CIM10_PAR_DEFAUT } from "./cim10-catalogue";
import {
  FORMAT_CODE_CIM10,
  chapitreCim10PourCode,
  groupeCim10PourCode,
  groupeEstSensible,
  normaliserCodeCim10,
} from "./cim10-groupes";

const LIMITE_RECHERCHE_DEFAUT = 20;
const LIMITE_RECHERCHE_MAX = 50;
const LIMITE_LISTE_ADMIN = 300;

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/**
 * Seme les valeurs de depart absentes, sans jamais ecraser une entree
 * existante. Une seule requete de comptage quand tout est deja en base (cas
 * courant : la recherche est appelee a chaque saisie), une seule insertion
 * groupee sinon.
 */
async function provisionnerParDefaut(): Promise<void> {
  const codes = DIAGNOSTICS_CIM10_PAR_DEFAUT.map((diagnostic) => diagnostic.code);
  const presents = await prisma.diagnosticCim10.count({ where: { code: { in: codes } } });

  if (presents >= codes.length) {
    return;
  }

  await prisma.diagnosticCim10.createMany({
    data: DIAGNOSTICS_CIM10_PAR_DEFAUT.map((diagnostic) => {
      const groupe = groupeCim10PourCode(diagnostic.code);

      return {
        code: diagnostic.code,
        libelle: diagnostic.libelle,
        chapitre: chapitreCim10PourCode(diagnostic.code),
        groupeMaladie: groupe,
        sensible: groupeEstSensible(groupe),
        actif: true,
      };
    }),
    skipDuplicates: true,
  });
}

/** Minuscules sans accents, pour comparer une saisie a un libelle. */
function normaliserTexte(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface DiagnosticCim10Resume {
  id: string;
  code: string;
  libelle: string;
  chapitre: string;
  groupeMaladie: string;
  sensible: boolean;
  actif: boolean;
}

/** Diagnostics (actifs et desactives), filtres par un texte facultatif, pour l'ecran d'administration. */
export async function getReferentielCim10Complet(recherche?: string): Promise<DiagnosticCim10Resume[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "referentiel_cim10"))) {
    return [];
  }

  await provisionnerParDefaut();

  const tous = await prisma.diagnosticCim10.findMany({ orderBy: { code: "asc" } });
  const terme = recherche ? normaliserTexte(recherche) : "";

  return tous
    .filter((diagnostic) => terme === "" || normaliserTexte(`${diagnostic.code} ${diagnostic.libelle}`).includes(terme))
    .slice(0, LIMITE_LISTE_ADMIN)
    .map((diagnostic) => ({
      id: diagnostic.id,
      code: diagnostic.code,
      libelle: diagnostic.libelle,
      chapitre: diagnostic.chapitre,
      groupeMaladie: diagnostic.groupeMaladie,
      sensible: diagnostic.sensible,
      actif: diagnostic.actif,
    }));
}

export interface DiagnosticCim10Propose {
  code: string;
  libelle: string;
  groupeMaladie: string;
  sensible: boolean;
}

/**
 * Recherche de diagnostics ACTIFS par code ou libelle (F-CLI-06 : "recherche
 * par code ou libelle"), reservee aux roles qui creent une consultation. Sans
 * accents ni casse. Classement : code exact, code commencant par la saisie,
 * libelle commencant par la saisie, puis le reste. Deux caracteres au moins.
 */
export async function rechercherDiagnosticsCim10(
  terme: string,
  limite: number = LIMITE_RECHERCHE_DEFAUT
): Promise<DiagnosticCim10Propose[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "consultation"))) {
    return [];
  }

  const recherche = normaliserTexte(String(terme ?? ""));

  if (recherche.length < 2) {
    return [];
  }

  const maximum = Math.min(Math.max(1, Math.trunc(limite) || LIMITE_RECHERCHE_DEFAUT), LIMITE_RECHERCHE_MAX);

  await provisionnerParDefaut();

  const actifs = await prisma.diagnosticCim10.findMany({ where: { actif: true }, orderBy: { code: "asc" } });

  const notes = actifs
    .map((diagnostic) => {
      const code = normaliserTexte(diagnostic.code);
      const libelle = normaliserTexte(diagnostic.libelle);
      let note = 0;

      if (code === recherche) note = 4;
      else if (code.startsWith(recherche)) note = 3;
      else if (libelle.startsWith(recherche)) note = 2;
      else if (libelle.includes(recherche) || code.includes(recherche)) note = 1;

      return { diagnostic, note };
    })
    .filter((entree) => entree.note > 0)
    .sort((a, b) => b.note - a.note || a.diagnostic.code.localeCompare(b.diagnostic.code));

  return notes.slice(0, maximum).map(({ diagnostic }) => ({
    code: diagnostic.code,
    libelle: diagnostic.libelle,
    groupeMaladie: diagnostic.groupeMaladie,
    sensible: diagnostic.sensible,
  }));
}

export interface ReferentielCim10ActionState {
  error: string | null;
  success: boolean;
}

const schemaCreation = z.object({
  code: z
    .string()
    .transform(normaliserCodeCim10)
    .refine((code) => FORMAT_CODE_CIM10.test(code), "Le code doit avoir la forme A00 ou A00.9."),
  libelle: z.string().trim().min(1, "Le libelle est obligatoire.").max(250, "250 caracteres maximum."),
});

/** Ajoute un diagnostic (groupe, chapitre et caractere sensible deduits du code, actif a la creation). */
export async function creerDiagnosticCim10Action(
  prevState: ReferentielCim10ActionState,
  formData: FormData
): Promise<ReferentielCim10ActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "referentiel_cim10"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaCreation.safeParse({ code: formData.get("code") ?? "", libelle: formData.get("libelle") ?? "" });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const { code, libelle } = validation.data;

  try {
    const existant = await prisma.diagnosticCim10.findUnique({ where: { code } });

    if (existant) {
      return { error: "Ce code existe deja dans le referentiel.", success: false };
    }

    const groupe = groupeCim10PourCode(code);
    const sensible = groupeEstSensible(groupe);
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.diagnosticCim10.create({
        data: { code, libelle, chapitre: chapitreCim10PourCode(code), groupeMaladie: groupe, sensible, actif: true },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_referentiel_cim10",
          donneeConcernee: `referentiel_cim10:${code}`,
          adresseTechnique,
          justification: `Diagnostic "${libelle}" (${code}, groupe ${groupe}${sensible ? ", sensible" : ""}) ajoute au referentiel.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation d'un diagnostic CIM-10 :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaBasculement = z.object({
  id: z.string().trim().min(1, "Le diagnostic est obligatoire."),
  champ: z.enum(["actif", "sensible"], { message: "Champ invalide." }),
});

/**
 * Bascule l'etat ACTIF (RG-ADM-20 : jamais de suppression) ou le caractere
 * SENSIBLE d'un diagnostic. Passer un code en sensible ou l'en retirer se
 * journalise avec l'ancien et le nouvel etat.
 */
export async function basculerDiagnosticCim10Action(
  prevState: ReferentielCim10ActionState,
  formData: FormData
): Promise<ReferentielCim10ActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_cim10"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaBasculement.safeParse({ id: formData.get("id"), champ: formData.get("champ") });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const { id, champ } = validation.data;

  try {
    const diagnostic = await prisma.diagnosticCim10.findUnique({ where: { id } });

    if (!diagnostic) {
      return { error: "Ce diagnostic est introuvable.", success: false };
    }

    const avant = champ === "actif" ? diagnostic.actif : diagnostic.sensible;
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.diagnosticCim10.update({
        where: { id },
        data: { [champ]: !avant, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: champ === "actif" ? "basculement_referentiel_cim10" : "modification_sensibilite_cim10",
          donneeConcernee: `referentiel_cim10:${diagnostic.code}`,
          adresseTechnique,
          justification:
            champ === "actif"
              ? `Diagnostic ${diagnostic.code} ${!avant ? "active" : "desactive"} (etait ${avant ? "actif" : "desactive"}).`
              : `Diagnostic ${diagnostic.code} ${!avant ? "marque sensible" : "n'est plus sensible"} (etait ${avant ? "sensible" : "non sensible"}).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la modification d'un diagnostic CIM-10 :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
