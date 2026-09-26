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
  /** Hôte du relais SMTP sortant (envoi d'e-mails : codes de vérification, notifications). */
  SMTP_HOST: string;
  /** Port du relais SMTP (465 en TLS implicite, 587 en STARTTLS). */
  SMTP_PORT: string;
  /** "true" pour TLS implicite (port 465), "false" pour STARTTLS (port 587). */
  SMTP_SECURE: string;
  /** Identifiant du compte SMTP. */
  SMTP_USER: string;
  /** Mot de passe du compte SMTP. */
  SMTP_PASSWORD: string;
  /** Adresse et libellé d'expéditeur utilisés dans l'en-tête "From" des e-mails envoyés. */
  SMTP_FROM: string;
  /** Nom du cloud Cloudinary (stockage des images téléversées : avatars). */
  CLOUDINARY_CLOUD_NAME: string;
  /** Clé API Cloudinary. */
  CLOUDINARY_API_KEY: string;
  /** Secret API Cloudinary. */
  CLOUDINARY_API_SECRET: string;
  /** Dossier Cloudinary racine dans lequel toutes les images de cette plateforme sont rangées. */
  CLOUDINARY_FOLDER: string;
  /**
   * Cle API Wapy.pro (pont WhatsApp Business, https://wapy.pro/developpeurs) :
   * envoi du code de confirmation au telephone du patient lors d'un acces au
   * dossier par NPI ou telephone (voir src/lib/wapy.ts). Facultative : absente,
   * le code part par SMS simule hors production et n'est pas livre en production.
   */
  WAPY_PONT_CLE: string;
  /**
   * Numeros (E.164, separes par des virgules) vers lesquels WhatsApp reel peut
   * partir HORS production. Vide : aucun envoi reel hors production, pour ne
   * jamais contacter par erreur le numero d'un patient de demonstration.
   * Sans effet en production.
   */
  WAPY_NUMEROS_TEST: string;
}

/** Variables sans lesquelles l'application ne doit jamais démarrer en production. */
const VARIABLES_OBLIGATOIRES_EN_PRODUCTION: ReadonlyArray<
  Exclude<keyof EnvVariables, 'NODE_ENV'>
> = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
];

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
    SMTP_HOST: lireVariable('SMTP_HOST') ?? '',
    SMTP_PORT: lireVariable('SMTP_PORT') ?? '',
    SMTP_SECURE: lireVariable('SMTP_SECURE') ?? '',
    SMTP_USER: lireVariable('SMTP_USER') ?? '',
    SMTP_PASSWORD: lireVariable('SMTP_PASSWORD') ?? '',
    SMTP_FROM: lireVariable('SMTP_FROM') ?? '',
    CLOUDINARY_CLOUD_NAME: lireVariable('CLOUDINARY_CLOUD_NAME') ?? '',
    CLOUDINARY_API_KEY: lireVariable('CLOUDINARY_API_KEY') ?? '',
    CLOUDINARY_API_SECRET: lireVariable('CLOUDINARY_API_SECRET') ?? '',
    CLOUDINARY_FOLDER: lireVariable('CLOUDINARY_FOLDER') ?? '',
    WAPY_PONT_CLE: lireVariable('WAPY_PONT_CLE') ?? '',
    WAPY_NUMEROS_TEST: lireVariable('WAPY_NUMEROS_TEST') ?? '',
  };
}
