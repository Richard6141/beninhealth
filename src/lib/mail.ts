import nodemailer from "nodemailer";
import { adresseDemoSansBoite } from "@/lib/demo";
import { getEnv } from "@/lib/env";

// Transporteur SMTP unique, reutilise entre les rechargements a chaud en
// developpement (meme principe que src/lib/prisma.ts : evite de recreer une
// connexion au serveur mail a chaque invocation).
const globalForMail = globalThis as unknown as {
  transporteurMail: ReturnType<typeof nodemailer.createTransport> | undefined;
};

function creerTransporteur() {
  const env = getEnv();

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE !== "false",
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  });
}

function getTransporteur() {
  if (!globalForMail.transporteurMail) {
    globalForMail.transporteurMail = creerTransporteur();
  }
  return globalForMail.transporteurMail;
}

export interface OptionsEmail {
  to: string;
  subject: string;
  /** Corps HTML de l'e-mail. */
  html: string;
  /** Repli texte brut, genere a partir du HTML si absent. */
  text?: string;
}

/**
 * Envoie un e-mail via le relais SMTP configure (voir .env.example : SMTP_*).
 * Point d'entree unique pour tous les e-mails sortants de la plateforme
 * (codes de verification, notifications...), afin de garder une seule
 * configuration de transport a auditer plutot qu'un envoi ad hoc par module.
 */
export async function envoyerEmail(options: OptionsEmail): Promise<void> {
  const env = getEnv();

  // Serveur de demonstration : les adresses fictives du jeu de demonstration
  // ne recoivent rien, le code s'affiche a l'ecran (voir src/lib/demo.ts).
  if (adresseDemoSansBoite(options.to)) {
    return;
  }
  const transporteur = getTransporteur();

  await transporteur.sendMail({
    from: env.SMTP_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text ?? options.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  });
}

/**
 * Verifie que les identifiants SMTP configures sont valides et que le
 * serveur est joignable, sans envoyer de message. A utiliser pour un
 * diagnostic ponctuel (script, endpoint de sante), pas a chaque envoi.
 */
export async function verifierConnexionSmtp(): Promise<void> {
  await getTransporteur().verify();
}
