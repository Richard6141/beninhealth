# Audit du rôle agent communautaire face au pack Claude Code

Même méthode que les audits précédents. Périmètre : `src/app/app/medecin/communautaire/**`,
`src/modules/communautaire/actions.ts`, comparés à
`docs/pack claude/specs/13-fiches-communautaire-hors-ligne.md` (F-COM-01 à F-COM-08).

## Constat : écart de nature, pas seulement de degré

Contrairement au médecin et à l'infirmier, l'écart ici n'est pas "une fonctionnalité
incomplète" mais un changement d'architecture entier. Le pack définit ce rôle comme
**fonctionnant hors ligne en priorité** : PWA installée sur le téléphone de l'agent,
chiffrement local (AES-GCM, clé dérivée d'un code PIN par PBKDF2), création
d'identifiants sur l'appareil (UUID v7), synchronisation par lots idempotente au
retour du réseau. Rien de tout cela n'existe dans ce dépôt, et rien de tout cela
n'est raisonnable à construire dans le cadre de cet audit : c'est un chantier
d'infrastructure à part entière (stockage chiffré, PWA offline-first, protocole de
synchronisation avec gestion des conflits), pas un correctif.

## Ce qui existe déjà

Une implémentation simplifiée, **en ligne uniquement**, déjà en place avant cet audit
(`src/modules/communautaire/actions.ts`, `src/app/app/medecin/communautaire/`) :
formulaire de visite (bénéficiaire, type de visite, lieu, notes libres) et historique
des visites de l'agent connecté. Le code est explicite et honnête sur son propre
périmètre : `agent_communautaire` ne détient aucune permission `read:patient` dans la
matrice RBAC, et le module ne lit ni n'écrit jamais de dossier `Patient` — le
bénéficiaire est identifié par un nom déclaré sur le terrain, jamais relié à un compte.
Cette limite est documentée dans le code lui-même, pas seulement dans ce rapport.

## Statut par fiche

| Fiche | Statut | Commentaire |
|---|---|---|
| F-COM-01 Préparer l'appareil (PWA, PIN, instantané de l'aire) | Non fait | Suppose toute l'infrastructure offline-first. Hors périmètre de cet audit. |
| F-COM-02 Enregistrer une personne | Partiel | Un "bénéficiaire" peut être nommé lors d'une visite, mais ce n'est pas un vrai enregistrement de personne (pas de fiche dédiée, pas de détection de doublon, pas de village/ménage). |
| F-COM-03 Visite à domicile (questionnaire, signes de danger, référence) | Partiel | Le formulaire de visite existe (type, lieu, notes libres), mais sans questionnaire structuré ni détection de signes de danger, donc sans référence automatique vers un centre de santé. |
| F-COM-04 Vaccination de terrain | Partiel | "Vaccination" existe comme type de visite (texte libre en note), pas de vrai carnet de vaccination ni de contrôle âge/intervalle. |
| F-COM-05 à 07 (grossesse, enfant, campagnes) | Non fait | Marqué P2 dans le pack lui-même, hors MVP. |
| F-COM-08 Synchroniser | Non fait | N'a de sens que si F-COM-01 (offline) existe. |

## Pourquoi ne pas construire une version "allégée" du questionnaire de signes de danger

Le pack le précise lui-même (RG-COM-10) : la liste des signes de danger et les
questionnaires DOIVENT être des données de référentiel **validées par le programme
national de santé communautaire**, pas du contenu inventé dans le code. Écrire des
seuils cliniques (ex. quels symptômes déclenchent une référence d'urgence) sans
validation par une autorité sanitaire serait précisément le genre de contenu
"négligé" que ce projet essaie d'éviter depuis la décision de coder au niveau
production. Ce point reste donc explicitement non fait, par choix, pas par oubli.

## Recommandation

Aucune correction appliquée aujourd'hui pour ce rôle : l'implémentation existante est
déjà honnête sur son périmètre, et l'écart restant (mode hors ligne complet) est un
chantier d'infrastructure séparé, pas un correctif ponctuel. Si le temps du challenge
permet d'aller plus loin, la priorité serait un vrai enregistrement de personne
(F-COM-02, en ligne, sans le mode hors ligne) plutôt que le déclenchement de
références d'urgence sur du contenu clinique non validé.
