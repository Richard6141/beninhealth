# Accès au dossier d'un patient sans relation préalable : conception

Note de conception du 2026-09-26. Elle répond à deux questions du produit : (1) comment un professionnel ouvre le dossier d'un patient qu'il n'a jamais vu, en toute sécurité et dans la réalité béninoise ; (2) comment identifier de façon unique un spécialiste qui exerce dans plusieurs établissements. Les recherches d'appui sont dans `docs/recherche-transfert/` (fichiers non versionnés : `realite-benin.md`, `identite-professionnels.md`, `benchmark-consentement.md`). Légende des faits externes : V = vérifié, NV = non vérifié.

## 1. Recommandation en bref

1. **Garder l'idée de départ (NPI ou téléphone, puis code envoyé au patient), en la durcissant.** Le patient consent en donnant un code reçu sur son propre téléphone. Le code n'est jamais visible du professionnel, il est lié à une demande précise (qui demande, pour quoi, combien de temps, écrit dans le message reçu), il expire en 10 minutes, se tape 3 fois au plus, et donne un accès borné, retirable et tracé.
2. **Le professionnel ne doit jamais apprendre si un patient existe** avant que le patient lui ait dicté le code (règle RG-CLI-10 du pack). Sinon, saisir des NPI à la chaîne deviendrait un moyen de savoir qui est patient de la plateforme.
3. **Le canal ne doit pas être unique.** WhatsApp (Wapy) d'abord, SMS en repli, puis les moyens déjà construits qui ne dépendent d'aucun canal : code de partage généré par le patient (F-CIT-11), référence entre établissements (F-CLI-14), accès d'urgence (F-CLI-10).
4. **Le NPI est derrière un interrupteur, désactivé par défaut** (`access.by_npi`). Le Code du numérique (art. 407) exige l'autorisation préalable de l'APDP pour tout traitement d'un numéro national d'identification (V, texte lu). Le mode téléphone + date de naissance n'utilise pas de NPI et reste disponible.
5. **Pour les spécialistes multi-établissements : une personne, une identité professionnelle, des affiliations.** L'Ordre reste la source de vérité, un validateur du ministère contrôle une fois, les établissements recherchent puis rattachent, ils ne recréent jamais la personne. Le pack prévoit déjà cette cible ; il manque le chemin de migration (section 8).

## 2. Ce qui est construit

| Élément | Fichiers |
|---|---|
| Client WhatsApp Wapy.pro (clé côté serveur, idempotence, gestion des 400/401/403/404/429/502/503) | `src/lib/wapy.ts` |
| Normalisation des numéros béninois (8 chiffres et 10 chiffres, +229) | `src/lib/telephone.ts` |
| Règles pures : code à 6 chiffres, empreinte du critère, limites, texte du message | `src/modules/transfert/code-acces.ts` |
| Acheminement du code : WhatsApp puis SMS | `src/modules/transfert/envoi-code.ts` |
| Trois actions : demander, renvoyer, confirmer | `src/modules/transfert/actions.ts` |
| Table de demandes `DemandeAccesDossier`, NPI unique sur `Patient`, index de date de naissance | `prisma/schema.prisma`, migration `20260926160500_ajout_demande_acces_dossier` |
| Écran professionnel (sur "Mes patients") | `src/app/app/medecin/patients/FormulaireAccesParCode.tsx` |
| Interrupteur `access.by_npi`, permissions médecin et infirmier | `fonctionnalites-catalogue.ts`, `permissions.ts` |
| Tests (81, dont les scénarios de sécurité de la section 4) | `wapy.test.ts`, `telephone.test.ts`, `code-acces.test.ts`, `actions.test.ts` |

Le résultat de la confirmation est un `Consentement` de type "consultations", de la même nature que celui de F-CIT-11 : aucune voie d'accès parallèle, toutes les lectures existantes s'appliquent telles quelles, y compris l'historique d'accès côté patient et le retrait par le patient.

## 3. Parcours

1. Le professionnel (médecin ou infirmier validé) ouvre "Mes patients", choisit NPI ou téléphone + date de naissance, un motif et une durée (24 h, 3 jours, 7 jours).
2. L'écran répond toujours la même chose : "Code envoyé au patient, si un dossier correspond". L'envoi a lieu après la réponse (`after()`), pour que le temps de réponse ne trahisse pas l'existence du dossier.
3. Le patient reçoit sur WhatsApp : qui demande (nom, établissement), pour quel motif, pour combien de temps, le code, et la consigne de ne le donner à personne s'il ne reconnaît pas la demande. Sans WhatsApp, un SMS équivalent (limité à 160 caractères, code en premier).
4. Le patient dicte le code au professionnel, qui le saisit. Bon code : consentement créé, patient notifié dans l'application (retrait possible à tout moment), tout est journalisé. Mauvais code : message générique, 3 essais par code.
5. Le professionnel est redirigé vers le dossier, avec les mêmes contrôles d'accès qu'ailleurs.

## 4. Menaces et parades

| Menace | Parade |
|---|---|
| Un patient donne son code à un faux "professionnel" (hameçonnage) | Le message nomme le demandeur, le motif et la durée ; il dit de ne pas donner le code si la demande est inconnue. Le modèle imposé par Wapy sur son point d'entrée OTP se termine par "Ne le communiquez à personne", ce qui contredit le parcours : on utilise donc le point d'entrée texte libre `/pont/v1/messages` |
| Un professionnel devine des NPI ou des téléphones pour repérer des patients | Réponse identique dans tous les cas ; 20 demandes par heure et 10 sans correspondance par heure et par professionnel ; le critère saisi est stocké sous forme d'empreinte HMAC, jamais en clair |
| Deviner le code (6 chiffres) | 3 essais par code, réservés de façon atomique avant comparaison ; 10 échecs par heure et par professionnel ; code haché (bcrypt), expiration à 10 minutes, usage unique |
| Harcèlement d'un patient par des demandes répétées | 5 codes par patient et par jour au total, 3 par couple demandeur-patient : au-delà, la demande se comporte comme "aucun patient" sans rien signaler au demandeur, et n'entre pas dans le compteur du patient (sinon un seul demandeur pourrait épuiser la limite et fermer l'accès aux autres) |
| Un professionnel s'auto-accorde l'accès à son propre dossier | Son propre NPI est traité comme "aucun patient" |
| Deux dossiers avec le même téléphone et la même date de naissance (jumeaux) | Ambiguïté traitée comme "aucun résultat" : jamais de choix arbitraire |
| Confirmations simultanées | Validation conditionnelle en base : la seconde ne crée pas de second accès |
| Rétrogradation d'un accès déjà accordé par le patient | Un accès "dossier complet" ou plus long déjà en place n'est jamais réduit |
| Le code lu dans une base ou un journal | Jamais stocké en clair, jamais journalisé, jamais renvoyé dans une réponse ; en production le repli SMS est coupé (la boîte d'envoi est simulée et consultable par l'administration) |
| Numéro recyclé (SIM réattribuée) | Non couvert par le code : voir section 9 |

## 5. Canaux et limites de Wapy

- WhatsApp est le canal choisi. Il exige un smartphone et de la data. Le rapport `realite-benin.md` recommande de ne jamais dépendre de WhatsApp seul (part de WhatsApp, part de téléphones basiques : NV pour le Bénin ; 32 % d'internautes début 2025 : V).
- Limites du compte Wapy (V, documentation) : 3 secondes minimum entre deux envois, **60 messages par heure et 500 par jour pour toute la plateforme**. C'est suffisant pour une démonstration ou un pilote, pas pour un déploiement national : un fournisseur SMS réel et un compte à volume négocié sont un prérequis avant tout usage large.
- Le SMS de repli n'est aujourd'hui qu'une boîte d'envoi simulée (F-NOT-02, pas de fournisseur réel). Hors production il permet de démontrer le parcours ; en production, sans WhatsApp opérationnel, le code n'est pas livré.
- La clé Wapy est dans `.env` local (`WAPY_PONT_CLE`), jamais dans le code ni dans Git. Elle a été communiquée en clair dans une conversation : à remplacer par une nouvelle clé avant tout déploiement.

## 6. Cadre juridique (V pour le texte lu, NV pour l'interprétation)

- Art. 394 : les données de santé sont interdites de traitement par principe, sauf exceptions dont le consentement explicite retirable, les intérêts vitaux, les soins sous secret professionnel.
- Art. 407 : autorisation préalable de l'APDP pour tout traitement portant sur un numéro national d'identification. Conséquence retenue : `access.by_npi` désactivé par défaut, et le champ NPI du patient n'est à renseigner avec des données réelles qu'après cette autorisation.
- Hébergement : un hébergement hors du Bénin déclenche l'autorisation de transfert (art. 391). La base actuelle est sur un serveur distant : à vérifier avant toute donnée réelle.
- L'accès sans relation préalable n'est pas réglé expressément par le texte. La lecture retenue (consentement explicite du patient, urgence sur intérêts vitaux) **n'a pas été validée par un juriste**.

## 7. Cas qui échappent au code

Patient sans téléphone, sans WhatsApp, ou incapable de répondre : code de partage généré par le patient (F-CIT-11, existe déjà) ; référence entre établissements (F-CLI-14, existe déjà) ; accès d'urgence tracé et revu (F-CLI-10, existe déjà). Enfant ou personne sous tutelle : passe par le compte du tuteur (F-CIT-09) et non par ce parcours. Patient créé sans compte par un professionnel : son téléphone a été saisi par ce professionnel, sans preuve que le titulaire ait accepté d'être contacté sur WhatsApp ; c'est un point de conformité à trancher (le champ `consentement` exigé par Wapy est aujourd'hui renseigné avec l'identifiant de santé du dossier).

## 8. Identité des spécialistes multi-établissements

**Réponse à "comment sait-on qu'un spécialiste est unique ?"** Aujourd'hui, on ne le sait pas : un profil professionnel est lié à un seul compte et à un seul établissement, et seule l'adresse e-mail est unique. Un spécialiste créé par deux administrateurs avec deux adresses obtient deux comptes et deux historiques (`identite-professionnels.md`, risque 3).

**Réponse à "est-ce l'Ordre qui enregistre et les établissements qui recherchent ?"** Pour l'existence légale, oui : l'inscription au tableau relève de l'Ordre (V pour l'ONMB et l'ONPB). Aucun Ordre ne semble exposer d'interface interrogeable (NV), donc le MVP ne peut pas interroger l'Ordre automatiquement : un validateur du ministère contrôle le dossier une fois (F-ADM-03, procédure manuelle), puis les établissements cherchent dans le registre de la plateforme et demandent un rattachement.

Modèle recommandé, aligné sur le pack (RG-ROL-01 à 08, RG-AUTH-42, F-AUTH-07) et sur les référentiels lus (OpenHIE Health Worker Registry, FHIR `Practitioner` et `PractitionerRole`) :

1. **La personne** : une ligne par personne physique (existant).
2. **L'identité professionnelle** : profession + numéro d'inscription à l'Ordre, unique ensemble. C'est la vraie clé d'unicité. Ce n'est pas un secret (le tableau de l'ONMB est public) : il ne prouve pas que celui qui le saisit en est titulaire, d'où la validation humaine, la pièce d'identité et le second facteur.
3. **Les affiliations** : une ligne par établissement (rôle, service, dates, statut invité, active, suspendue, terminée), sans aucune identité. Un professionnel à plusieurs affiliations choisit un "espace actif", lu côté serveur.

Le NPI ne sert qu'en contrôle croisé facultatif (empreinte seulement), à cause de l'art. 407.

Migration en 4 phases réversibles, détaillées dans `identite-professionnels.md` (section 7). La phase A (colonnes facultatives et table d'affiliations, rétro-remplie depuis l'existant) ne casse rien ; la phase B (centraliser la lecture de l'établissement) touche **26 fichiers** et doit se faire hors des périodes où plusieurs sessions modifient ces mêmes modules. Impacts à corriger au passage : l'établissement affiché sur l'ordonnance publique (F-PRE-06) vient du profil au lieu de l'acte, et les créneaux F-ETA-05 sont rattachés au professionnel et non à l'affiliation. **Cette migration n'est pas commencée** : elle attend les décisions de la section 10.

Lien avec ce qui est construit : `DemandeAccesDossier` enregistre l'établissement du professionnel au moment de la demande, et le consentement créé vaut pour la personne (comme F-CIT-11). Quand l'espace actif existera, il faudra décider si un consentement suit la personne ou l'affiliation (le pack, F-AUTH-07 CA-1, plaide pour l'affiliation).

## 9. Limites connues, dites honnêtement

- **Aucun message WhatsApp réel n'a encore été envoyé.** Le client est testé contre le contrat documenté (simulé), pas contre le service. Le premier envoi réel doit se faire vers un numéro de test fourni par le produit.
- **Un canal de fuite résiduel** : même avec l'envoi différé, un attaquant qui mesure finement les temps de réponse pourrait percevoir une différence (une requête de plus quand un patient est trouvé). Atténué par les limites de débit, non supprimé.
- **Numéro vérifié n'égale pas titulaire actuel** : les SIM non mises à jour ont pu être réattribuées. Le code ne conserve pas la date de dernière vérification du téléphone. À ajouter : vérification périodique et à chaque changement, et refus du mode téléphone pendant 72 h après un changement de numéro.
- Le NPI est contrôlé seulement sur sa longueur (13 chiffres, source tierce, non confirmée par l'ANIP), sans clé de contrôle inventée, et aucune API ANIP n'est branchée (accès santé non confirmé, NV). Le téléphone utilisé est celui déjà enregistré dans le dossier, pas celui de l'ANIP.
- Aucun écran patient n'a été modifié : il reçoit une notification dans l'application et voit l'accès dans ses consentements et son historique existants. Un écran "demandes reçues" n'est pas construit.
- Les tests d'actions utilisent une base simulée. Le parcours complet dans le navigateur est à vérifier (voir le compte rendu de session).

## 10. Décisions attendues du produit

1. **NPI** : on demande l'autorisation de l'APDP avant d'activer `access.by_npi` avec des données réelles ? (Recommandé : oui, et garder le mode téléphone + date de naissance comme voie par défaut d'ici là.)
2. **Canal réel** : quel fournisseur SMS retenir pour le repli, et faut-il négocier un volume supérieur à 60 messages par heure chez Wapy ?
3. **Validation des professionnels** : permission dédiée pour l'administrateur national ou rôle séparé ? (Le pack interdit à l'autorité sanitaire toute lecture clinique nominative, RG-ROL-06.)
4. **Consentement** lié à la personne ou à l'affiliation, une fois les affiliations multiples en place.
5. **Lancer la phase A de l'identité des professionnels** (additive) puis planifier la phase B hors des périodes de travail parallèle ?
6. **Juriste** : faire relire l'accès sans relation préalable et le contact WhatsApp des patients créés sans compte.
