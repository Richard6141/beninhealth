# Module prescription

Responsabilité : gestion des ordonnances électroniques (Prescription Service).

Périmètre : Prescription (médicaments prescrits, instructions, historique
création/modification/validation/délivrance) et catalogue Medicament (nom,
principe actif, dosage, forme).

Hors périmètre : contenu clinique de la consultation d'origine (module clinical),
délivrance physique en pharmacie au-delà du statut et de l'historique de la
prescription.

Phase d'implémentation : Phase 3-4.

## Implementation Phase 5

Server Actions dans `src/modules/prescription/actions.ts` (`"use server"`),
meme principe Zero Trust que `src/modules/clinical/actions.ts` et
`src/modules/patient/actions.ts` : le patient ou le professionnel courant est
toujours derive de `getSession()`, jamais d'un id transmis par le client.

Regle metier centrale, verifiee en base avant toute ecriture, jamais
supposee : une `Prescription` est toujours rattachee a une `Consultation`
deja existante, et cette consultation doit appartenir au professionnel
connecte. `getConsultationPourPrescription` retourne `null` si ce n'est pas
le cas, et `creerPrescriptionAction` refuse d'ecrire quoi que ce soit dans le
meme cas.

Perimetre de cette phase : le medecin cree directement une prescription au
statut "validee" (il vient d'examiner le patient), il n'y a pas de flux de
validation separee. Les statuts "delivree" et "delivree_partiellement"
relevent d'un module pharmacie a construire plus tard (delivrance physique
en officine), hors perimetre ici.

Regle de validation metier (interactions medicamenteuses simplifiees) : dans
une meme prescription, deux lignes ne peuvent pas partager le meme
`principeActif` (apres jointure avec `Medicament`). `creerPrescriptionAction`
refuse la creation avec un message explicite si c'est le cas, sans rien
ecrire en base. Cette regle est une simplification pedagogique du MVP, pas un
moteur d'interactions medicamenteuses reel.

Fonctions exposees (voir `actions.ts` pour la signature complete) :

- `listMedicaments` : catalogue complet, trie par nom.
- `getMesPrescriptions` : historique du patient connecte, du plus recent au
  plus ancien, avec le nom du medecin prescripteur.
- `getConsultationPourPrescription` : verifie la propriete de la consultation
  par le professionnel connecte et indique si une prescription existe deja
  pour cette consultation (evite les doublons par erreur).
- `creerPrescriptionAction` : cree la `Prescription` (statut "validee") et
  ses `LignePrescription` dans une transaction, apres validation zod (au
  moins une ligne, posologie non vide, quantite et duree de traitement
  entieres strictement positives, medicament existant au catalogue) et
  application de la regle d'interaction simplifiee ci-dessus.
- `getPrescriptionsDuProfessionnel` : prescriptions creees par le
  professionnel connecte, du plus recent au plus ancien, avec le nom et
  l'identifiant sante du patient.

Chaque creation de prescription est tracee a la fois dans
`EvenementPrescription` (type "creation", historique metier du cycle de vie
propre a la prescription) et dans `JournalAudit` (trace transverse
obligatoire de toute action sensible).

## Preparation interoperabilite HL7 FHIR

Documentation de preparation uniquement : aucune exposition FHIR reelle
n'existe dans cette phase. Si une API FHIR etait ajoutee plus tard, une
`Prescription` accompagnee de ses `LignePrescription` se projetterait sur une
ressource `MedicationRequest` par ligne (une ligne de prescription porte une
posologie et une quantite propres, ce qui correspond mieux a une ressource
`MedicationRequest` par medicament qu'a une seule ressource pour toute la
prescription) :

- `subject` : reference vers le `Patient` FHIR correspondant a
  `Prescription.patientId`.
- `requester` : reference vers le `Practitioner` FHIR correspondant a
  `Prescription.medecinPrescripteurId`.
- `medicationReference` (ou `medicationCodeableConcept`) : reference vers un
  `Medication` FHIR correspondant a `LignePrescription.medicamentId` (nom,
  principe actif, dosage, forme du `Medicament` du catalogue).
- `dosageInstruction` : tableau construit a partir de
  `LignePrescription.posologie`, `quantite` et `dureeTraitementJours` (texte
  libre en `dosageInstruction.text` dans un premier temps, structuration en
  `timing`/`doseAndRate` dans un second temps si besoin).
- `status` : derive de `Prescription.statut` ("validee" vers `active`,
  "delivree" vers `completed`, "annulee" vers `stopped`, etc., a affiner
  quand le module pharmacie existera).
- `authoredOn` : `Prescription.date`.
- `basedOn` ou une extension : reference vers l'`Encounter` FHIR correspondant
  a `Prescription.consultationId`.
- L'historique `EvenementPrescription` se rapprocherait d'un
  `Provenance` FHIR lie a chaque `MedicationRequest`, plutot que d'un champ de
  la ressource elle-meme.
