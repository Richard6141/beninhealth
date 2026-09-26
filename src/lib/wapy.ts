/**
 * Client du pont WhatsApp Business Wapy.pro (https://wapy.pro/developpeurs).
 * Point d'entree unique des envois WhatsApp de la plateforme : la cle
 * (WAPY_PONT_CLE) reste cote serveur et n'est jamais journalisee, pas plus que
 * le texte des messages (il contient un code a usage unique).
 *
 * On utilise POST /pont/v1/messages (texte libre) et non POST /pont/v1/otp :
 * le modele impose de l'endpoint OTP se termine par "Ne le communiquez a
 * personne", ce qui contredit le parcours d'acces par code (le patient doit
 * justement le donner au professionnel present devant lui) et habituerait les
 * patients a ignorer l'avertissement qui les protege. Le texte libre permet
 * d'indiquer qui demande l'acces et pour quelle duree.
 *
 * Limites du compte cote Wapy (a connaitre avant tout deploiement reel) :
 * 3 secondes minimum entre deux envois, 60 messages par heure et 500 par jour
 * pour l'ensemble de la plateforme.
 */

import { getEnv } from "@/lib/env";

const URL_MESSAGES = "https://wapy.pro/pont/v1/messages";
const DELAI_MAX_MS = 10_000;
const LONGUEUR_MAX_TEXTE = 1000;
const ATTENTE_PAR_DEFAUT_SECONDES = 5;

export type RaisonEchecWapy =
  | "non_configure"
  | "destinataire_non_autorise"
  | "requete_invalide"
  | "refuse"
  | "destinataire_injoignable"
  | "limite_atteinte"
  | "service_indisponible";

export type ResultatWapy =
  | { ok: true; rejeu: boolean }
  | { ok: false; raison: RaisonEchecWapy; detail?: string; reessayerDansSecondes?: number };

export interface MessageWapy {
  /** Numero au format E.164 avec "+" (ex. "+2290197000000"). */
  destinataire: string;
  texte: string;
  /** Reference prouvant que le destinataire a accepte de recevoir des messages. */
  consentement: string;
  /** Unique par evenement d'envoi : un renvoi avec la meme cle n'envoie pas deux fois. */
  cleIdempotence: string;
}

export function wapyConfigure(): boolean {
  return getEnv().WAPY_PONT_CLE.length > 0;
}

// Hors production, un envoi reel ne part que vers les numeros de test declares :
// la base de demonstration contient des numeros plausibles qui peuvent
// appartenir a de vraies personnes.
function destinataireAutorise(destinataire: string): boolean {
  const env = getEnv();

  if (env.NODE_ENV === "production") {
    return true;
  }

  return env.WAPY_NUMEROS_TEST.split(",")
    .map((numero) => numero.trim())
    .filter((numero) => numero.length > 0)
    .includes(destinataire);
}

async function lireDetail(reponse: Response): Promise<string | undefined> {
  try {
    const corps: unknown = await reponse.json();
    if (typeof corps === "object" && corps !== null && "detail" in corps) {
      const detail = (corps as { detail: unknown }).detail;
      return typeof detail === "string" ? detail : undefined;
    }
  } catch {
    // corps absent ou non JSON : le statut HTTP suffit
  }
  return undefined;
}

export async function envoyerMessageWapy(message: MessageWapy): Promise<ResultatWapy> {
  const cle = getEnv().WAPY_PONT_CLE;

  if (cle.length === 0) {
    return { ok: false, raison: "non_configure" };
  }

  if (!destinataireAutorise(message.destinataire)) {
    return { ok: false, raison: "destinataire_non_autorise" };
  }

  if (message.texte.trim().length === 0 || message.texte.length > LONGUEUR_MAX_TEXTE) {
    return { ok: false, raison: "requete_invalide", detail: "texte" };
  }

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MAX_MS);

  try {
    const reponse = await fetch(URL_MESSAGES, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cle}`,
        "Idempotency-Key": message.cleIdempotence,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        destinataire: message.destinataire,
        texte: message.texte,
        consentement: message.consentement,
      }),
      signal: controleur.signal,
      cache: "no-store",
    });

    if (reponse.ok) {
      let rejeu = false;
      try {
        const corps: unknown = await reponse.json();
        rejeu = typeof corps === "object" && corps !== null && (corps as { rejeu?: unknown }).rejeu === true;
      } catch {
        // succes sans corps exploitable : l'envoi a bien eu lieu
      }
      return { ok: true, rejeu };
    }

    const detail = await lireDetail(reponse);

    if (reponse.status === 400) {
      return { ok: false, raison: "requete_invalide", detail };
    }

    if (reponse.status === 401) {
      return { ok: false, raison: "refuse", detail: detail ?? "cle-invalide" };
    }

    if (reponse.status === 403) {
      const raison = detail === "destinataire-desabonne" ? "destinataire_injoignable" : "refuse";
      return { ok: false, raison, detail };
    }

    if (reponse.status === 404) {
      return { ok: false, raison: "destinataire_injoignable", detail };
    }

    if (reponse.status === 429) {
      const attente = Number(reponse.headers.get("Retry-After"));
      return {
        ok: false,
        raison: "limite_atteinte",
        detail,
        reessayerDansSecondes: Number.isFinite(attente) && attente > 0 ? attente : ATTENTE_PAR_DEFAUT_SECONDES,
      };
    }

    return { ok: false, raison: "service_indisponible", detail: detail ?? String(reponse.status) };
  } catch {
    return { ok: false, raison: "service_indisponible", detail: "reseau_ou_delai" };
  } finally {
    clearTimeout(minuteur);
  }
}
