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

Cycle de vie d'un `RendezVous` (cinq statuts : "demande", "confirme",
"termine", "annule", "absent") : le statut ne s'ecrit QUE par
`rendez-vous-etats.ts` (RG-RDV-00), qui conditionne chaque mise a jour au
statut de depart dans la meme requete SQL. Transitions autorisees : confirmer
depuis "demande" ; annuler depuis "demande" ou "confirme" ; arrivee depuis
"demande", "confirme" ou "absent" (correction d'une absence marquee a tort) ;
"absent" depuis "confirme" (tache planifiee, RG-RDV-40) ; "termine" depuis
"demande", "confirme" ou "absent" (validation d'une consultation du module
`clinical`, qui n'est jamais bloquee par un refus de transition). Un
rendez-vous "termine" ou "annule" ne change plus de statut.

Double reservation (RG-RDV-03) : un index UNIQUE PARTIEL en base sur
(professionnelId, date) pour les rendez-vous non annules garantit qu'un
professionnel n'a jamais deux rendez-vous au meme instant, meme avec des
demandes simultanees (la violation, code P2002, devient le message "creneau
deja reserve"). Limite assumee : un rendez-vous sans professionnel n'est
soumis a aucune contrainte ; pas de capacite superieure a 1 ni de creneaux
physiques (voir F-ETA-05).

Hors perimetre conserve : aucun contenu clinique ici (voir module
`clinical`), aucune verification de consentement a la prise de rendez-vous
(seule la consultation qui en decoule, plus tard, en exige un).
