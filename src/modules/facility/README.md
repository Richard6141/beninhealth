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

Cycle de vie d'un `RendezVous` (huit statuts : "demande", "confirme",
"en_consultation", "termine", "annule", "absent", "refuse", "expire") : le
statut ne s'ecrit QUE par `rendez-vous-etats.ts` (RG-RDV-00), qui conditionne
chaque mise a jour au statut de depart dans la meme requete SQL. Transitions :
confirmer et refuser (avec motif) depuis "demande" ; expirer depuis "demande"
(tache planifiee, RG-RDV-20 : 24 h apres la demande ou 1 h avant le creneau) ;
annuler depuis "demande" ou "confirme" ; arrivee depuis "demande", "confirme"
ou "absent" ; "absent" depuis "confirme" (tache planifiee, RG-RDV-40) ;
"en_consultation" quand le medecin ouvre le brouillon lie (IN_CARE) ; "termine"
depuis "demande", "confirme", "absent" ou "en_consultation" (validation d'une
consultation du module `clinical`, jamais bloquee par un refus de
transition). Un rendez-vous "termine", "annule", "refuse" ou "expire" ne
change plus de statut.

Regles de prise (`regles-rendez-vous.ts` pures, `regles-reservation.ts` avec
la base) : reservable de 1 heure a 30 jours a l'avance (RG-RDV-01, 90 jours et
sans delai minimum au guichet), 3 rendez-vous futurs actifs au maximum par
personne, dossiers de personnes a charge comptes separement (RG-RDV-02), un
seul rendez-vous par jour local et par etablissement, etablissement actif
seulement. Annulation par le patient jusqu'a 2 heures avant, ensuite
invitation a appeler l'etablissement (RG-RDV-10). Deplacement (RG-RDV-11) :
deux fois au plus, le nouveau rendez-vous est cree AVANT l'annulation de
l'ancien dans la meme transaction, et repart au statut "demande". Le patient
est prevenu (notification) quand l'etablissement confirme, refuse (avec le
motif), annule, ou quand une demande expire. L'accueil (administrateur
d'etablissement) traite les demandes de tout l'etablissement, y compris sans
praticien choisi (`demandes-accueil.ts`, ecran `/app/etablissement/demandes`).
Seuls les rendez-vous confirmes sont rappeles (F-RDV-07).

Double reservation (RG-RDV-03) : un index UNIQUE PARTIEL en base sur
(professionnelId, date) pour les rendez-vous qui ne sont ni annules, ni
refuses, ni expires garantit qu'un professionnel n'a jamais deux rendez-vous
au meme instant, meme avec des demandes simultanees (la violation, code P2002,
devient le message "creneau deja reserve"). Limites assumees : un rendez-vous
sans professionnel n'est soumis a aucune contrainte ; pas de capacite
superieure a 1 ni de creneaux physiques (voir F-ETA-05) ; RG-RDV-05 (3
absences) est satisfaite par construction pour le patient (toute demande
part a "demande") ; pas de "parti sans etre vu" ni de fenetre d'arrivee
RG-RDV-33.

Hors perimetre conserve : aucun contenu clinique ici (voir module
`clinical`), aucune verification de consentement a la prise de rendez-vous
(seule la consultation qui en decoule, plus tard, en exige un).
