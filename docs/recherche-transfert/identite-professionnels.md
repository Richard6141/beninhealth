# Identité unique d'un professionnel de santé qui exerce dans plusieurs établissements

Recherche du 2026-09-26. Ne pas committer ni pousser (demande explicite du demandeur).

Méthode : lecture du dépôt (schéma Prisma, code, pack `docs/pack claude/specs/`) et requêtes web génériques (aucun contenu du projet transmis). Les pages web ont été lues avec un outil de récupération qui résume la page : les citations sont celles rapportées par l'outil. Deux PDF scannés (loi 97-020, rapport RHIE du Rwanda) n'ont pas pu être lus. Légende, identique à `realite-benin.md` : **V** = vérifié (source citée), **NV** = non vérifié. Les sources "presse" sont secondaires.

## 0. Réponses courtes

**Comment sait-on qu'un médecin ou un spécialiste est unique dans la base ?** Aujourd'hui, on ne le sait pas. `ProfessionnelSante` est lié à un seul utilisateur (`userId` unique) et à un seul établissement, et la seule barrière anti-doublon est l'unicité de l'e-mail. Le numéro `BJ-SANTE-MED-0001` est un compteur de la plateforme, pas une identité nationale. Un spécialiste que deux administrateurs d'établissement créent chacun avec une adresse différente obtient deux comptes, deux identifiants et deux historiques. Recommandation : séparer trois niveaux, la **personne** (une seule ligne par personne physique), son **identité professionnelle** (profession + numéro d'inscription à l'Ordre, unique par profession, règle déjà écrite dans le pack : RG-AUTH-42) et ses **affiliations** (une ligne par établissement, avec statut et dates, RG-ROL-02). Le NPI peut servir de contrôle croisé, mais seulement de façon optionnelle (voir risque 7 : autorisation préalable de l'APDP).

**Est-ce l'Ordre qui enregistre les gens pendant que les établissements ne font que les rechercher ?** Pour l'existence légale du professionnel, oui : l'inscription au tableau se fait auprès de l'Ordre (V, ONMB et ONPB), et le ministère exige l'attestation d'inscription pour l'autorisation d'exercice privé (V, sanipriva). Pour la plateforme, c'est le bon principe, avec une nuance : aucun Ordre ne semble exposer d'interface interrogeable (NV), et le tableau public de l'ONMB ne montre que deux colonnes (V). Le MVP ne peut donc pas "rechercher chez l'Ordre" automatiquement : un validateur du ministère contrôle le dossier une fois (comme le prévoit le pack, F-ADM-03, procédure manuelle), puis les établissements **cherchent dans le registre des professionnels de la plateforme et demandent un rattachement**, sans jamais recréer la personne.

## 1. État actuel du dépôt (V, code lu)

- `ProfessionnelSante` (`prisma/schema.prisma`) : `userId` **unique** (une personne, un profil), `numeroProfessionnel` **unique** (format `BJ-SANTE-<CODE>-<séquence>`, calculé par un simple comptage dans `src/modules/identity/identifiants.ts`), `etablissementId` **obligatoire et unique par profil**, `specialite` en texte libre, `statutValidation` (défaut `en_attente`). Aucun champ profession, numéro d'ordre ni NPI.
- Provisionnement (`src/modules/identity/gestion-comptes.ts`) : le ministère crée l'établissement et son administrateur, qui crée ensuite le personnel avec un mot de passe temporaire. Ni invitation, ni auto-inscription, ni recherche préalable d'une personne existante.
- `UserRole` permet plusieurs rôles par utilisateur, mais aucun flux n'en crée plus d'un.
- Pas d'"espace actif" : `SessionPayload` = `{ userId, roles, sessionId }` (`src/lib/session.ts`). Le seul endroit où le mot apparaît dans le code est un commentaire de `src/modules/partage/actions.ts`.
- Modèles qui **portent déjà l'établissement de l'acte** : `RendezVous`, `Consultation`, `Delivrance`, `Vaccination`, `SuiviCommunautaire`, `PersonneCommunautaire`, `PriseEnChargeInfirmiere`. Modèles qui **le déduisent du professionnel** : `Prescription`, `ExamenMedical`, `ReferencePatient`, `CodePartageDossier`, `CreneauDisponibilite`. (Contrôle par un script `awk` sur le schéma : présence de la chaîne `etablissementId` dans le bloc du modèle, commentaires compris, donc à revérifier modèle par modèle avant d'agir.)

## 2. Ce que le pack prévoit déjà (V, pack lu)

- RG-ROL-01 : un compte = une personne physique. RG-ROL-02 : les rôles viennent d'**affiliations** (rôle + établissement, date de début, date de fin facultative, statut `INVITED`, `ACTIVE`, `SUSPENDED`, `ENDED`). RG-ROL-03 : plusieurs affiliations imposent le choix d'un **espace actif**. RG-ROL-05 : un rôle clinique exige un profil professionnel validé par un administrateur de la plateforme avant la première affiliation active. RG-ROL-08 : affiliation terminée ou suspendue, sessions de cet espace invalidées à la requête suivante.
- F-AUTH-05 (`07-fiches-comptes.md`) : le professionnel saisit sa profession, sa spécialité et son **numéro d'inscription à l'Ordre**, téléverse sa carte professionnelle ; profil `PENDING_VALIDATION`. **RG-AUTH-42 : le numéro d'inscription est unique par profession.** Si un compte existe déjà avec ce téléphone ou cet e-mail, l'invitation **ajoute une affiliation au compte existant**.
- F-ADM-03 (`15-fiches-administration-audit.md`) : l'administrateur vérifie le numéro "auprès de l'ordre professionnel concerné (procédure manuelle hors plateforme dans le MVP ; P2 : interrogation d'un registre officiel si disponible)". Délai cible de 72 heures ouvrées (RG-ADM-10).
- F-AUTH-07 : l'espace actif est lu **dans la session côté serveur** (RG-AUTH-60). CA-1 : un médecin affilié à deux établissements ne voit que les patients de l'établissement actif. CA-2 : modifier à la main un identifiant d'établissement dans une requête est sans effet (403).
- Façade FHIR (`22-api-interoperabilite.md`) : `Practitioner` = utilisateurs + profils professionnels, `identifier` = numéro d'inscription.

Le pack décrit donc déjà la cible. Le dépôt en est à l'étape "un profil, un établissement". Le sujet est un chemin de migration, pas une conception nouvelle.

## 3. Référentiels externes

| Fait | Statut | Source |
|---|---|---|
| OpenHIE : le Health Worker Registry "serves as the central authority for maintaining the unique identities of health workers within a country" ; jeu de données minimal de "all health workers working in both the public and private sectors" ; fusion de sources dans un registre faisant autorité ; API standard "based on CSD or mCSD" (HWRF-5) | V | guides.ohie.org/arch-spec/openhie-component-specifications-1/openhie-health-worker-registry-hwr |
| Même page : résolution d'identité et doublons, représentation d'un professionnel dans plusieurs établissements, rôle des ordres professionnels | NV (absents de cette page) | idem |
| FHIR R4 `PractitionerRole` : "the location and types of services that Practitioners are able to provide for an organization" ; éléments `practitioner`, `organization`, `period`, `code`, `specialty`, `location`, `availableTime`, `notAvailable` ; "Practitioner performs different roles within the same or even different organizations" | V | hl7.org/fhir/R4/practitionerrole.html |
| FHIR R4 `Practitioner` : "A person who is directly or indirectly involved in the provisioning of healthcare" ; les qualifications sont "acquired by the practitioner independent of any organization or role" ; la page ne décrit pas comment relier une même personne entre systèmes | V | hl7.org/fhir/R4/practitioner.html |
| Kenya : un Health Worker Registry exploité par la Digital Health Agency ("Verify and search qualified healthcare professionals by specialty") ; "Connected regulatory institutions" non nommées | V | hwr.dha.go.ke |
| Kenya : nom "Master Health Worker Registry", identifiant PUID (format `PUID-0001234`), repli sur l'API du régulateur en amont | NV (résumés de recherche seulement ; la page `afyalink.dha.go.ke/practitioner-search-api-docs` était injoignable, erreur DNS) | |
| Kenya : le KMPDC tient des registres distincts pour les praticiens et pour les établissements (catégories Private, Public, Faith Based) ; lien praticien vers lieux de travail non affiché | V pour la séparation, NV pour le lien | registers.kmpdc.go.ke |
| Rwanda : registre des établissements avec identification unique ; registre clients relié à la base démographique NIDA | V | ohie.org/impact-stories/creating-a-health-information-exchange-system-in-rwanda/ |
| Rwanda : registre des professionnels (Provider Registry, iHRIS, intégration avec les conseils professionnels), identifiant des professionnels | NV (résumés de recherche ; la page OpenHIE ne mentionne aucun registre de professionnels ; PDF du rapport RHIE illisible par l'outil) | |

Enseignement retenu, sans dépendre des points NV : dans tous les modèles lus, la **personne** et le **lieu** sont deux registres distincts, et le lien entre les deux (rôle, période, spécialité, disponibilités) est porté par une troisième entité (`PractitionerRole` en FHIR). C'est exactement la structure "personne / affiliation" recommandée plus bas.

## 4. Cas du Bénin

| Fait | Statut | Source |
|---|---|---|
| Espace membre de l'ONMB : le formulaire demande le "N° d'inscription", le "Lieu d'exercice principal" et "Autres lieux d'exercice" (saisie libre, séparés par des virgules) ; un matricule active l'espace. L'Ordre gère donc déjà lui-même le multi-sites, en texte libre | V | monespace.ordremedecinsbenin.bj/inscription |
| Le diplôme et l'inscription à l'ONMB ne suffisent pas pour exercer en établissement privé : "Il s'agit du document qui vous autorise à exercer dans un établissement sanitaire privé" (autorisation du ministre de la Santé, après vérification de conformité du dossier par l'ONMB) | V | ordremedecinsbenin.bj |
| Tableau public de l'ONMB : deux colonnes, "N°" et "Nom & Prénom", liste alphabétique d'au moins 3176 lignes ; ni spécialité ni lieu d'exercice. Le "N°" peut n'être qu'un numéro de ligne : **ne pas le confondre avec le numéro d'ordre**. Mention "à jour au 31 mars 2026" vue seulement dans le titre d'un résultat de recherche | V pour le contenu, NV pour la date | ordremedecinsbenin.bj/medecins/liste_medecins |
| Plateforme d'autorisation en santé (ministère de la Santé) : deux catégories, professionnels médicaux et paramédicaux en exercice privé, et établissements privés. Dossier individuel : demande au ministre, acte de naissance, certificat de nationalité, casier judiciaire de moins de 3 mois, diplôme certifié, "attestation d'inscription à l'Ordre concerné", quittance | V | sanipriva.gouv.bj/public/index.php/pieces |
| "Les professionnels de santé autorisés à exercer en clientèle privée ... sont répertoriés dans un fichier national rendu disponible par la Direction Nationale de la Santé Publique (DNSP)" : un **fichier national de professionnels autorisés existe déjà côté ministère** | V | sanipriva.gouv.bj/public/index.php/autorisation |
| ONPB (pharmaciens) : inscription au tableau sur demande manuscrite, pièce d'identité légalisée, casier judiciaire, certificat de nationalité, copie légalisée du diplôme, équivalence et certificat d'authenticité pour un diplôme étranger, aptitude médicale, 2 photos, formulaire, 50 000 F CFA. La page ne dit ni comment le numéro est attribué ni qui vérifie le diplôme | V | onpb.bj/inscription-a-lordre/ |
| Diplômes étrangers : "commission nationale d'étude des équivalences de diplôme", décret du 18 octobre 2023 ; dispositif spécial d'évaluation pour les diplômés d'établissements non éligibles ; **les spécialités ne sont pas explicitement couvertes** dans l'article | V (presse, texte du décret non lu) | lebeninoislibere.bj/benin-regles-claires-equivalence-diplomes-de-sante/ |
| Qui vérifie et reconnaît une **spécialité** | NV | |
| NPI : "Ce numéro unique national est un code unique généré au moyen d'un algorithme de reconnaissance qui permet d'identifier formellement le citoyen" ; "suit le citoyen de façon permanente jusqu'à sa mort" ; loi 2017-08 du 19 juin 2017. Format à 13 chiffres, API ANIP pour tiers confirmée seulement pour le secteur financier, autorisation préalable de l'APDP pour tout traitement d'un numéro national d'identification (art. 407) : voir `realite-benin.md` | V pour la page ANIP ; le reste est repris de `realite-benin.md`, non relu par moi | anip.bj/certificat-didentification-personnelle/ |
| Loi 2025-01 sur l'exercice privé : adoptée le 16 janvier 2025 selon un article du 17 janvier 2025. Un autre article donne "24 juin 2026", incohérent | numéro V (presse), date NV | lamarinabj.com/index.php/2025/01/17/sante-au-benin-une-loi-cle-pour-lexercice-prive-des-professions-medicales/ |
| Contenu de cette loi : art. 6 "L'inscription au tableau d'un Ordre professionnel ... confère d'office au professionnel ... le droit d'exercer sa profession en clientèle privée ou non" ; art. 7 autorisation pour les professions sans Ordre | NV (presse uniquement, texte officiel `sgg.gouv.bj` scanné et illisible) | lameteo.info |
| **Contradiction non résolue** : le site de l'ONMB dit qu'une autorisation ministérielle distincte est requise, la presse sur la loi 2025-01 dit que l'inscription suffit d'office. Site non mis à jour, dispositions transitoires ou lecture erronée : on ne sait pas | NV | à trancher sur le texte de la loi ou auprès de la DNSP |
| Existence et cadre légal des Ordres des pharmaciens, chirurgiens-dentistes, sages-femmes (ordonnance 73-38 du 21 avril 1973) et des infirmiers | NV (résumés de recherche, loi 97-020 illisible) | |
| Règle de déontologie sur l'exercice dans plusieurs lieux (cabinet secondaire, cumul) et avis de l'Ordre sur les contrats (délai de 2 mois) | NV : la seule source trouvée (`ordremedecinsbenin.org`) **redirige aujourd'hui vers un site commercial de vente de médicaments** sans rapport, écartée volontairement | |
| Un "arrêté 2024-103/PR/MS" sur l'exercice privé des médecins affectés au ministère | Écarté : la page trouvée est sur `journalofficiel.dj`, probablement Djibouti, à ne pas attribuer au Bénin | |

## 5. Modèle recommandé

### 5.1 Trois niveaux d'identifiants

1. **Identifiant plateforme** (existant, inchangé) : `ProfessionnelSante.numeroProfessionnel`. Un seul par personne, stable, jamais réutilisé, jamais lié à un établissement. C'est ce que l'on cite dans les journaux, les ordonnances et FHIR.
2. **Identité professionnelle** : `profession` + `numeroOrdre`, unique ensemble (RG-AUTH-42). C'est la clé d'unicité réelle côté professionnel. Le numéro d'ordre est un **identifiant, pas un secret** (le tableau de l'ONMB est public) : il ne prouve pas que la personne qui le saisit en est titulaire.
3. **Clé de contrôle de la personne** (facultative) : NPI, stocké sous forme d'empreinte, unique s'il est renseigné. Utile pour détecter un homonyme ou un second compte, mais soumis à l'autorisation de l'APDP (risque 7). Ne pas en faire une clé obligatoire avant confirmation de l'ANIP et de l'APDP.

Les **affiliations** ne portent aucune identité : elles portent le lien avec un établissement.

### 5.2 Schéma cible (proposition, rien n'est appliqué)

```prisma
// La PERSONNE professionnelle : une seule ligne par personne physique.
model ProfessionnelSante {
  // champs actuels conserves (id, userId @unique, numeroProfessionnel @unique, specialite, statutValidation)
  profession         String?   // medecin | pharmacien | sage_femme | chirurgien_dentiste | infirmier | ...
  numeroOrdre        String?   // numero d'inscription au tableau de l'Ordre concerne
  ordreVerifieLe     DateTime? // derniere verification humaine (revalidation periodique)
  npiEmpreinte       String?   @unique // jamais le NPI en clair (a decider, voir risque 7)
  etablissementId    String    // LEGACY : "etablissement principal", supprime en phase D
  affiliations       AffiliationProfessionnelle[]
  @@unique([profession, numeroOrdre]) // Postgres autorise plusieurs NULL : les profils existants ne bloquent pas
}

// Le LIEN personne <-> etablissement (equivalent de PractitionerRole en FHIR, RG-ROL-02).
model AffiliationProfessionnelle {
  id              String   @id @default(cuid())
  professionnelId String
  etablissementId String
  roleNom         String            // meme vocabulaire que UserRole.nom
  service         String?
  statut          String   @default("invitee") // invitee | active | suspendue | terminee
  dateDebut       DateTime @default(now())
  dateFin         DateTime?
  inviteParUserId String?
  @@index([professionnelId, statut])
  @@index([etablissementId, statut])
  // Unicite d'une affiliation ACTIVE par (professionnel, etablissement, role) : index unique partiel en SQL brut
}
```

### 5.3 Espace actif

L'infrastructure de sessions livrée cette nuit (F-AUTH-09, table `SessionActive`, `sessionId` dans le JWT) offre l'emplacement serveur que demande RG-AUTH-60 : une colonne `affiliationActiveId` sur `SessionActive`, jamais transmise par le navigateur. Un helper unique `contexteProfessionnelCourant()` renverrait `{ professionnelId, etablissementId, role }` d'après l'affiliation active. Pour un professionnel à une seule affiliation, le comportement reste identique à aujourd'hui.

## 6. Qui crée et qui valide quoi

| Acte | Qui | Remarque |
|---|---|---|
| Existence légale, droit d'exercer, numéro d'ordre, radiation ou suspension | **Ordre** (hors plateforme) | Source de vérité. Pas d'interface interrogeable connue (NV) : contrôle humain |
| Autorisation d'exercice privé, fichier national des autorisés | **Ministère** (DNSP, plateforme sanipriva) | À enregistrer comme information (référence, date), **pas comme règle bloquante** tant que la contradiction du point 4 n'est pas levée |
| Création de la personne dans le registre, validation du profil (numéro d'ordre, pièce, attestation d'inscription) | **Validateur du ministère** (RG-ROL-05, F-ADM-03) | Le dépôt n'a pas de rôle `PLATFORM_ADMIN` : décision à prendre, permission dédiée pour `admin_national` ou rôle séparé (RG-ROL-06 interdit à l'autorité sanitaire toute lecture clinique nominative) |
| Recherche d'un professionnel existant, demande de rattachement, choix du service, date de début | **Administrateur d'établissement** | Ne crée **jamais** une seconde personne si le numéro d'ordre existe déjà |
| Acceptation du rattachement, second facteur | **Le professionnel** | Il choisit son espace actif ensuite |
| Fin ou suspension d'une affiliation | Administrateur d'établissement (pour son établissement), ministère (partout) | Invalide les sessions de cet espace (RG-ROL-08) |

## 7. Chemin de migration réaliste

Principe : chaque phase est réversible et laisse le comportement actuel intact tant que personne n'a plus d'une affiliation.

- **Phase A, additive, zéro casse.** Ajouter `profession`, `numeroOrdre`, `ordreVerifieLe` (nullables) sur `ProfessionnelSante` et créer `AffiliationProfessionnelle`. Rétro-remplir **une affiliation active par profil existant** depuis `etablissementId`. Rien ne lit encore les nouvelles tables. Retour arrière : supprimer la table et les colonnes.
- **Phase B, centraliser la lecture.** Créer `contexteProfessionnelCourant()` et migrer fichier par fichier les points qui font `professionnelSante.findUnique({ where: { userId } })` puis lisent `.etablissementId`. Ajouter un test de garde (grep) qui interdit ce motif en dehors du helper. Aucun effet visible tant que chacun n'a qu'une affiliation.
- **Phase C, activer le multi.** `affiliationActiveId` dans `SessionActive`, écran de choix d'espace (F-AUTH-07), provisionnement "recherche puis rattachement" à la place de "création avec mot de passe temporaire", contrainte unique `(profession, numeroOrdre)` appliquée aux nouveaux profils, outil de détection et de fusion des doublons de professionnels (modèle à réutiliser : `src/modules/patient/fusion-doublons.ts`).
- **Phase D, nettoyer.** Supprimer la colonne `ProfessionnelSante.etablissementId` une fois qu'aucun lecteur ne subsiste ; disponibilités par affiliation.

### Fichiers du dépôt concernés (comptages par grep, indicatifs)

Lecture d'un établissement depuis un professionnel (`<professionnel|medecin|infirmier|pharmacien|auteur|agent|admin>.etablissementId`, 21 fichiers, 54 occurrences) :
`src/modules/laboratoire/actions.ts` (6), `src/modules/reference/actions.ts` (6), `src/modules/communautaire/actions.ts` (5), `src/modules/prescription/actions.ts` (5), `src/modules/facility/rendez-vous-guichet.ts` (4), `src/modules/clinical/actions.ts` (4), `src/modules/audit/actions.ts` (4), `src/modules/facility/actions.ts` (3), `src/modules/identity/gestion-comptes.ts` (2), `src/modules/facility/file-du-jour.ts` (2), `src/modules/facility/disponibilites.ts` (2), `src/modules/soins/actions.ts` (2), et 1 chacun : `src/modules/facility/gestion-personnel.ts`, `src/modules/facility/gestion-fiche.ts`, `src/modules/vaccination/actions.ts`, `src/modules/urgence/actions.ts`, `src/modules/proches/actions.ts`, `src/modules/analytics/actions.ts`, `src/modules/pilotage/lecture.ts`, `src/app/app/patient/rendez-vous/FormulaireNouveauRendezVous.tsx`, `src/app/app/patient/proches/[id]/FormulaireRendezVousProche.tsx` (ces deux derniers filtrent une liste de professionnels par établissement dans un formulaire : probablement à conserver tels quels).

Dérivation du professionnel depuis la session (`professionnelSante.findUnique|findFirst({ where: { userId ... } })`, 23 fichiers, 50 occurrences) : `src/modules/laboratoire/actions.ts` (9), `src/modules/clinical/actions.ts` (4), `src/modules/vaccination/actions.ts` (3), `src/modules/reference/actions.ts` (3), `src/modules/prescription/actions.ts` (3), `src/modules/audit/actions.ts` (3), `src/modules/facility/disponibilites.ts` (3), `src/modules/facility/actions.ts` (3), `src/modules/identity/gestion-comptes.ts` (2), `src/modules/facility/gestion-personnel.ts` (2), `src/modules/facility/file-du-jour.ts` (2), `src/modules/document/actions.ts` (2), et 1 chacun : `src/modules/urgence/actions.ts`, `src/modules/soins/actions.ts`, `src/modules/pilotage/lecture.ts`, `src/modules/pilotage/exports.ts`, `src/modules/patient/actions.ts`, `src/modules/partage/actions.ts`, `src/modules/communautaire/actions.ts`, `src/modules/analytics/actions.ts`, `src/modules/identity/actions.ts`, `src/modules/facility/rendez-vous-guichet.ts`, `src/modules/facility/gestion-fiche.ts`.

Les deux motifs se recouvrent largement : l'**union** compte **26 fichiers distincts** (calculée par grep, pas la somme 21 + 23). Le périmètre réel de la phase B est donc d'environ 26 fichiers, dont 2 formulaires côté patient probablement à laisser tels quels.

### Impact sur ce qui a été construit cette nuit (à corriger en phase B ou D)

- **F-ETA-05** (`CreneauDisponibilite`, `src/modules/facility/disponibilites.ts`) : les créneaux sont rattachés au professionnel, pas à l'affiliation. Un spécialiste dans deux cliniques verrait ses horaires fusionnés. À rattacher à l'affiliation, et `professionnelIdDepuisUserId` compare aujourd'hui l'établissement de l'administrateur à celui du profil.
- **F-PRE-06** (`src/modules/prescription/verification-publique.ts`) : la page publique affiche `medecinPrescripteur.etablissement.nom`, donc **l'établissement principal du médecin, pas celui de l'acte**. `Prescription` n'a pas d'`etablissementId` propre mais passe par `Consultation`, qui en a un : c'est la bonne source. Même remarque pour l'en-tête du PDF d'ordonnance (F-CIT-06).
- **F-PIL-01, 04, 05** (pilotage) : les agrégats sont calculés à partir de l'établissement porté par l'acte (`Consultation.etablissementId`), donc a priori inchangés. À revérifier pour l'"activité par professionnel".
- **F-AUTH-09** : `SessionActive` est l'emplacement naturel de l'espace actif (5.3).
- **Consentements** : `Consentement.acteurAutoriseId` désigne un utilisateur, donc un consentement accordé à un médecin vaut dans tous ses espaces. Le pack (F-AUTH-07 CA-1) veut que seul l'établissement actif compte. À trancher : consentement lié à la personne ou à l'affiliation.

## 8. Risques

| # | Risque | Mesure |
|---|---|---|
| 1 | Homonymes : nom et prénom ne discriminent pas | Clé `(profession, numeroOrdre)`, date de naissance, empreinte du NPI si autorisé. Jamais de fusion automatique |
| 2 | Usurpation d'un numéro d'ordre : le numéro est public, ce n'est pas un authentifiant | Pièce d'identité et attestation d'inscription, validation humaine (F-ADM-03), second facteur obligatoire, contrainte d'unicité qui alerte sur un numéro déjà pris, revalidation périodique |
| 3 | Deux comptes pour la même personne : **probable dès aujourd'hui**, chaque administrateur crée le sien avec l'e-mail de son choix | Recherche avant création, unicité `(profession, numeroOrdre)`, outil de fusion (modèle : `fusion-doublons.ts` pour les patients) |
| 4 | Radiation ou suspension par l'Ordre non répercutée sur la plateforme | `ordreVerifieLe` avec expiration, revérification périodique, suspension immédiate par le ministère (sessions invalidées grâce à F-AUTH-09) |
| 5 | Mauvais établissement affiché sur un document (ordonnance, PDF) | Prendre l'établissement sur l'acte (`Consultation`), jamais sur le profil |
| 6 | Fuite entre établissements pour un professionnel multi-sites | Espace actif serveur, consentement lié à l'affiliation (à trancher), tests d'accès direct à l'URL d'un autre espace |
| 7 | NPI : donnée d'identification nationale | Autorisation préalable de l'APDP pour tout traitement d'un numéro national (art. 407, repris de `realite-benin.md`), API ANIP santé non confirmée (NV). Champ facultatif, empreinte seulement, aucune dépendance fonctionnelle |
| 8 | Incertitude juridique sur l'autorisation d'exercice privé (contradiction du point 4) | Stocker référence et date sans en faire une règle bloquante |
| 9 | Règles de cumul public/privé et de double vacation inconnues (NV) | La plateforme enregistre les affiliations déclarées, elle ne contrôle pas le cumul : pas de base légale établie pour le faire |
| 10 | Migration : régression silencieuse d'un des 26 fichiers concernés (union des deux listes de la section 7) | Phases réversibles, helper unique, test de garde, mêmes tests qu'aujourd'hui tant qu'il n'y a qu'une affiliation par personne |

## 9. À vérifier et décisions à prendre

À vérifier hors dépôt (aucune de ces réponses n'a été trouvée) :
1. Texte officiel de la loi 2025-01 : l'inscription à l'Ordre suffit-elle pour l'exercice privé ? (DNSP ou `sgg.gouv.bj`, version lisible)
2. Numéro d'inscription : qui l'attribue, quel format, unique par Ordre ou par profession ? Existe-t-il une interface, un export périodique ou une convention possible avec chaque Ordre ?
3. Existence et cadre légal des Ordres des sages-femmes, chirurgiens-dentistes, infirmiers.
4. Règles de déontologie sur l'exercice multi-sites et le cumul public/privé (la source ONMB trouvée était détournée).
5. Vérification et reconnaissance des spécialités.
6. ANIP : accès pour une plateforme de santé, et autorisation de l'APDP pour utiliser le NPI.

Décisions produit :
1. NPI : oui ou non, et à quelle condition juridique.
2. Qui valide les professionnels (permission dédiée ou rôle séparé).
3. Consentement lié à la personne ou à l'affiliation.
4. Ouvrir ou non une discussion avec les Ordres pour un échange de données (P2 dans le pack).

## Limites de la recherche

Sources secondaires pour plusieurs points (presse, résumés de recherche), signalées NV ou "presse" chaque fois. Deux PDF illisibles. Un domaine détourné écarté. Les citations proviennent d'un outil qui résume les pages : à recontrôler à la source avant tout usage réglementaire.

## Sources lues

guides.ohie.org (Health Worker Registry) ; hl7.org/fhir/R4 (practitioner, practitionerrole) ; hwr.dha.go.ke ; registers.kmpdc.go.ke ; ohie.org (Rwanda) ; monespace.ordremedecinsbenin.bj ; ordremedecinsbenin.bj (accueil, tableau des médecins) ; sanipriva.gouv.bj (pièces, autorisation) ; onpb.bj/inscription-a-lordre ; anip.bj ; lebeninoislibere.bj ; lamarinabj.com ; lameteo.info ; docs/recherche-transfert/realite-benin.md ; pack `docs/pack claude/specs/` (04, 07, 15, 22) ; `prisma/schema.prisma` et code du dépôt.
