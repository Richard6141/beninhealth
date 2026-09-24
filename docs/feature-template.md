# Gabarit de fiche fonctionnalité

Copier ce gabarit pour documenter chaque nouvelle fonctionnalité avant de commencer le développement. Le fichier peut être placé dans `docs/features/nom-fonctionnalite.md`.

## Gabarit

### Objectif

### Utilisateur concerné

### Probleme resolu

### Regles metier

### Donnees utilisees

### Ecrans concernes

### Criteres d'acceptation

## Exemple rempli : Prise de rendez-vous

### Objectif

Un patient doit pouvoir choisir un etablissement disponible et recevoir une confirmation.

### Utilisateur concerné

Citoyen disposant d'un espace patient actif sur la plateforme.

### Probleme resolu

Aujourd'hui, la prise de rendez-vous se fait par téléphone ou en présentiel, sans visibilité sur les disponibilités réelles des établissements. Le patient perd du temps et l'établissement gère les créneaux manuellement.

### Regles metier

- Seul un établissement marqué comme disponible pour la période choisie peut être sélectionné.
- Un patient ne peut pas avoir deux rendez-vous actifs qui se chevauchent.
- La confirmation est envoyée uniquement après validation du créneau par le système (pas de double réservation).
- L'annulation reste possible jusqu'à un délai minimal avant le rendez-vous, défini par l'établissement.

### Donnees utilisees

- Profil patient (identité, coordonnées de contact).
- Liste des établissements et de leurs créneaux disponibles.
- Rendez-vous existants du patient, pour vérifier l'absence de chevauchement.

### Ecrans concernes

- Recherche et sélection d'un établissement.
- Choix du créneau et confirmation de la demande.
- Écran de confirmation avec récapitulatif du rendez-vous.
- Liste des rendez-vous du patient (à venir, passés, annulés).

### Criteres d'acceptation

- Le patient peut voir la liste des établissements avec des créneaux disponibles.
- Le patient peut choisir un créneau et valider sa demande de rendez-vous.
- Une confirmation est affichée à l'écran et enregistrée dans l'historique du patient.
- Une tentative de réservation sur un créneau déjà pris est refusée avec un message clair.
