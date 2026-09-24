/**
 * Validation des variables d'environnement attendues par la plateforme.
 *
 * Phase 1 : ce helper vérifie uniquement la présence des variables ; il n'y a
 * pas encore de connexion réelle à une base de données ni à un fournisseur
 * d'authentification. La connexion réelle (PostgreSQL, NextAuth ou équivalent)
 * sera branchée en Phase 2 avec le module identity (voir src/modules/identity
 * et src/database/schema-notes.md).
 *
 * Voir .env.example à la racine du projet pour la liste des variables avec
 * des valeurs d'exemple factices.
 */

export interface EnvVariables {
  /** URL de connexion PostgreSQL. Utilisée par le module identity à partir de la Phase 2. */
  DATABASE_URL: string;
  /** Secret de signature des sessions/tokens d'authentification (NextAuth ou équivalent). */
  NEXTAUTH_SECRET: string;
  /** Environnement d'exécution courant. */
  NODE_ENV: 'development' | 'production' | 'test';
}

/** Variables sans lesquelles l'application ne doit jamais démarrer en production. */
const VARIABLES_OBLIGATOIRES_EN_PRODUCTION: ReadonlyArray<
  Exclude<keyof EnvVariables, 'NODE_ENV'>
> = ['DATABASE_URL', 'NEXTAUTH_SECRET'];

function lireVariable(nom: keyof EnvVariables): string | undefined {
  return process.env[nom];
}

/**
 * Lit et valide les variables d'environnement attendues.
 *
 * En production, lève une erreur explicite si une variable obligatoire est
 * absente. En développement ou en test, retourne les valeurs disponibles sans
 * bloquer le démarrage, tant qu'aucune base de données réelle n'est branchée
 * (Phase 1).
 */
export function getEnv(): EnvVariables {
  const nodeEnv = (process.env.NODE_ENV as EnvVariables['NODE_ENV'] | undefined) ?? 'development';

  if (nodeEnv === 'production') {
    const variablesManquantes = VARIABLES_OBLIGATOIRES_EN_PRODUCTION.filter(
      (nom) => !lireVariable(nom)
    );

    if (variablesManquantes.length > 0) {
      throw new Error(
        `Variables d'environnement manquantes en production : ${variablesManquantes.join(', ')}. ` +
          "Voir .env.example à la racine du projet pour la liste complète."
      );
    }
  }

  return {
    DATABASE_URL: lireVariable('DATABASE_URL') ?? '',
    NEXTAUTH_SECRET: lireVariable('NEXTAUTH_SECRET') ?? '',
    NODE_ENV: nodeEnv,
  };
}
