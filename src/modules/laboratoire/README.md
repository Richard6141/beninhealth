# Module laboratoire

Responsabilité : gestion des examens médicaux, de la demande par un
professionnel de santé à la saisie du résultat par le laboratoire assigné
(Laboratory Service).

Périmètre : ExamenMedical (type d'examen, statut du cycle de vie, résultat,
rattachement obligatoire à une consultation d'origine, RG-LAB-01) entre un
patient, un professionnel demandeur (typiquement un médecin) et un
établissement sanitaire de type "laboratoire".

Hors périmètre : contenu clinique de la consultation d'origine (module
clinical), facturation ou tarification des examens, catalogue structuré de
types d'examens (typeExamen est un texte libre dans cette phase), imagerie
ou fichiers joints au résultat (resultat est un texte libre).

Phase d'implémentation : Phase 8.

## Implementation Phase 8

Server Actions dans `src/modules/laboratoire/actions.ts` (`"use server"`),
même principe Zero Trust que `src/modules/clinical/actions.ts` et
`src/modules/prescription/actions.ts` : le patient ou le professionnel
courant est toujours dérivé de `getSession()`, jamais d'un id transmis par
le client.

Régle métier centrale, vérifiée en base avant toute écriture, jamais
supposée : une demande d'examen n'est possible que si le patient concerné a
accordé un `Consentement` actif ("dossier_complet" ou "examens") au
professionnel connecté. `demanderExamenAction` refuse d'écrire quoi que ce
soit si ce n'est pas le cas (message "Aucun consentement actif pour ce
patient."). RG-LAB-01 du pack : `consultationId` est obligatoire (validation
applicative dans `schemaDemandeExamen`, pas de contrainte NOT NULL en base
pour ne pas casser les demandes existantes sans consultation) et doit
appartenir à la fois au patient et au professionnel connecté, sinon la
demande est refusée.

Seconde régle Zero Trust, symétrique côté laboratoire : un professionnel ne
peut saisir le résultat d'un examen que si cet examen est assigné à
l'établissement auquel il est lui-même rattaché (`ExamenMedical.laboratoireId`
comparé à `ProfessionnelSante.etablissementId` du professionnel connecté,
jamais à l'id transmis par le client seul). `saisirResultatExamenAction`
refuse toute saisie hors de ce périmètre.

Fonctions exposées (voir `actions.ts` pour la signature complète) :

- `listLaboratoires` : tous les établissements sanitaires de type
  "laboratoire", triés par nom.
- `demanderExamenAction` : crée l'`ExamenMedical` (statut initial "demande")
  après vérification du consentement, de l'existence du laboratoire cible et
  du rattachement de la consultation (obligatoire, RG-LAB-01) au couple
  (patient, professionnel). Notifie le laboratoire destinataire et le
  patient (ou son tuteur, via `destinataireNotificationPatient`).
- `getExamensDemandesParProfessionnel` : examens demandés par le
  professionnel connecté, du plus récent au plus ancien, avec le nom et
  l'identifiant santé du patient.
- `getMesExamens` : historique des examens du patient connecté, du plus
  récent au plus ancien, avec le nom du professionnel demandeur.
- `getExamensPourLaboratoire` : tous les examens (tous statuts confondus)
  assignés à l'établissement du professionnel connecté, triés pour présenter
  en premier ceux en attente de traitement ("demande" ou "en_cours"), puis
  par date. Renvoie un tableau vide si l'appelant n'a pas de profil
  `ProfessionnelSante` ou n'est pas rattaché à un établissement de type
  "laboratoire".
- `saisirResultatExamenAction` : fait passer un examen au statut "termine",
  enregistre le résultat et horodate `dateResultat`, après vérification du
  rattachement de l'examen au laboratoire de l'appelant.

Cycle de vie d'un `ExamenMedical` : "demande" (créé par le professionnel
demandeur) puis "termine" (résultat saisi par le laboratoire). Les statuts
"en_cours" et "annule" sont prévus au schéma et pris en compte dans le tri de
`getExamensPourLaboratoire`, mais aucune Server Action de cette phase ne les
positionne : ils restent ouverts à une phase ultérieure (ex. passage manuel
en "en_cours" à la réception de l'échantillon, annulation par le demandeur).

Chaque demande d'examen et chaque saisie de résultat sont tracées dans
`JournalAudit` (action "creation" puis "modification",
`donneeConcernee` au format `examen_medical:<id>`), trace transverse
obligatoire de toute action sensible sur ce module.

## Préparation interopérabilité HL7 FHIR

Documentation de préparation uniquement : aucune exposition FHIR réelle
n'existe dans cette phase. Si une API FHIR était ajoutée plus tard, un
`ExamenMedical` se projetterait sur une ressource `ServiceRequest` (la
demande) accompagnée d'un `Observation` ou `DiagnosticReport` (le résultat) :

- `subject` : référence vers le `Patient` FHIR correspondant à
  `ExamenMedical.patientId`.
- `requester` : référence vers le `Practitioner` FHIR correspondant à
  `ExamenMedical.demandeurId`.
- `performer` : référence vers l'`Organization` FHIR correspondant à
  `ExamenMedical.laboratoireId`.
- `code` : à construire à partir de `ExamenMedical.typeExamen` (texte libre
  dans cette phase, à faire correspondre à une terminologie type LOINC si un
  catalogue structuré est introduit plus tard).
- `status` : dérivé de `ExamenMedical.statut` ("demande" vers `active`,
  "en_cours" vers `active` avec un `Task` associé, "termine" vers
  `completed`, "annule" vers `revoked`).
- `encounter` : référence vers l'`Encounter` FHIR correspondant à
  `ExamenMedical.consultationId`, quand renseigné.
- `authoredOn` : `ExamenMedical.date`.
- Le résultat (`ExamenMedical.resultat`, `ExamenMedical.dateResultat`) se
  projetterait sur un `DiagnosticReport.conclusion` (ou une ressource
  `Observation` liée par `basedOn` au `ServiceRequest`), avec
  `DiagnosticReport.issued` correspondant à `dateResultat`.
