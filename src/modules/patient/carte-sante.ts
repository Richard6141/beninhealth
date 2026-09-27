"use server";

/**
 * Carte sante numerique (F-CIT-05 du pack) : permet a l'accueil d'un
 * etablissement de verifier la presence recente du patient sans saisie,
 * via un QR a validite tres courte. Distinct du QR personnel permanent
 * deja existant (src/modules/verification/actions.ts, getMonQrCode) : ce
 * dernier encode une URL statique (/app/verification/[userId]) qui ne
 * prouve aucune fraicheur (un QR photographie une fois resterait valable
 * indefiniment, seul le controle de consentement protege la donnee
 * medicale derriere), inadapte a l'objectif de F-CIT-05 ("prouver la
 * presence"), non modifie ici pour ne pas perturber cet usage different
 * (badge d'identite, sans exigence de fraicheur).
 *
 * RG-CIT-40 : jeton temporaire (5 minutes, usage unique), jamais
 * l'identifiant sante en clair ni de donnee medicale dans le QR lui-meme,
 * seul un jeton opaque y est encode. Le jeton vit en base (JetonCarteSante) :
 * seule son empreinte SHA-256 est conservee, il survit donc a un redemarrage
 * et fonctionne avec plusieurs instances. Au plus MAX_JETONS_ACTIFS jetons
 * actifs par patient (les plus anciens sont supprimes) : generer un jeton n'en
 * invalide jamais un autre d'un seul coup, deux onglets ou deux appels
 * concurrents ne s'annulent donc pas.
 *
 * RG-CIT-41 (etape 3) : QR de secours "hors ligne" contenant uniquement
 * l'identifiant sante (jamais le jeton), pour le cas ou le personnel ne peut
 * pas atteindre le serveur au moment du scan. Statique (aucune expiration,
 * aucune ligne en base : l'identifiant sante n'est pas un secret, deja
 * affiche en clair a l'ecran) - a la difference du QR principal, il ne
 * prouve par lui-meme AUCUNE presence recente : le pack (RG-CIT-41,
 * RG-ACC-20) exige qu'il soit complete par un code SMS ou une verification
 * sur piece avant d'ouvrir un contexte de soins. Cette exigence s'applique a
 * l'ecran d'accueil (F-RDV-04, src/modules/facility/file-du-jour.ts, hors de
 * ce fichier) : ce module se limite a fournir le QR et l'avertissement
 * cote citoyen, jamais a decider seul qu'une presence est prouvee.
 *
 * Impression (etape 4, P1) : PDF au format carte bancaire (identite,
 * identifiant sante), jamais de QR dedans (texte du pack : "sans QR
 * dynamique" - un QR imprime deviendrait perime en moins de 5 minutes).
 * Jeton de telechargement a usage unique de 60 secondes
 * (carte-sante-impression.ts), meme principe que le PDF d'ordonnance
 * (F-CIT-06, prescription/jetons-telechargement.ts), fichier separe pour ne
 * pas partager un module entre deux domaines sans lien.
 *
 * Perimetre reduit assume : le jeton du QR principal reste opaque et
 * aleatoire, verifie par correspondance de son empreinte en base, plutot
 * qu'un jeton auto-descriptif signe HMAC contenant identifiant/expiration/
 * nonce (texte litteral de RG-CIT-40). Propriete de securite equivalente
 * (aucune donnee du jeton n'est falsifiable sans connaitre la valeur exacte,
 * usage unique et expiration verifies cote serveur dans tous les cas) mais
 * differente dans sa forme : un jeton signe mais non enregistre en base
 * pourrait etre "rejoue" jusqu'a expiration sans mecanisme d'usage unique
 * separe, ce que ce depot evite en faisant du seul enregistrement en base
 * la source de verite. Non repris ce soir (changer le format du jeton
 * toucherait aussi la route de verification, deja stable et testee).
 */

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerJetonImpressionCarteSante } from "@/modules/patient/carte-sante-impression";

const DUREE_JETON_MS = 5 * 60 * 1000;
const CONSERVATION_JETONS_EXPIRES_MS = 24 * 60 * 60 * 1000;
const LONGUEUR_MAX_JETON = 100;
const MAX_JETONS_ACTIFS = 5;

/**
 * Roles qui verifient une carte : le personnel de sante et l'administration.
 * Jamais un patient (verifier la carte d'un autre n'a aucun sens).
 */
const ROLES_VERIFICATEURS = [
  "medecin",
  "infirmier",
  "agent_communautaire",
  "pharmacien",
  "laboratoire",
  "admin_etablissement",
  "admin_national",
];

function empreinteJeton(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

async function urlAbsolue(chemin: string): Promise<string> {
  const listeEntetes = await headers();
  const hote = listeEntetes.get("host") ?? "localhost:3000";
  const protocole = listeEntetes.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${protocole}://${hote}${chemin}`;
}

export interface JetonCarteSante {
  dataUrlQr: string;
  expirationMs: number;
}

/**
 * Genere un nouveau jeton de carte sante pour le patient connecte (RG-CIT-40),
 * valable 5 minutes, usage unique. A rappeler par le client toutes les 5
 * minutes (ou apres consommation) pour renouveler le QR affiche.
 */
export async function genererJetonCarteSanteAction(): Promise<JetonCarteSante | null> {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    return null;
  }

  const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

  if (!patient) {
    return null;
  }

  const maintenant = Date.now();
  const jeton = randomBytes(24).toString("base64url");
  const expiration = maintenant + DUREE_JETON_MS;

  // On garde les MAX_JETONS_ACTIFS - 1 plus recents (le nouveau fait le compte) ;
  // les plus anciens actifs sont supprimes, ainsi que les expires depuis plus d'un jour.
  const aSupprimer = await prisma.jetonCarteSante.findMany({
    where: { patientId: patient.id, consommeLe: null, expireLe: { gt: new Date(maintenant) } },
    orderBy: { dateCreation: "desc" },
    skip: MAX_JETONS_ACTIFS - 1,
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.jetonCarteSante.deleteMany({ where: { id: { in: aSupprimer.map((ancien) => ancien.id) } } }),
    prisma.jetonCarteSante.deleteMany({ where: { expireLe: { lt: new Date(maintenant - CONSERVATION_JETONS_EXPIRES_MS) } } }),
    prisma.jetonCarteSante.create({
      data: { jetonHash: empreinteJeton(jeton), patientId: patient.id, expireLe: new Date(expiration) },
    }),
  ]);

  const url = await urlAbsolue(`/app/carte-sante/verifier?jeton=${jeton}`);
  const dataUrlQr = await QRCode.toDataURL(url, { width: 240, margin: 1 });

  return { dataUrlQr, expirationMs: expiration };
}

export type StatutVerificationCarte =
  | { statut: "valide"; nomComplet: string; identifiantSante: string; dateNaissance: string; sexe: string }
  | { statut: "expire_ou_utilise" }
  | { statut: "refuse" };

/**
 * Consomme un jeton de carte sante (usage unique, RG-CIT-40/41) : la toute
 * premiere consultation reussie renvoie l'identite minimale du patient
 * (jamais de donnee medicale), toute consultation suivante du meme jeton
 * echoue (CA-1), y compris deux verifications simultanees (mise a jour
 * conditionnelle). Reserve au personnel de sante et a l'administration :
 * jamais un patient ni un acces anonyme.
 */
export async function verifierCarteSanteAction(jeton: string): Promise<StatutVerificationCarte> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => ROLES_VERIFICATEURS.includes(role))) {
    return { statut: "refuse" };
  }

  if (typeof jeton !== "string" || jeton.length === 0 || jeton.length > LONGUEUR_MAX_JETON) {
    return { statut: "expire_ou_utilise" };
  }

  const maintenant = new Date();
  const jetonHash = empreinteJeton(jeton);

  const consomme = await prisma.jetonCarteSante.updateMany({
    where: { jetonHash, consommeLe: null, expireLe: { gt: maintenant } },
    data: { consommeLe: maintenant },
  });

  if (consomme.count !== 1) {
    return { statut: "expire_ou_utilise" };
  }

  const enregistrement = await prisma.jetonCarteSante.findUnique({
    where: { jetonHash },
    select: { patientId: true },
  });

  const patient = enregistrement
    ? await prisma.patient.findUnique({ where: { id: enregistrement.patientId }, include: { user: true } })
    : null;

  if (!patient) {
    return { statut: "expire_ou_utilise" };
  }

  const adresseTechnique = await (async () => {
    try {
      const listeEntetes = await headers();
      return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
    } catch {
      return "inconnue";
    }
  })();

  await journaliser({
    utilisateurId: session.userId,
    action: "verification_carte_sante",
    donneeConcernee: `patient:${patient.id}`,
    adresseTechnique,
    justification: "Verification de presence via la carte sante numerique (F-CIT-05).",
  });

  return {
    statut: "valide",
    nomComplet: `${patient.user.prenom} ${patient.user.nom}`,
    identifiantSante: patient.identifiantSante,
    dateNaissance: patient.dateNaissance.toISOString(),
    sexe: patient.sexe,
  };
}

export interface CarteSanteProfil {
  nomComplet: string;
  dateNaissance: string; // ISO
  identifiantSante: string;
  /** QR de secours "hors ligne" (RG-CIT-41) : encode uniquement l'identifiant sante, jamais un jeton. */
  dataUrlQrHorsLigne: string;
}

/**
 * Identite minimale du patient connecte pour l'ecran "Ma carte sante" (nom,
 * date de naissance, identifiant sante) et le QR de secours hors ligne.
 * Fonction de lecture dediee plutot qu'une extension de getMonProfil
 * (src/modules/identity/actions.ts, deja modifie par une autre session ce
 * soir, et qui ne renvoie pas la date de naissance).
 */
export async function getCarteSanteProfilAction(): Promise<CarteSanteProfil | null> {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    return null;
  }

  const patient = await prisma.patient.findUnique({
    where: { userId: session.userId },
    include: { user: true },
  });

  if (!patient) {
    return null;
  }

  const dataUrlQrHorsLigne = await QRCode.toDataURL(patient.identifiantSante, { width: 160, margin: 1 });

  return {
    nomComplet: `${patient.user.prenom} ${patient.user.nom}`,
    dateNaissance: patient.dateNaissance.toISOString(),
    identifiantSante: patient.identifiantSante,
    dataUrlQrHorsLigne,
  };
}

export interface LienImpressionCarteActionState {
  error: string | null;
  url: string | null;
}

/**
 * Genere un lien de telechargement a usage unique (60 secondes) du PDF
 * imprimable de la carte sante (F-CIT-05, etape 4, P1). Le controle d'acces
 * (le patient connecte est bien le titulaire) se fait ICI, avant de generer
 * le jeton ; la route de telechargement
 * (src/app/api/patient/carte-sante/telecharger/route.ts) fait confiance au
 * seul jeton, sans reverifier de session, meme principe que le
 * telechargement d'ordonnance (F-CIT-06).
 */
export async function genererLienImpressionCarteAction(): Promise<LienImpressionCarteActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    return { error: "Session expiree. Veuillez vous reconnecter.", url: null };
  }

  const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

  if (!patient) {
    return { error: "Profil introuvable.", url: null };
  }

  const jeton = creerJetonImpressionCarteSante(patient.id);

  return { error: null, url: `/api/patient/carte-sante/telecharger?jeton=${jeton}` };
}
