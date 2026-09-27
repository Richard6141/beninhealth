"use server";

/**
 * Server Actions du module soins : prise en charge infirmiere (F-CLI-12 du
 * pack) : "l'infirmier voit la liste des patients arrives (rendez-vous
 * confirmes) sans constantes prises pour aujourd'hui ; il selectionne un
 * patient, saisit ses constantes vitales, un niveau de priorite de tri et
 * une courte note de soins". Ne cree jamais de Consultation (l'infirmier n'a
 * pas cette permission, voir src/security/permissions.ts) : uniquement une
 * ligne PriseEnChargeInfirmiere, que le medecin recuperera plus tard pour
 * pre-remplir sa propre consultation (getPriseEnChargeNonRecuperee).
 *
 * Meme principe applique de bout en bout que src/modules/clinical/actions.ts :
 * Zero Trust. Le professionnel courant est toujours derive de getSession(),
 * jamais d'un id transmis par le client. Toute action touchant au dossier
 * d'un patient verifie explicitement qu'un Consentement actif existe pour
 * (patientId, acteurAutoriseId: session.userId), en plus d'une verification
 * RBAC explicite via can(). Toute creation est tracee dans JournalAudit.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { getRendezVousDeLEtablissementDuProfessionnel } from "@/modules/facility/actions";
import {
  calculerIMC,
  controlerFrequenceRespiratoire,
  controlerGlycemie,
  controlerIMC,
  controlerPoids,
  controlerPouls,
  controlerSaturationOxygene,
  controlerTaille,
  controlerTemperature,
  controlerTensionDiastolique,
  controlerTensionSystolique,
  type ResultatControleConstante,
} from "@/modules/clinical/controles-constantes";
import { PRIORITES_TRI } from "./priorites";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface SoinsActionState {
  error: string | null;
  success: boolean;
  priseEnChargeId?: string;
}

/** Patient arrive (rendez-vous confirme du jour) dont les constantes n'ont pas encore ete prises. */
export interface PatientAttendantConstantes {
  rendezVousId: string;
  patientId: string;
  patientNomComplet: string;
  heureRendezVous: string; // ISO
  motif: string;
}

/** Contenu d'une prise en charge infirmiere, pret a pre-remplir la consultation du medecin. */
export interface PriseEnChargeInfirmiereResume {
  id: string;
  patientId: string;
  prioriteTri: string;
  temperatureCelsius: number | null;
  pouls: number | null;
  tensionSystolique: number | null;
  tensionDiastolique: number | null;
  frequenceRespiratoire: number | null;
  saturationOxygene: number | null;
  poidsKg: number | null;
  tailleCm: number | null;
  glycemieGL: number | null;
  noteSoins: string;
  statut: string;
  date: string; // ISO
}

/** Champ numerique facultatif : une chaine vide devient undefined plutot qu'une erreur de coercion. */
/** Types de consentement qui autorisent a ECRIRE une prise en charge infirmiere (meme regle que la creation d'une consultation). */
const TYPES_ACCES_ECRITURE_SOINS = ["dossier_complet", "consultations"] as const;

const champNumeriqueOptionnel = z.preprocess(
  (valeur) => (typeof valeur === "string" && valeur.trim() === "" ? undefined : valeur),
  z.coerce.number().optional()
);

const schemaEnregistrementPriseEnCharge = z.object({
  patientId: z.string().trim().min(1, "Le patient est obligatoire."),
  rendezVousId: z.string().trim().optional().default(""),
  prioriteTri: z.enum(PRIORITES_TRI, { message: "La priorite de tri est invalide." }),
  temperatureCelsius: champNumeriqueOptionnel,
  pouls: champNumeriqueOptionnel,
  tensionSystolique: champNumeriqueOptionnel,
  tensionDiastolique: champNumeriqueOptionnel,
  frequenceRespiratoire: champNumeriqueOptionnel,
  saturationOxygene: champNumeriqueOptionnel,
  poidsKg: champNumeriqueOptionnel,
  tailleCm: champNumeriqueOptionnel,
  glycemieGL: champNumeriqueOptionnel,
  // Meme convention que RG-CLI-50 (src/modules/clinical/actions.ts) : confirmation
  // globale exigee si au moins une constante saisie est dans sa plage d'alerte.
  confirmerAlerteConstantes: z.coerce.boolean().optional().default(false),
  noteSoins: z.string().trim().min(1, "La note de soins est obligatoire."),
});

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse =
      listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/** Lit un champ texte d'un FormData, jamais null (chaine vide si absent). */
function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/** Vrai si la date transmise tombe le jour calendaire courant. */
function estAujourdHui(date: Date): boolean {
  const maintenant = new Date();
  return (
    date.getFullYear() === maintenant.getFullYear() &&
    date.getMonth() === maintenant.getMonth() &&
    date.getDate() === maintenant.getDate()
  );
}

/** Bornes [debut, fin) du jour calendaire courant, pour une requete "cree aujourd'hui". */
function bornesDuJourCourant(): { debut: Date; fin: Date } {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}

/**
 * Liste les patients arrives (rendez-vous confirme pour aujourd'hui) dans
 * l'etablissement de l'infirmier connecte (derive de getSession() ->
 * ProfessionnelSante.etablissementId, via getRendezVousDeLEtablissementDuProfessionnel),
 * et n'ayant pas encore de PriseEnChargeInfirmiere enregistree aujourd'hui
 * (n'importe quel statut compte comme "deja pris en charge" : evite une
 * double prise de constantes le meme jour, quel que soit l'infirmier de
 * garde qui l'a effectuee).
 */
export async function getPatientsAttendantConstantes(): Promise<PatientAttendantConstantes[]> {
  const session = await getSession();

  if (!session) {
    return [];
  }

  if (!session.roles.some((role) => can(role, "read", "prise_en_charge_infirmiere"))) {
    return [];
  }

  const rendezVous = await getRendezVousDeLEtablissementDuProfessionnel();
  const rendezVousDuJour = rendezVous.filter(
    (rdv) => rdv.statut === "confirme" && estAujourdHui(new Date(rdv.date))
  );

  if (rendezVousDuJour.length === 0) {
    return [];
  }

  const { debut, fin } = bornesDuJourCourant();

  const dejaPrisEnCharge = await prisma.priseEnChargeInfirmiere.findMany({
    where: {
      patientId: { in: rendezVousDuJour.map((rdv) => rdv.patientId) },
      date: { gte: debut, lt: fin },
    },
    select: { patientId: true },
  });
  const idsDejaPrisEnCharge = new Set(dejaPrisEnCharge.map((prise) => prise.patientId));

  return rendezVousDuJour
    .filter((rdv) => !idsDejaPrisEnCharge.has(rdv.patientId))
    .map((rdv) => ({
      rendezVousId: rdv.id,
      patientId: rdv.patientId,
      patientNomComplet: rdv.patientNomComplet ?? "Patient non precise",
      heureRendezVous: rdv.date,
      motif: rdv.motif,
    }));
}

/**
 * Enregistre une prise en charge infirmiere (F-CLI-12 du pack) : constantes
 * vitales, priorite de tri et note de soins pour un patient. Reserve au role
 * infirmier (create:prise_en_charge_infirmiere dans la matrice RBAC),
 * verifie explicitement en plus du Consentement actif (Zero Trust, meme
 * garde que enregistrerConsultationAction). Chaque constante saisie est
 * controlee par controles-constantes.ts, seule autorite reelle : une valeur
 * hors plage acceptee est refusee definitivement, une valeur en plage
 * d'alerte exige la case de confirmation. Ne cree jamais de Consultation.
 */
export async function enregistrerPriseEnChargeAction(
  prevState: SoinsActionState,
  formData: FormData
): Promise<SoinsActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "prise_en_charge_infirmiere"))) {
    return { error: "Action reservee au personnel infirmier.", success: false };
  }

  const validation = schemaEnregistrementPriseEnCharge.safeParse({
    patientId: texte(formData, "patientId"),
    rendezVousId: texte(formData, "rendezVousId"),
    prioriteTri: texte(formData, "prioriteTri"),
    temperatureCelsius: texte(formData, "temperatureCelsius"),
    pouls: texte(formData, "pouls"),
    tensionSystolique: texte(formData, "tensionSystolique"),
    tensionDiastolique: texte(formData, "tensionDiastolique"),
    frequenceRespiratoire: texte(formData, "frequenceRespiratoire"),
    saturationOxygene: texte(formData, "saturationOxygene"),
    poidsKg: texte(formData, "poidsKg"),
    tailleCm: texte(formData, "tailleCm"),
    glycemieGL: texte(formData, "glycemieGL"),
    confirmerAlerteConstantes: texte(formData, "confirmerAlerteConstantes"),
    noteSoins: texte(formData, "noteSoins"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de prise en charge invalides."),
      success: false,
    };
  }

  const {
    patientId,
    rendezVousId,
    prioriteTri,
    temperatureCelsius,
    pouls,
    tensionSystolique,
    tensionDiastolique,
    frequenceRespiratoire,
    saturationOxygene,
    poidsKg,
    tailleCm,
    glycemieGL,
    confirmerAlerteConstantes,
    noteSoins,
  } = validation.data;

  try {
    const infirmier = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!infirmier) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });

    if (!patient) {
      return { error: "Ce patient est introuvable.", success: false };
    }

    const dateReference = new Date();
    const controles: ResultatControleConstante[] = [];

    if (temperatureCelsius !== undefined) controles.push(controlerTemperature(temperatureCelsius));
    if (pouls !== undefined) controles.push(controlerPouls(pouls, patient.dateNaissance, dateReference));
    if (tensionSystolique !== undefined && tensionDiastolique !== undefined) {
      controles.push(
        controlerTensionSystolique(tensionSystolique, tensionDiastolique, patient.dateNaissance, dateReference)
      );
      controles.push(controlerTensionDiastolique(tensionDiastolique));
    }
    if (frequenceRespiratoire !== undefined) {
      controles.push(controlerFrequenceRespiratoire(frequenceRespiratoire, patient.dateNaissance, dateReference));
    }
    if (saturationOxygene !== undefined) controles.push(controlerSaturationOxygene(saturationOxygene));
    if (poidsKg !== undefined) controles.push(controlerPoids(poidsKg));
    if (tailleCm !== undefined) controles.push(controlerTaille(tailleCm));
    if (glycemieGL !== undefined) controles.push(controlerGlycemie(glycemieGL));

    const imc = calculerIMC(poidsKg ?? null, tailleCm ?? null);
    if (imc !== null) controles.push(controlerIMC(imc));

    const refus = controles.find((controle) => controle.statut === "refus");
    if (refus) {
      return { error: refus.message, success: false };
    }

    const uneAlerte = controles.some((controle) => controle.statut === "alerte");
    if (uneAlerte && !confirmerAlerteConstantes) {
      return {
        error: "Au moins une constante est inhabituelle. Confirmez pour enregistrer malgre tout.",
        success: false,
      };
    }

    const consentement = await prisma.consentement.findUnique({
      where: {
        patientId_acteurAutoriseId: {
          patientId,
          acteurAutoriseId: session.userId,
        },
      },
    });

    // Ecriture : un consentement "urgence" ou limite a un autre domaine
    // (examens, documents...) ne donne pas le droit de creer une prise en
    // charge, meme regle que la creation d'une consultation.
    const consentementValide =
      consentement !== null &&
      consentement.statut === "actif" &&
      (consentement.dateFin === null || consentement.dateFin > new Date()) &&
      (TYPES_ACCES_ECRITURE_SOINS as readonly string[]).includes(consentement.typeAcces);

    if (!consentementValide) {
      return {
        error:
          "Aucun consentement actif pour ce patient. Le patient doit d'abord vous autoriser depuis son espace.",
        success: false,
      };
    }

    const rendezVousIdNettoye = rendezVousId.trim();

    if (rendezVousIdNettoye.length > 0) {
      const rendezVous = await prisma.rendezVous.findUnique({ where: { id: rendezVousIdNettoye } });

      if (
        !rendezVous ||
        rendezVous.patientId !== patientId ||
        rendezVous.etablissementId !== infirmier.etablissementId
      ) {
        return { error: "Ce rendez-vous est introuvable.", success: false };
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const priseEnChargeCreee = await prisma.$transaction(async (tx) => {
      const creee = await tx.priseEnChargeInfirmiere.create({
        data: {
          patientId,
          infirmierId: infirmier.id,
          etablissementId: infirmier.etablissementId,
          prioriteTri,
          temperatureCelsius: temperatureCelsius ?? null,
          pouls: pouls ?? null,
          tensionSystolique: tensionSystolique ?? null,
          tensionDiastolique: tensionDiastolique ?? null,
          frequenceRespiratoire: frequenceRespiratoire ?? null,
          saturationOxygene: saturationOxygene ?? null,
          poidsKg: poidsKg ?? null,
          tailleCm: tailleCm ?? null,
          glycemieGL: glycemieGL ?? null,
          noteSoins,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_prise_en_charge_infirmiere",
          donneeConcernee: `prise_en_charge_infirmiere:${creee.id}`,
          adresseTechnique,
          justification: `Prise en charge infirmiere enregistree pour le patient ${patientId} (priorite ${prioriteTri})`,
        },
        tx
      );

      return creee;
    });

    return { error: null, success: true, priseEnChargeId: priseEnChargeCreee.id };
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement de la prise en charge infirmiere :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Recupere la prise en charge infirmiere la plus recente et non encore
 * recuperee (statut "en_attente") d'un patient, destinee a pre-remplir la
 * consultation du medecin (F-CLI-12 du pack : ce fichier n'effectue pas
 * lui-meme ce rattachement, seulement la lecture). Reserve aux roles
 * detenant read:prise_en_charge_infirmiere (infirmier, medecin), avec la
 * meme garde Zero Trust que getResumePatient : un Consentement actif pour ce
 * patient doit exister pour l'utilisateur connecte.
 *
 * Bornee au jour courant et a l'etablissement du medecin connecte (defaut
 * corrige, signale dans docs/reste-a-faire.md) : sans ces deux bornes, une
 * prise en charge vieille de plusieurs jours, ou faite dans un tout autre
 * etablissement, pouvait pre-remplir la consultation du jour sans aucun
 * rapport avec la visite en cours.
 */
export async function getPriseEnChargeNonRecuperee(
  patientId: string
): Promise<PriseEnChargeInfirmiereResume | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  if (!session.roles.some((role) => can(role, "read", "prise_en_charge_infirmiere"))) {
    return null;
  }

  const professionnel = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });

  if (!professionnel) {
    return null;
  }

  const consentement = await prisma.consentement.findUnique({
    where: {
      patientId_acteurAutoriseId: {
        patientId,
        acteurAutoriseId: session.userId,
      },
    },
  });

  const consentementValide =
    consentement !== null &&
    consentement.statut === "actif" &&
    (consentement.dateFin === null || consentement.dateFin > new Date());

  if (!consentementValide) {
    return null;
  }

  const { debut, fin } = bornesDuJourCourant();

  const priseEnCharge = await prisma.priseEnChargeInfirmiere.findFirst({
    where: {
      patientId,
      statut: "en_attente",
      etablissementId: professionnel.etablissementId,
      date: { gte: debut, lt: fin },
    },
    orderBy: { date: "desc" },
  });

  if (!priseEnCharge) {
    return null;
  }

  return {
    id: priseEnCharge.id,
    patientId: priseEnCharge.patientId,
    prioriteTri: priseEnCharge.prioriteTri,
    temperatureCelsius: priseEnCharge.temperatureCelsius,
    pouls: priseEnCharge.pouls,
    tensionSystolique: priseEnCharge.tensionSystolique,
    tensionDiastolique: priseEnCharge.tensionDiastolique,
    frequenceRespiratoire: priseEnCharge.frequenceRespiratoire,
    saturationOxygene: priseEnCharge.saturationOxygene,
    poidsKg: priseEnCharge.poidsKg,
    tailleCm: priseEnCharge.tailleCm,
    glycemieGL: priseEnCharge.glycemieGL,
    noteSoins: priseEnCharge.noteSoins,
    statut: priseEnCharge.statut,
    date: priseEnCharge.date.toISOString(),
  };
}
