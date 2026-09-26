# Réalité béninoise : accès au dossier par NPI ou téléphone + code OTP

Recherche du 2026-09-26, requêtes web génériques uniquement (aucun contenu du projet transmis). Légende : **V** = vérifié (source citée), **NV** = non vérifié. Les sources "presse" sont secondaires ; le texte de loi a été lu directement (PDF du Code du numérique, extrait localement).

## 1. NPI

| Fait | Statut |
|---|---|
| Autorité émettrice : ANIP (Agence Nationale d'Identification des Personnes), créée par la loi 2017-08 du 19 juin 2017 | V (anip.bj, banouto.bj ; texte de loi non relu) |
| Format : 13 chiffres | V (enligneaubenin.com, site tiers ; anip.bj et gouv.bj ne donnent pas la longueur). Le même site parle aussi de "code alphanumérique" : structure interne ou clé de contrôle **NV** |
| Obtention : recensement RAVIP, puis certificat NPI/fID gratuit via eservices.anip.bj ou l'appli ANIP BJ. Retrouver son NPI demande nom, prénom, nom de la mère, date de naissance | V (anip.bj/certificat-npi-fid) |
| L'ANIP exige que le téléphone de l'usager soit à jour dans son système ; mise à jour via eservices ou USSD *151*1# avec NPI ou récépissé RAVIP | V (anip.bj, portailinfo.bj, janvier 2026) |
| Comment l'État envoie un OTP lié à un NPI (SMS ou autre) | **NV** : aucune page consultée ne décrit le mécanisme |
| API ANIP pour tiers : existe pour authentifier les pièces d'identité (code barre, QR) ; ouverte aux banques, assurances, systèmes financiers décentralisés | V (banouto.bj, mai 2021) |
| Accès pour une plateforme de santé, et procédure | **NV** : aucune mention hors secteur financier. À demander à l'ANIP directement |

## 2. Téléphonie

| Fait | Statut |
|---|---|
| Depuis le 30 novembre 2024, numéros à 10 chiffres : préfixe 01 devant l'ancien numéro à 8 chiffres, tous réseaux. Forme internationale : +229 01XXXXXXXX (soit +22901XXXXXXXX) | V (arcep.bj) |
| Transition d'un mois où 8 et 10 chiffres coexistaient | V (arcep.bj) |
| WhatsApp et Telegram ont basculé plus tard (effet le 3 décembre 2024), les anciens formats 8 chiffres y ayant survécu entre-temps | V (critikmag.com) |
| Des numéros à 8 chiffres circulent encore dans les bases, contacts et formulaires existants | **NV** (inférence, non mesuré) |
| Identification obligatoire des abonnés avec vérification du NPI par les opérateurs, en lien avec l'ANIP | V pour le principe (décret d'identification cité par arcep.bj, lu via extrait de recherche) |
| Mise à jour d'identification avant le 30 mars 2025 ; SIM non enregistrées désactivées dès le 30 avril 2025 | V (agenceecofin.com, beninwebtv.com). Lien systématique SIM vers NPI non confirmé par ces deux articles |
| 16,7 M connexions mobiles début 2025 (114 % de la population), 4,71 M internautes (32,2 %), 51 % d'urbains | V (DataReportal Digital 2025) |
| Part de WhatsApp par rapport au SMS | **NV** (DataReportal ne le donne pas ; une estimation à 4 M d'utilisateurs vue sur un site tiers n'est pas recoupée) |
| Part de téléphones basiques sans smartphone | **NV** pour le Bénin (seule donnée trouvée : Afrique de l'Ouest 2017, smartphones à 35 % des connexions, trop ancienne) |
| Couverture rurale : 63 % de la population rurale en zone couverte 4G ; le gouvernement revendique environ 90 % au total ; la GSMA estime que 39 à 66 % vivaient à portée d'un haut débit sans y être connectés (2023) | V (presse, agenceecofin.com et afrique-sur7.fr, chiffres non relus à la source) |

## 3. Cadre juridique (loi 2017-20 du 20 avril 2018, modifiée par la loi 2020-35 du 6 janvier 2021)

| Fait | Statut |
|---|---|
| APDP : autorité indépendante chargée de contrôler les traitements (Livre V) | V |
| Art. 394 : traitement des données de santé **interdit par principe**, sauf exceptions dont : consentement explicite (retirable à tout moment sans frais), intérêts vitaux si la personne ne peut pas consentir, soins et diagnostics sous surveillance d'un professionnel de santé, santé publique. Traitement par un professionnel tenu au secret professionnel | V (texte lu) |
| Art. 407 : autorisation préalable de l'APDP pour les traitements de données de l'art. 394, **pour tout traitement portant sur un numéro national d'identification**, l'interconnexion de fichiers et le transfert vers un État tiers | V (texte lu) |
| Art. 391 : transfert hors du Bénin seulement si l'APDP constate une protection équivalente, avec autorisation préalable ; contrôle régulier ensuite | V (texte lu) |
| Art. 433 : conservation limitée à la durée nécessaire à la finalité ; pas de durée chiffrée pour un dossier médical | V pour le principe, durée **NV** |
| Obligation de localiser physiquement l'hébergement au Bénin | **NV** (non trouvée dans les articles lus, recherche non exhaustive) |
| Secret médical : l'art. 394 renvoie à l'obligation de secret du droit béninois ; code de déontologie non consulté | Renvoi V, contenu **NV** |
| Accès par un professionnel sans relation préalable : le texte ne le règle pas expressément. Lecture des art. 394 et 407, **interprétation non validée par un juriste** : hors urgence, consentement explicite du patient ou relation de soins ; en urgence, intérêts vitaux | **NV** (interprétation) |

## 4. Conséquences pour la conception

1. **Normaliser les numéros.** Stocker une seule forme canonique +22901XXXXXXXX. Accepter en saisie : 8 chiffres (ajouter 01), 10 chiffres commençant par 01, et +229 avec ou sans le 01. Dédoublonner sur la forme canonique, garder la saisie brute pour l'audit. Tester le cas 8 chiffres sur les données existantes.
2. **SMS d'abord, jamais WhatsApp seul.** WhatsApp n'a pas de part chiffrée, exige un smartphone et de la data (32 % d'internautes), et a déjà eu un décalage de format en 2024. Chaîne de secours si l'envoi échoue : nouvel essai SMS, puis code remis en présentiel par l'établissement (le code de partage temporaire existe déjà, F-CIT-11), puis appel du support. Ne jamais bloquer un patient en urgence sur un canal en panne.
3. **NPI : identifiant saisi, pas preuve d'identité.** Contrôler seulement la longueur (13 chiffres), sans clé de contrôle inventée. Ne pas bâtir l'OTP sur une API ANIP tant qu'un accès santé n'est pas confirmé par l'ANIP. Tout traitement d'un NPI exige l'autorisation préalable de l'APDP (art. 407) : à prévoir avant toute donnée réelle.
4. **Consentement explicite, retirable, traçable.** Hors urgence, l'accès d'un professionnel sans relation préalable passe par un OTP reçu par le patient sur son téléphone, avec finalité affichée. Urgence : base "intérêts vitaux" (art. 394), journalisée et revue après coup. Faire relire ce point par un juriste avant tout usage réel.
5. **Numéro vérifié n'égale pas titulaire actuel.** Les SIM non mises à jour ont pu être désactivées puis réattribuées : lier le téléphone au dossier avec une nouvelle vérification périodique et à chaque changement. Vérifier aussi où est hébergée la base avant toute donnée réelle : un hébergement hors du Bénin déclenche l'autorisation de transfert (art. 391, 407).

## Sources principales

arcep.bj (passage à 10 chiffres) ; anip.bj (certificat NPI/fID) ; enligneaubenin.com (13 chiffres) ; portailinfo.bj (mise à jour du téléphone ANIP, 2026) ; banouto.bj (API ANIP, 2021) ; critikmag.com (WhatsApp et 10 chiffres) ; agenceecofin.com et beninwebtv.com (SIM) ; datareportal.com (Digital 2025 Benin) ; afapdp.org (texte de la loi 2017-20).
