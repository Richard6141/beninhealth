# Module facility

Responsabilité : gestion des établissements sanitaires et des rendez-vous (Facility Service).

Périmètre : EtablissementSanitaire (type, localisation, coordonnées GPS,
services disponibles, capacité) et RendezVous (demandé, confirmé, terminé,
annulé) entre un patient, un professionnel et un établissement.

Hors périmètre : contenu clinique des rendez-vous honorés (module clinical),
identité des professionnels au-delà de leur rattachement à un établissement
(module identity).

Phase d'implémentation : phase ultérieure, après identity, patient, clinical
et prescription.

## Implementation Phase 4

Server Actions dans `src/modules/facility/actions.ts` (`"use server"`), meme
principe Zero Trust que `src/modules/patient/actions.ts` : l'utilisateur
courant (patient ou professionnel) est toujours derive de `getSession()`,
jamais d'un id transmis par le client. Toute lecture ou modification d'un
`RendezVous` identifie par un id transmis verifie d'abord que ce rendez-vous
appartient bien a l'utilisateur connecte, avant toute ecriture. Chaque
creation ou changement de statut est trace dans `JournalAudit`.

Fonctions exposees (voir `actions.ts` pour la signature complete) :

- `listEtablissements` : tous les etablissements sanitaires.
- `listProfessionnelsParEtablissement(etablissementId)` : professionnels
  valides (`statutValidation` = "valide") d'un etablissement donne.
- `getMesRendezVous` : rendez-vous du patient connecte, tries par date
  croissante.
- `creerRendezVousAction` : demande de rendez-vous (statut initial
  "demande"), professionnel optionnel.
- `annulerRendezVousAction` : annulation cote patient.
- `getRendezVousDuProfessionnel` : rendez-vous du professionnel connecte,
  tries par date croissante, avec le nom du patient.
- `confirmerRendezVousAction` : passage du statut a "confirme" cote
  professionnel.
- `annulerRendezVousProfessionnelAction` : annulation cote professionnel.

Cycle de vie d'un `RendezVous` : "demande" -> "confirme" -> "termine" (ce
dernier passage se fait depuis le module `clinical`, lors de la creation
d'une consultation rattachee au rendez-vous) ou "annule" a tout moment par
le patient ou le professionnel.

Hors perimetre conserve : aucun contenu clinique ici (voir module
`clinical`), aucune verification de consentement a la prise de rendez-vous
(seule la consultation qui en decoule, plus tard, en exige un).
