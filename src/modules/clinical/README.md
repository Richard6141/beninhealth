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
`enregistrerConsultationAction` retourne une erreur explicite sans ecrire
quoi que ce soit.

Cycle de vie de la consultation (F-CLI-05/06/07/08 du pack) : `statut`
brouillon -> terminee (validee), jamais l'inverse. Un brouillon (RG-CLI-40 :
un seul par patient et par medecin, repris plutot que duplique) n'est visible
que par son auteur (RG-CLI-41, exclu de `getMesConsultations` et
`getConsultationsDeLEtablissement`). Une fois "terminee", le contenu est
verrouille (empreinte SHA-256, `dateValidation`) ; seul un addendum
(`ajouterAddendumConsultationAction`) ou un retrait pour saisie par erreur
(`retirerConsultationAction`, re-authentification par mot de passe, fenetre
de 12 mois) peuvent encore s'y ajouter.

Fonctions exposees (voir `actions.ts` pour la signature complete) :

- `getMesConsultations` : historique du patient connecte, du plus recent au
  plus ancien (brouillons toujours exclus).
- `getPatientsAvecConsentement` : patients ayant accorde un consentement
  actif au professionnel connecte (peuple le selecteur de patient a l'ecran
  de creation de consultation).
- `getBrouillonExistant` : brouillon deja ouvert par le medecin connecte pour
  un patient donne (RG-CLI-40), pour le rouvrir a l'ecran plutot que d'en
  laisser commencer un second.
- `getConsultationsDuProfessionnel` : consultations (brouillons inclus) du
  professionnel connecte, du plus recent au plus ancien.
- `getConsultationsDeLEtablissement` : consultations validees de tout
  l'etablissement du professionnel connecte, tous medecins confondus
  (brouillons exclus, RG-CLI-41).
- `enregistrerConsultationAction` : cree ou met a jour un brouillon, et le
  valide dans la meme operation si l'intent transmis est "valider" (exige
  alors motif et conclusion non vides) ; si un `rendezVousId` est fourni, le
  passe a "termine" a la validation, pas a l'enregistrement du brouillon.
- `ajouterAddendumConsultationAction` / `retirerConsultationAction` : F-CLI-08.

Chaque creation de consultation, ajout d'addendum et retrait est trace dans
`JournalAudit`.

Hors perimetre conserve : prescriptions et medicaments (module
`prescription`), identite du patient ou du professionnel (modules `identity`
et `patient`), etablissements et rendez-vous (module `facility`).
