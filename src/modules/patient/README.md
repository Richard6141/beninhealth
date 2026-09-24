# Module patient

Responsabilité : gestion du dossier patient et du consentement (Patient Service).

Périmètre : Patient (identifiantSante, référence future ANIP/NPI, données
démographiques de santé, contacts d'urgence) et Consentement (autoriser ou
retirer l'accès d'un acteur à tout ou partie du dossier).

Hors périmètre : authentification (module identity), contenu clinique détaillé
(consultations, prescriptions, examens : modules clinical et prescription),
établissements (module facility).

Phase d'implémentation : Phase 2.

## Implémentation Phase 3 (dossier patient et consentement)

Server Actions et fonctions de lecture implémentées dans
`src/modules/patient/actions.ts` :

- `getMonDossierPatient` : dossier (identifiant santé, groupe sanguin,
  allergies, antécédents, maladies chroniques, contacts d'urgence) du patient
  connecté, dérivé de `getSession()`.
- `getMesConsentements` : consentements du patient connecté, enrichis du nom
  complet et de la spécialité de chaque acteur autorisé.
- `listProfessionnelsDisponibles` : professionnels de santé au statut de
  validation "valide", pour le sélecteur d'octroi côté écran, en excluant ceux
  déjà autorisés par un consentement actif.
- `updatePatientProfileAction` : mise à jour du dossier (groupe sanguin,
  allergies, antécédents, maladies chroniques, contact d'urgence), validée
  avec zod.
- `grantConsentAction` : octroi ou réactivation d'un consentement, en `upsert`
  sur la contrainte unique `(patientId, acteurAutoriseId)`.
- `revokeConsentAction` : retrait d'un consentement.

Principe Zero Trust appliqué systématiquement (voir
`src/modules/identity/actions.ts`, pris comme modèle) : le patient courant est
toujours dérivé de `getSession().userId`, jamais d'un identifiant transmis par
le client. Toute action portant sur une ressource identifiée par un id transmis
(par exemple `consentementId`) vérifie explicitement que cette ressource
appartient bien au patient connecté avant modification. Chaque modification de
dossier et chaque événement de consentement (octroi, retrait) est tracé dans
`JournalAudit`.
