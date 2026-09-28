/**
 * Catalogue des notifications (F-NOT-04 du pack, section 17.1 tableau) :
 * source de reference pour semer ModeleNotification (voir
 * src/modules/administration/referentiel-notifications.ts). Module pur (pas
 * de "use server").
 *
 * Reprend le tableau complet du pack (38 codes, section 17.1). Les variables entre
 * accolades ({date}, {etablissement}...) sont indicatives, jamais
 * interpolees automatiquement dans ce depot (voir la limite assumee
 * documentee dans referentiel-notifications.ts) : le texte est affiche et
 * modifiable tel quel, sa substitution reste a construire cote appelant le
 * jour ou ce catalogue devient la source reelle des envois.
 */

export interface ModeleNotificationDefaut {
  code: string;
  declencheur: string;
  destinataire: string;
  canaux: string;
  texteModele: string;
}

export const CATALOGUE_NOTIFICATIONS_DEFAUT: ModeleNotificationDefaut[] = [
  { code: "N-OTP", declencheur: "Demande de code", destinataire: "Titulaire", canaux: "SMS", texteModele: "BHIP : votre code est {code}. Il expire dans 10 min. Ne le communiquez à personne." },
  { code: "N-APPT-CONFIRMED", declencheur: "RDV confirmé", destinataire: "Patient / tuteur", canaux: "Interne + SMS", texteModele: "BHIP : RDV confirmé le {date} à {heure}, {etablissement}." },
  { code: "N-APPT-REMINDER", declencheur: "Veille 18h / H-2", destinataire: "Patient / tuteur", canaux: "Interne + SMS", texteModele: "BHIP : rappel de votre RDV le {date} à {heure}, {etablissement}." },
  { code: "N-APPT-CANCELLED-FAC", declencheur: "Annulation par l'établissement", destinataire: "Patient", canaux: "Interne + SMS", texteModele: "BHIP : votre RDV du {date} est annulé par l'établissement. Détails dans l'application." },
  { code: "N-APPT-REQUEST", declencheur: "Nouvelle demande à confirmer", destinataire: "Accueil", canaux: "Interne", texteModele: "" },
  { code: "N-CONSULT-AVAILABLE", declencheur: "Consultation validée", destinataire: "Patient", canaux: "Interne (+ SMS si activé)", texteModele: "BHIP : un nouveau document est disponible dans votre dossier." },
  { code: "N-RX-AVAILABLE", declencheur: "Ordonnance signée", destinataire: "Patient", canaux: "Interne (+ SMS)", texteModele: "BHIP : un nouveau document est disponible dans votre dossier." },
  { code: "N-RX-DISPENSED", declencheur: "Délivrance", destinataire: "Patient", canaux: "Interne", texteModele: "" },
  { code: "N-LAB-RESULT-PRO", declencheur: "Résultat validé", destinataire: "Prescripteur", canaux: "Interne (prioritaire si critique)", texteModele: "" },
  { code: "N-LAB-RESULT-PATIENT", declencheur: "Résultat validé (non soumis à annonce, ou annoncé)", destinataire: "Patient", canaux: "Interne (+ SMS)", texteModele: "BHIP : un résultat est disponible dans votre dossier." },
  { code: "N-CONSENT-REQUEST", declencheur: "Un professionnel demande l'accès", destinataire: "Patient", canaux: "Interne + SMS", texteModele: "BHIP : un soignant demande l'accès à votre dossier. Répondez dans l'application." },
  { code: "N-CONSENT-GRANTED", declencheur: "Consentement accordé", destinataire: "Bénéficiaire", canaux: "Interne", texteModele: "" },
  { code: "N-EMERGENCY-ACCESS", declencheur: "Accès d'urgence ouvert", destinataire: "Patient / tuteur, responsable, auditeur", canaux: "Interne + SMS (patient)", texteModele: "BHIP : votre dossier a été consulté en urgence par {etablissement} le {date}. Détails dans l'application." },
  { code: "N-NEW-DEVICE", declencheur: "Connexion pro depuis un nouvel appareil", destinataire: "Titulaire", canaux: "Interne + SMS", texteModele: "BHIP : nouvelle connexion à votre compte le {date} à {heure}. Si ce n'est pas vous, contactez le support." },
  { code: "N-PASSWORD-CHANGED", declencheur: "Mot de passe modifié", destinataire: "Titulaire", canaux: "SMS", texteModele: "BHIP : votre mot de passe a été modifié. Si ce n'est pas vous, contactez le support." },
  { code: "N-INVITE", declencheur: "Invitation professionnelle", destinataire: "Invité", canaux: "SMS ou email", texteModele: "BHIP : {etablissement} vous invite. Activez votre compte : {lien} (7 jours)." },
  { code: "N-PRACTITIONER-DECISION", declencheur: "Profil validé / refusé", destinataire: "Professionnel (+ responsable si refus)", canaux: "Interne + SMS", texteModele: "BHIP : votre profil professionnel a été examiné. Détails dans l'application." },
  { code: "N-CLAIM-CODE", declencheur: "Dossier créé sans compte", destinataire: "Patient", canaux: "SMS", texteModele: "BHIP : un dossier santé a été créé pour vous. Créez votre compte avec ce numéro. Code : {code} (30 jours)." },
  { code: "N-SYNC-REVIEW", declencheur: "Saisie terrain mise en revue", destinataire: "Agent", canaux: "Interne", texteModele: "" },
  { code: "N-HEALTH-ALERT", declencheur: "Alerte épidémiologique", destinataire: "Autorités de la portée", canaux: "Interne", texteModele: "" },
  { code: "N-DRAFT-REMINDER", declencheur: "Brouillon de consultation de 3 jours", destinataire: "Médecin", canaux: "Interne", texteModele: "" },
  { code: "N-APPT-REJECTED", declencheur: "Demande de RDV refusée", destinataire: "Patient", canaux: "Interne + SMS", texteModele: "BHIP : votre demande de RDV du {date} n'a pas pu être acceptée. Détails dans l'application." },
  { code: "N-APPT-EXPIRED", declencheur: "Demande de RDV expirée", destinataire: "Patient", canaux: "Interne + SMS", texteModele: "BHIP : votre demande de RDV du {date} n'a pas reçu de réponse. Choisissez un autre créneau." },
  { code: "N-RX-CANCELLED", declencheur: "Ordonnance annulée ou arrêtée", destinataire: "Patient", canaux: "Interne", texteModele: "" },
  { code: "N-LAB-REQUESTED", declencheur: "Demande d'examen enregistrée", destinataire: "Patient", canaux: "Interne", texteModele: "" },
  { code: "N-LAB-CANCELLED", declencheur: "Demande d'examen annulée", destinataire: "Patient, laboratoire", canaux: "Interne", texteModele: "" },
  { code: "N-LAB-CRITICAL-ESCALATION", declencheur: "Résultat critique non lu sous 2 h", destinataire: "Responsable d'établissement du prescripteur", canaux: "Interne (prioritaire)", texteModele: "" },
  { code: "N-LAB-ANNOUNCE-OVERDUE", declencheur: "Résultat à annoncer non annoncé sous 30 jours", destinataire: "Auditeur, prescripteur", canaux: "Interne", texteModele: "" },
  { code: "N-CONSENT-REVOKED", declencheur: "Consentement retiré", destinataire: "Bénéficiaire", canaux: "Interne", texteModele: "" },
  { code: "N-GUARDIAN-CONFLICT", declencheur: "Second parent déclare le même enfant", destinataire: "Tuteur vérifié existant", canaux: "Interne + SMS", texteModele: "BHIP : une autre personne a déclaré être tuteur d'un de vos proches. Détails dans l'application." },
  { code: "N-GUARDIAN-REQUEST", declencheur: "Demande de tutelle d'une personne majeure", destinataire: "Personne concernée", canaux: "Interne + SMS", texteModele: "BHIP : une personne demande à gérer votre dossier. Répondez dans l'application." },
  { code: "N-ACCOUNT-LOCKED", declencheur: "Compte verrouillé après échecs", destinataire: "Titulaire", canaux: "SMS", texteModele: "BHIP : trop de tentatives de connexion. Votre compte est bloqué temporairement." },
  { code: "N-EMERGENCY-NONCOMPLIANT", declencheur: "Revue d'urgence non conforme", destinataire: "Professionnel, responsable", canaux: "Interne", texteModele: "" },
  { code: "N-EMERGENCY-LIMIT", declencheur: "Limite d'accès d'urgence dépassée", destinataire: "Auditeur", canaux: "Interne", texteModele: "" },
  { code: "N-MERGE", declencheur: "Fusion de dossiers", destinataire: "Patient(s) ayant un compte", canaux: "Interne", texteModele: "" },
  { code: "N-2FA-RESET", declencheur: "Second facteur réinitialisé", destinataire: "Titulaire", canaux: "Interne + SMS", texteModele: "BHIP : la double authentification de votre compte a été réinitialisée. Si ce n'est pas vous, contactez le support." },
  { code: "N-COMMUNITY-REFERRAL", declencheur: "Référence communautaire reçue", destinataire: "Soignants du centre de santé", canaux: "Interne", texteModele: "" },
  { code: "N-LAB-SAMPLE-REJECTED", declencheur: "Échantillon rejeté", destinataire: "Prescripteur, patient", canaux: "Interne + SMS (patient)", texteModele: "BHIP : un nouveau prélèvement est nécessaire. Détails dans l'application." },
  { code: "N-CONSULT-ERROR", declencheur: "Consultation retirée « saisie par erreur »", destinataire: "Responsable d'établissement, patient", canaux: "Interne", texteModele: "" },
];
