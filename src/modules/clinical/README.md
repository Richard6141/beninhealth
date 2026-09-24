# Module clinical

Responsabilité : gestion des consultations et du contenu clinique (Clinical Service).

Périmètre : Consultation (motif, symptômes, observations, conclusion, statut),
ExamenMedical (demande, résultat) et DocumentMedical (stockage, niveau de
confidentialité) rattachés à un épisode de soins.

Hors périmètre : prescriptions et médicaments (module prescription), identité du
patient ou du professionnel (modules identity et patient), établissements
(module facility).

Phase d'implémentation : Phase 3-4.

## Implementation Phase 4

Server Actions dans `src/modules/clinical/actions.ts` (`"use server"`), meme
principe Zero Trust que `src/modules/patient/actions.ts` : l'utilisateur
courant (patient ou professionnel) est toujours derive de `getSession()`,
jamais d'un id transmis par le client.

Regle metier centrale, verifiee en base avant toute ecriture, jamais
supposee : un professionnel ne peut creer une `Consultation` pour un patient
que si ce patient lui a accorde un `Consentement` actif (`typeAcces`
"dossier_complet" ou "consultations"). En l'absence de ce consentement,
`creerConsultationAction` retourne une erreur explicite sans ecrire quoi que
ce soit.

Fonctions exposees (voir `actions.ts` pour la signature complete) :

- `getMesConsultations` : historique du patient connecte, du plus recent au
  plus ancien.
- `getPatientsAvecConsentement` : patients ayant accorde un consentement
  actif au professionnel connecte (peuple le selecteur de patient a l'ecran
  de creation de consultation).
- `getConsultationsDuProfessionnel` : consultations creees par le
  professionnel connecte, du plus recent au plus ancien.
- `creerConsultationAction` : cree une consultation (statut "terminee") apres
  verification du consentement ; si un `rendezVousId` est fourni, vérifie
  qu'il appartient bien au meme couple patient/professionnel puis passe son
  statut a "termine" dans la meme transaction.

Chaque creation de consultation est tracee dans `JournalAudit`.

Hors perimetre conserve : prescriptions et medicaments (module
`prescription`), identite du patient ou du professionnel (modules `identity`
et `patient`), etablissements et rendez-vous (module `facility`).
