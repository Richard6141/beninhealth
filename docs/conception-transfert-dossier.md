# Accès au dossier d'un patient sans relation préalable : conception

Note de conception du 2026-09-26. Elle répond à deux questions du produit : (1) comment un professionnel ouvre le dossier d'un patient qu'il n'a jamais vu, en toute sécurité et dans la réalité béninoise ; (2) comment identifier de façon unique un spécialiste qui exerce dans plusieurs établissements. Les recherches d'appui sont dans `docs/recherche-transfert/` (fichiers non versionnés : `realite-benin.md`, `identite-professionnels.md`, `benchmark-consentement.md`). Légende des faits externes : V = vérifié, NV = non vérifié.

## 1. Recommandation en bref

1. **Garder l'idée de départ (NPI ou téléphone, puis confirmation par le patient), en la durcissant, avec deux voies de confirmation.** (a) *Dans l'espace patient* : le patient voit une demande lisible (qui, quel établissement, pour quoi, combien de temps) et clique Autoriser ou Refuser, sans transmettre aucun secret. (b) *Par code* reçu sur WhatsApp ou SMS et dicté au professionnel, pour le patient sans smartphone ni compte. Le code n'est jamais visible du professionnel, il est lié à une demande précise, expire en 10 minutes, se tape 3 fois au plus. Dans les deux cas l'accès est borné, retirable et tracé. La voie (a) est préférée : le benchmark international montre que dicter un code est la faiblesse de ce type de parcours (le Kenya a supprimé son OTP en août 2025 parce que des codes étaient partagés).
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
| Acheminement : notification dans l'espace patient, code par WhatsApp puis SMS | `src/modules/transfert/envoi-code.ts` |
| Octroi de l'accès, commun aux deux voies (jamais de rétrogradation d'un accès plus large) | `src/modules/transfert/octroi.ts` |
| Côté patient : voir, autoriser ou refuser une demande | `src/modules/transfert/demandes-patient.ts`, `src/app/app/patient/demandes-acces/` |
| Côté professionnel : demander, renvoyer, confirmer par code, sonder l'état | `src/modules/transfert/actions.ts` |
| Table de demandes `DemandeAccesDossier`, NPI unique sur `Patient`, index de date de naissance | `prisma/schema.prisma`, migration `20260926160500_ajout_demande_acces_dossier` |
| Écran professionnel (sur "Mes patients") | `src/app/app/medecin/patients/FormulaireAccesParCode.tsx` |
| Interrupteur `access.by_npi`, permissions médecin et infirmier | `fonctionnalites-catalogue.ts`, `permissions.ts` |
| Tests unitaires (105, dont les scénarios de sécurité de la section 4) | `wapy.test.ts`, `telephone.test.ts`, `code-acces.test.ts`, `actions.test.ts`, `demandes-patient.test.ts` |

Le résultat de la confirmation est un `Consentement` de type "consultations", de la même nature que celui de F-CIT-11 : aucune voie d'accès parallèle, toutes les lectures existantes s'appliquent telles quelles, y compris l'historique d'accès côté patient et le retrait par le patient.

## 3. Parcours

1. Le professionnel (médecin ou infirmier validé) ouvre "Mes patients", choisit NPI ou téléphone + date de naissance, un motif et une durée (24 h, 3 jours, 7 jours).
2. L'écran répond toujours la même chose : "Demande envoyée au patient, si un dossier correspond". L'envoi a lieu après la réponse (`after()`), pour que le temps de réponse ne trahisse pas l'existence du dossier.
3. Le patient est joint de deux façons à la fois. Dans son espace : une notification puis une carte lisible (qui, établissement, motif, durée) avec Autoriser et Refuser. Sur son téléphone : un message WhatsApp (sinon SMS, 160 caractères, code en premier) qui dit la même chose, porte le code, et demande de ne le donner à personne si la demande est inconnue.
4. Voie (a) : le patient autorise dans son espace ; l'écran du professionnel sonde l'état toutes les 4 secondes et ouvre le dossier tout seul. Un refus est signalé au professionnel. Voie (b) : le patient dicte le code, le professionnel le saisit. Bon code : consentement créé, patient notifié, tout journalisé. Mauvais code : message générique, 3 essais par code.
5. Le professionnel arrive sur le dossier, avec les mêmes contrôles d'accès qu'ailleurs. La première voie confirmée clôt la demande : l'autre ne crée pas de second accès.

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
| Code partagé ou relayé à des tiers (cause de la suppression de l'OTP au Kenya, où des médecins partageaient des codes) | Chaque code est lié à un demandeur, un patient et une demande précis, à usage unique, 10 minutes ; il ne sert à aucun autre professionnel (la confirmation est cherchée par identifiant de demande ET demandeur). La voie dans l'espace patient supprime tout code à transmettre. Reste possible : un professionnel légitime mais malhonnête qui convainc le patient par téléphone, d'où le contenu explicite du message et le journal visible du patient |
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

Migration en 4 phases réversibles, détaillées dans `identite-professionnels.md` (section 7). **La phase A est faite** (voir section 12) : colonnes `profession` et `numeroOrdre` (uniques ensemble), table `AffiliationProfessionnelle` rétro-remplie depuis l'existant et alimentée à chaque création de profil, refus d'un numéro d'ordre déjà enregistré. Rien ne LIT encore les affiliations : l'établissement utilisé partout reste `ProfessionnelSante.etablissementId`. Les phases B (centraliser la lecture de l'établissement, **26 fichiers**), C (espace actif, recherche puis rattachement, fusion des doublons) et D (supprimer l'ancienne colonne) restent à faire, hors des périodes où plusieurs sessions modifient ces mêmes modules. Impacts à corriger au passage : l'établissement affiché sur l'ordonnance publique (F-PRE-06) vient du profil au lieu de l'acte, et les créneaux F-ETA-05 sont rattachés au professionnel et non à l'affiliation.

Lien avec ce qui est construit : `DemandeAccesDossier` enregistre l'établissement du professionnel au moment de la demande, et le consentement créé vaut pour la personne (comme F-CIT-11). Quand l'espace actif existera, il faudra décider si un consentement suit la personne ou l'affiliation (le pack, F-AUTH-07 CA-1, plaide pour l'affiliation).

## 9. Limites connues, dites honnêtement

- **Un seul message WhatsApp réel a été envoyé**, le 2026-09-26, vers le numéro de test fourni par le produit : Wapy l'a accepté et la demande a enregistré le canal `whatsapp`. Le rendu du message sur le téléphone et le parcours complet avec un vrai code restent à confirmer par la personne qui détient ce téléphone. Hors production, WhatsApp ne part que vers les numéros listés dans `WAPY_NUMEROS_TEST` (vide par défaut : aucun envoi réel), pour ne jamais contacter par erreur un numéro de la base de démonstration.
- **Un canal de fuite résiduel** : même avec l'envoi différé, un attaquant qui mesure finement les temps de réponse pourrait percevoir une différence (une requête de plus quand un patient est trouvé). Atténué par les limites de débit, non supprimé.
- **Numéro vérifié n'égale pas titulaire actuel** : les SIM non mises à jour ont pu être réattribuées. Le code ne conserve pas la date de dernière vérification du téléphone. À ajouter : vérification périodique et à chaque changement, et refus du mode téléphone pendant 72 h après un changement de numéro.
- Le NPI est contrôlé seulement sur sa longueur (13 chiffres, source tierce, non confirmée par l'ANIP), sans clé de contrôle inventée, et aucune API ANIP n'est branchée (accès santé non confirmé, NV). Le téléphone utilisé est celui déjà enregistré dans le dossier, pas celui de l'ANIP.
- **Vérifié dans un navigateur** (Chromium piloté par Playwright, données de démonstration, base réelle, canal SMS simulé, sans WhatsApp réel) : parcours par code, par confirmation du patient, refus, mode NPI avec interrupteur, réponse identique patient existant ou non, aucune donnée en clair dans les demandes ni le journal. Les données créées par ces essais ont été supprimées.
- Le patient qui n'a ni smartphone ni compte dépend du code par SMS, donc d'un fournisseur SMS réel qui n'existe pas encore (voir section 5).
- Un patient ne voit les demandes reçues que depuis la notification (pas encore d'entrée dans son menu).

## 10. Décisions attendues du produit

1. **NPI** : on demande l'autorisation de l'APDP avant d'activer `access.by_npi` avec des données réelles ? (Recommandé : oui, et garder le mode téléphone + date de naissance comme voie par défaut d'ici là.)
2. **Canal réel** : quel fournisseur SMS retenir pour le repli, et faut-il négocier un volume supérieur à 60 messages par heure chez Wapy ?
3. **Validation des professionnels** : permission dédiée pour l'administrateur national ou rôle séparé ? (Le pack interdit à l'autorité sanitaire toute lecture clinique nominative, RG-ROL-06.)
4. **Consentement** lié à la personne ou à l'affiliation, une fois les affiliations multiples en place.
5. **Lancer la phase A de l'identité des professionnels** (additive) puis planifier la phase B hors des périodes de travail parallèle ?
6. **Juriste** : faire relire l'accès sans relation préalable et le contact WhatsApp des patients créés sans compte.

## 11. Ce que le benchmark international change (`benchmark-consentement.md`, session projet-gouv-86)

Sept systèmes étudiés (Inde ABDM, Rwanda, Kenya, Estonie, Angleterre, Belgique, France) et le contexte ouest-africain. Faits marqués verifie ou non verifie dans le fichier source ; sites officiels souvent illisibles, donc sources secondaires signalées. Ce qui a été retenu, et ce qui ne l'est pas encore :

| Leçon | Décision |
|---|---|
| Ne pas apprendre aux patients à lire un code à voix haute (Kenya, arnaques au code WhatsApp) | **Adoptée** : confirmation dans l'espace patient, le code devient la voie de secours |
| Prouver la présence du professionnel, pas seulement la possession du téléphone du patient (lecture de la carte à puce en Belgique, QR de la carte de santé, rendez-vous du jour) | **Partiellement adoptée** (voir section 12) : attestation obligatoire du professionnel, durée plafonnée à 24 h sans signal de présence (rendez-vous confirmé ou arrivée enregistrée aujourd'hui dans son établissement). Pas de preuve forte : le QR de la carte de santé n'est pas exigé, le patient sans rendez-vous est le cas d'usage central |
| Consentement lié à un professionnel nommé, une finalité, une durée courte, des catégories | **Partiellement** : professionnel, motif et durée (24 h par défaut) sont explicites ; **les catégories de données ne sont pas différenciées** (les données sensibles, par exemple VIH ou santé mentale, ne sont pas exclues par défaut) |
| Audit actif, pas seulement un journal visible | **Non construit.** Brancher les demandes d'accès sur la détection d'anomalies existante (F-AUD-03) : demandes en rafale, refus répétés du même patient, mêmes patients demandés par des professionnels d'un même établissement |
| L'urgence a son circuit propre | **Déjà en place** (F-CLI-10), inchangé |
| Patients sans smartphone : SMS, USSD, appel vocal, mode assisté en établissement, personne de confiance | **Non construit.** Le code par SMS couvre le téléphone basique dès qu'un fournisseur SMS réel existe ; USSD initié par le réseau et appel vocal : disponibilité chez les opérateurs béninois non vérifiée |
| Le numéro de téléphone n'est pas l'identité (SIM swap organisé en Côte d'Ivoire, au Ghana, au Kenya, au Nigeria) | **Non construit** : délai de carence après un changement de numéro, notification à l'ancien numéro, interrogation de l'opérateur si une API existe |
| Plafonner les demandes, réponse identique | **Adoptée** (section 4) |
| La menace dominante est interne ; un OTP ne protège pas une base qui fuit | Compartimentation par rôle existante ; aucun NPI complet n'est jamais renvoyé par la recherche ; audit actif à construire (ci-dessus) |
| Trois dépendances béninoises : autorisation APDP, ANIP (consentement du titulaire dans son flux, accès santé), juriste | **Interrupteur `access.by_npi`** ; questions à poser à l'ANIP par écrit ; relecture juridique demandée (section 10) |

## 12. Décisions du produit et état au 2026-09-26 (soir)

Réponses données par le produit aux décisions de la section 10 :

1. **NPI : oui, demander l'autorisation de l'APDP** avant d'activer `access.by_npi` avec des données réelles. D'ici là l'interrupteur reste désactivé et le mode téléphone + date de naissance est la voie par défaut. Démarche à mener : dépôt du dossier auprès de l'APDP (art. 407), et questions écrites à l'ANIP (accès pour une plateforme de santé, consentement du titulaire dans son flux).
2. **Identité des professionnels : oui, lancer la phase A.** Faite : `profession` + `numeroOrdre` uniques ensemble (facultatifs), `AffiliationProfessionnelle` (une ligne active par profil et par rôle, rétro-remplie : 8 profils, 8 affiliations, aucune incohérence), création d'une affiliation à chaque création de compte (par le ministère pour l'administrateur d'établissement, par l'administrateur pour son personnel), champ facultatif "Numéro d'inscription à l'Ordre" dans le formulaire d'ajout du personnel, et refus d'un numéro d'ordre déjà enregistré pour la même profession, sans révéler qui ni où. **Qui valide les professionnels : décision prise, l'administrateur national**, via une permission dédiée à créer avec l'écran de validation (F-ADM-03, procédure manuelle auprès de l'Ordre) ; le rôle de vérificateur ne lit aucune donnée clinique nominative (RG-ROL-06). Pas encore construit : l'écran de validation et la colonne `ordreVerifieLe`.
3. **Preuve de présence : décision déléguée, tranchée ainsi.** Une exigence stricte (rendez-vous ou QR de carte) bloquerait le cas d'usage central, le patient qui se présente sans rendez-vous et sans carte (les cartes de santé n'existent pas encore). Retenu : (a) le professionnel atteste que le patient est présent devant lui, case obligatoire enregistrée au journal ; (b) sans rendez-vous confirmé ni arrivée enregistrée aujourd'hui dans son établissement, l'accès est plafonné à 24 heures, même si le professionnel en demande plus. Ce plafonnement est silencieux côté professionnel (sinon il révélerait qu'un dossier existe) mais visible du patient, dont le message et la carte de demande affichent la durée réellement accordée. À revoir quand une carte de santé lisible existera.
4. **Canal : Wapy pour les tests**, un fournisseur SMS réel et un volume plus large seront envisagés si l'État valide la solution.

Sous-entendu de ces décisions : aucune donnée réelle avant l'autorisation de l'APDP, y compris pour les numéros de téléphone (art. 394).
