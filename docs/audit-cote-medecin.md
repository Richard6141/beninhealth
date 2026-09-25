# Audit du rôle médecin face au pack Claude Code

Même méthode que `docs/audit-cote-patient.md`. Périmètre couvert en profondeur :
dashboard, sélection patient, création de consultation, création de
prescription, et désormais F-CLI-09 à F-CLI-14 (troisième passe, voir plus bas).

Ce rapport a été mis à jour après une seconde passe explicitement demandée
par l'utilisateur ("les fonctionnalités qui manquent, on doit les ajouter"),
qui a traité les quatre plus gros écarts identifiés dans la première passe,
puis une troisième passe qui a recroisé F-CLI-09 à F-CLI-14 avec le code
(jusque-là marquées « à vérifier », jamais lues ligne à ligne).

## Statut par fiche

| Fiche | Statut | Commentaire |
|---|---|---|
| F-CLI-01 Dashboard médecin | Fait | Patients du jour, rendez-vous à venir, vue d'ensemble chiffrée (consultations de la semaine, prescriptions actives, résultats à annoncer), raccourcis vers les 3 workflows cliniques. |
| F-CLI-02 Recherche patient | **Fait** (périmètre réduit) | Page `/app/medecin/patients` : tableau (avatar, identifiant santé, âge/sexe, allergies) avec recherche en direct par nom/identifiant. Reste un périmètre réduit par rapport à la fiche : uniquement parmi les patients ayant déjà accordé un consentement au médecin, pas de recherche nominative à l'échelle de la plateforme (cohérent avec le modèle de consentement de ce dépôt, pas un oubli). |
| F-CLI-03 Création de patient (par un professionnel) | **Fait** | `creerPatientParProfessionnelAction` (`src/modules/identity/actions.ts`) : crée un `User` placeholder « sans compte » + `Patient`, détection de doublon obligatoire (nom + prénom + date de naissance normalisés) avec forçage possible via justification ≥ 10 caractères tracée (RG-CLI-20/21), consentement 12 mois auto-accordé au médecin créateur (jamais permanent). Accessible via un modal « Ajouter un patient » depuis la liste patients, le sélecteur de consultation et l'écran de demande d'examen. |
| F-CLI-04 Bandeau patient (résumé, allergies en évidence) | **Fait** | `getResumePatient` + `/app/medecin/patients/[id]` : allergies en alerte bloquante, maladies chroniques, antécédents, contacts d'urgence, traitements en cours, 5 derniers événements, avatar et coordonnées. Vérification Zero Trust du consentement à chaque accès (RG-CLI-30), lecture journalisée dans `JournalAudit`. |
| F-CLI-05 Consultation en brouillon (DRAFT) | **Fait** | `enregistrerConsultationAction` crée un vrai brouillon (`statut: "brouillon"`), modifiable librement. RG-CLI-40 (un seul brouillon ouvert par patient et par médecin) implémenté : `getBrouillonExistant` le rouvre automatiquement plutôt que d'en laisser créer un second. RG-CLI-41 (invisible du patient et des autres soignants) implémenté par filtre explicite dans les requêtes. Non fait : sauvegarde automatique toutes les 10 secondes, conservation hors ligne chiffrée, abandon automatique à 7 jours (voir "Limites assumées"). |
| F-CLI-06 Constantes vitales structurées avec plages d'alerte | **Fait** | 9 champs numériques dédiés (température, pouls, tension systolique/diastolique, fréquence respiratoire, saturation, poids, taille, glycémie) + IMC calculé. Contrôles complets dans `src/modules/clinical/controles-constantes.ts` : plage acceptée = refus définitif, plage d'alerte = confirmation exigée, plages du pouls/fréquence respiratoire/tension dépendantes de l'âge (pédiatrique vs adulte, section 18.7 du pack). |
| F-CLI-07 Validation / signature de la consultation | **Fait** | Bouton "Valider la consultation" distinct de "Enregistrer le brouillon", exige motif + conclusion (CA-1, tient lieu de diagnostic principal faute de codage CIM-10). Calcule une empreinte SHA-256 du contenu canonique et horodate `dateValidation` séparément de la date de démarrage (RG-CLI-61). Une fois validée, verrouillée (plus aucune route d'édition). |
| F-CLI-08 Addendum / correction après validation | **Fait** | Addendum (texte + motif, daté et signé, visible sous la consultation) et retrait pour saisie par erreur (motif obligatoire + ré-authentification par mot de passe, RG-AUTH-53) tous deux implémentés, fenêtre de 12 mois après validation (RG-CLI-70) basée sur `dateValidation`. Consultation retirée : reste visible barrée pour le médecin et le patient (RG-CIT-22), exclue des statistiques via le flag `saisieParErreur`. |
| F-CLI-09 Consulter l'historique complet (P0) | **Fait** | `getHistoriquePatient` + `/app/medecin/patients/[id]/historique` : chronologie fusionnée (consultations, prescriptions, examens, visites communautaires), filtres type/période/établissement, pagination à 25 éléments, panneau latéral de détail (`Modal variant="drawer-right"`). RG-CLI-80 : une entrée `JournalAudit` par affichage de page, une entrée distincte par ouverture de détail (`journaliserOuvertureDetailHistoriqueAction`). Non fait : vaccinations et documents comme événements de la chronologie (F-CLI-11/13 ont leur propre section sur la fiche patient plutôt qu'intégrés ici, voir leurs lignes). |
| F-CLI-10 Accès d'urgence / bris de glace (P1) | **Fait** (périmètre réduit, honnête) | `src/modules/urgence/actions.ts` + `/app/medecin/urgence` : identification par identifiant santé, motif, justification (20 à 500 caractères), **vraie** ré-authentification TOTP (réutilise la MFA existante, refuse si elle n'est pas activée sur le compte plutôt que de simuler le contrôle). Ouvre un `Consentement` `typeAcces: "urgence"` de 4h (RG-CLI-93 : refus si un accès urgence est déjà actif, refus aussi si un accès normal valide existe déjà, l'urgence n'étant faite que pour l'absence de consentement). RG-CLI-90 (5 accès/24h) vérifié et testé. RG-CLI-91 (exclusion des données sensibles) appliqué dans `getHistoriquePatient` (examens `sensible` exclus entièrement) ; bandeau rouge avec expiration sur la fiche patient (CA-2/CA-3, expiration réutilise le mécanisme déjà existant de `dateFin`). L'accès apparaît en rouge en tête, avec justification, sur `/app/patient/acces` (F-CIT-12). Non fait, documenté : notification patient/établissement en interne (`Notification`) plutôt que SMS réel (aucune passerelle SMS dans ce dépôt) ; pas de rôle "auditeur" ni d'écran de revue sous 7 jours (F-AUD-02 non construit), mais chaque accès reste tracé intégralement dans `JournalAudit` pour une revue future, comme le signalement F-CIT-12. |
| F-CLI-11 Enregistrer une vaccination (P1) | **Fait** | Nouveau modèle `Vaccination` (patientId, professionnelId, etablissementId, vaccin, numeroDose, dateAdministration, numeroLot, siteInjection, voie). `src/modules/vaccination/actions.ts` + `/app/medecin/vaccinations/nouvelle` : référentiel simple (BCG, Polio, Pentavalent, Rougeole, Fièvre jaune, VAT, COVID-19, Autre), date jamais dans le futur, avertissement (case à cocher) si même vaccin + même dose déjà enregistrée pour ce patient. RG-CLI-100 (immuable) : retrait motivé plutôt que modification/suppression. Historique affiché sur la fiche patient. Non fait : contrôle d'âge/intervalle minimal par rapport au calendrier PEV (référentiel de calendrier absent de ce dépôt, comme le référentiel allergies déjà noté ailleurs). |
| F-CLI-12 Prise en charge infirmière (constantes + note de soins) (P1) | **Fait** | Nouveau modèle `PriseEnChargeInfirmiere` (ne crée jamais de `Consultation`, l'infirmier n'a pas cette permission). `src/modules/soins/actions.ts` + `/app/medecin/soins` : liste des patients arrivés (rendez-vous confirmé du jour) sans constantes prises, saisie des constantes (mêmes contrôles que F-CLI-06), priorité de tri (urgent/prioritaire/standard), note de soins obligatoire. Le médecin retrouve automatiquement la prise en charge non consommée à l'ouverture d'une nouvelle consultation (`getPriseEnChargeNonRecuperee`, bandeau d'information, constantes pré-remplies), marquée « récupérée » une fois le brouillon créé. |
| F-CLI-13 Ajouter un document médical (P1) | **Fait** (médecin uniquement) | Nouveau modèle `DocumentMedical`. `src/modules/document/actions.ts` + `/app/medecin/documents/nouveau` + `src/app/api/documents/[id]/route.ts` (téléchargement authentifié, Zero Trust revérifié à chaque téléchargement, jamais d'URL publique statique). RG-CLI-110 : type vérifié par signature binaire réelle (PDF/JPEG/PNG), 10 Mo max, testé avec un faux `.pdf` réellement rejeté. RG-CLI-112 : stockage hors de `public/` (`private-uploads/documents/`), nom de fichier aléatoire. RG-CLI-113 : jamais supprimé, seulement retiré « ajouté par erreur ». Non fait, documenté : suppression des métadonnées EXIF (aucune librairie de traitement d'image dans ce dépôt, décision de dépendance à prendre), téléversement par l'infirmier/le laboratoire (RBAC actuel = médecin uniquement), téléchargement direct par le patient de ses propres documents. |
| F-CLI-14 Référence vers un autre établissement (P2) | Non applicable | Le pack lui-même indique « non développé dans le MVP ». Rien à signaler. |
| F-PRE-01 Création de prescription liée à une consultation | Fait | Inchangé. |
| F-PRE-02 Contrôles de sécurité (allergie, doublon, etc.) | **Fait** | Allergie ↔ médicament (DCI + classe thérapeutique) : bloquant, forçage avec justification ≥ 20 caractères tracé. Doublon et même-classe étendus aux ordonnances actives du patient (pas seulement la prescription en cours), niveau avertissement avec confirmation simple (`src/modules/prescription/controles-doublons.ts`). Non fait : contrôles âge/grossesse/durée (nécessitent des champs de référentiel médicament qui n'existent pas encore). |
| F-PRE-03 Posologie structurée | Non fait | Toujours un champ texte libre. |
| F-PRE-04 / F-PRE-06 Numérotation RX-XXXX-XXXX, empreinte SHA-256, signature 2FA | Partiel | Numéro `RX-<année>-<séquence>` et empreinte SHA-256 générés à la création (`src/modules/prescription/actions.ts`). Non fait : ré-authentification à deux facteurs (voir "Limites assumées" : nécessiterait de rendre la MFA obligatoire pour tous les médecins, hors périmètre de ce correctif). |

## Corrections apportées

1. **Fuite potentielle des notes internes vers le patient** : `observations`
   toujours vidé côté patient (défense en profondeur, RG-CLI-54).
2. **Contrôle allergie ↔ médicament** : bloquant, DCI + classe thérapeutique,
   forçage justifié tracé (F-PRE-02 / RG-PRE-10).
3. **Contrôle doublon / même classe étendu aux traitements actifs du patient**
   : avertissement avec confirmation simple, plus seulement intra-ordonnance.
4. **Addendum et retrait de consultation** (F-CLI-08), voir ci-dessus.
5. **Constantes vitales structurées** (F-CLI-06), voir ci-dessus.
6. **Cycle brouillon → validation** (F-CLI-05/07), voir ci-dessus.
7. **Numérotation et empreinte des prescriptions** (F-PRE-04), voir ci-dessus.

Chaque correctif a été vérifié à l'écran (Playwright, comptes de démo) avant
d'être considéré terminé : allergie bloquante, doublon avec avertissement,
brouillon repris automatiquement (RG-CLI-40), validation verrouillant la
consultation, addendum affiché sous la consultation, retrait avec mauvais
mot de passe rejeté puis mot de passe correct accepté (barré + badge "Retirée"
côté médecin et côté patient).

## Limites assumées (documentées dans le code, pas oubliées)

- **Pas d'autosauvegarde ni de mode hors ligne pour les brouillons**
  (RG-CLI-42) : le médecin doit cliquer "Enregistrer le brouillon"
  explicitement. Construire l'autosauvegarde toutes les 10 secondes avec
  repli local chiffré est une fonctionnalité d'infrastructure à part entière
  (comparable au mode hors ligne de l'agent communautaire, déjà écarté pour
  la même raison dans `docs/audit-cote-agent-communautaire.md`), pas un
  correctif ponctuel.
- **Pas d'abandon automatique des brouillons après 7 jours** (RG-CLI-43) :
  nécessiterait une tâche planifiée, absente de ce dépôt.
- **Pas de ré-authentification à deux facteurs pour signer une prescription**
  (F-PRE-04) : la MFA existe (Phase 7) mais n'est pas obligatoire pour tous
  les comptes médecin ; l'imposer uniquement pour cette action aurait été une
  fonctionnalité de sécurité à moitié construite plutôt qu'une vraie
  protection.
- **Référentiel allergie/doublon écrit à la main** (mots-clés), faute du
  fichier `seed/allergy-classes.csv` que le pack décrit comme fourni. À faire
  valider par une autorité sanitaire avant tout usage réel.

## Reste à faire, par ordre de valeur

1. **Contrôles âge/grossesse/durée** (F-PRE-02) : nécessitent des champs de
   référentiel médicament qui n'existent pas (âge minimum, contre-indication
   grossesse) et une notion de grossesse en cours côté patient.
2. **Posologie structurée** (F-PRE-03) : dose/unité/voie/fréquence séparées
   plutôt qu'un champ texte libre.
3. **Calendrier vaccinal** (F-CLI-11) : contrôle d'âge/intervalle minimal par
   rapport au calendrier PEV, référentiel absent de ce dépôt.
4. **Suppression des métadonnées EXIF** (F-CLI-13, RG-CLI-110) : nécessite une
   librairie de traitement d'image (aucune dans ce dépôt), décision de
   dépendance à prendre avec l'utilisateur.
5. **Écran de revue des accès d'urgence sous 7 jours** (F-CLI-10, RG-CLI-92,
   F-AUD-02) : aucun rôle "auditeur" ni écran d'audit dans ce dépôt ; chaque
   accès reste tracé dans `JournalAudit` en attendant.
6. **Autosauvegarde/mode hors ligne des brouillons**, **abandon à 7 jours**,
   **signature 2FA des prescriptions**, **notification SMS réelle** : chantiers
   d'infrastructure transverses, chacun documenté comme limite assumée à
   l'endroit concerné plutôt que construit à moitié.

## Recommandation

Les quatre écarts les plus significatifs de la première passe (brouillon,
constantes structurées, validation verrouillée, addendum/retrait), les trois
écarts de la deuxième passe (recherche/création/bandeau patient, F-CLI-02/03/04)
et les cinq écarts de la troisième passe (F-CLI-09 historique complet,
F-CLI-10 bris de glace, F-CLI-11 vaccination, F-CLI-12 prise en charge
infirmière, F-CLI-13 document médical) sont désormais tous traités et
vérifiés à l'écran. Le rôle médecin n'a plus de trou P0 ouvert. Ce qui reste
(F-PRE-02/03, calendrier vaccinal, EXIF, écran auditeur, autosauvegarde/2FA)
est soit une fonctionnalité additionnelle, soit un chantier d'infrastructure
transverse clairement signalé, jamais un correctif ponctuel oublié.
