# 22. API et interopérabilité

## 22.1 Conventions de l'API REST

| Sujet | Règle |
|---|---|
| Préfixe et version | `/api/v1/…` ; une rupture de compatibilité crée `/api/v2` |
| Format | JSON UTF-8, noms de champs en `camelCase`, dates ISO 8601 en UTC (`2026-10-14T08:30:00Z`) |
| Authentification | MVP : cookie de session (application web et PWA). P2 : jetons OAuth 2.0 (client credentials) pour les partenaires |
| Autorisation | Chaque route appelle un service qui appelle `authorize()` ; la permission requise est documentée dans OpenAPI (`x-permission`) |
| Validation | Schéma Zod d'entrée **et** de sortie pour chaque route |
| Pagination | `?cursor=…&limit=20` → réponse `{ data: [...], nextCursor: "…" | null }` |
| Idempotence | Les `POST` pouvant être rejoués (synchronisation, paiement futur, délivrance) acceptent l'en-tête `Idempotency-Key` ; la même clé renvoie la même réponse pendant 24 h |
| Concurrence | Les modifications de ressources à version (`PATCH`) exigent l'en-tête `If-Match` avec la version ; conflit → 409 |
| Traçabilité | Chaque réponse contient l'en-tête `X-Request-Id` |
| Documentation | OpenAPI 3.1 générée depuis Zod ; interface sur `/api/docs` réservée aux environnements dev et staging ou aux administrateurs |

## 22.2 Format des erreurs

Format « Problem Details » (RFC 9457), avec le code du catalogue (section 18.8) :

```json
{
  "type": "https://bhip.bj/errors/APPT_SLOT_FULL",
  "title": "Ce créneau vient d'être réservé. Choisissez-en un autre.",
  "status": 409,
  "code": "APPT_SLOT_FULL",
  "requestId": "01J9Z6Y3K2…",
  "errors": [{ "field": "slotId", "code": "APPT_SLOT_FULL" }]
}
```

## 22.3 Limitation des requêtes

| Cible | Limite |
|---|---|
| Connexion, OTP, mot de passe oublié | Section RG-AUTH-03 et F-AUTH-02 |
| Vérification publique d'ordonnance | 30 / minute / IP |
| Recherche de patients | 60 / heure / professionnel |
| Recherche d'établissements (public) | 120 / minute / IP |
| API authentifiée en général | 600 / minute / utilisateur |
| Résumé IA | 30 / heure / médecin |
| Exports | 10 / jour / utilisateur |

## 22.4 Catalogue des routes (MVP)

Chaque route renvoie aux fiches qui la spécifient. `{…}` = identifiant.

| Module | Méthode et chemin | Rôles | Fiche |
|---|---|---|---|
| référentiels | `GET /ref/icd10?q=` · `GET /ref/medications?q=` · `GET /ref/lab-tests?q=` · `GET /ref/vaccines` · `GET /ref/geo/{niveau}` · `GET /ref/services` | Utilisateurs connectés (géographie et services : public) | F-ADM-04, F-PRE-03 |
| auth | `POST /auth/register` · `POST /auth/phone/verify` · `POST /auth/sign-in` · `POST /auth/sign-out` · `POST /auth/password/forgot` · `POST /auth/password/reset` | Public / tous | F-AUTH-01, 02, 04 |
| auth | `POST /auth/2fa/enable` · `POST /auth/2fa/verify` · `POST /auth/reauth` | Pros | F-AUTH-06 |
| auth | `GET /invitations/{token}` · `POST /invitations/{token}/accept` | Invité | F-AUTH-05 |
| auth | `GET /me/spaces` · `POST /session/active-space` · `GET /me/sessions` · `DELETE /me/sessions/{id}` | Tous | F-AUTH-07, 09 |
| citoyen | `GET /me/dashboard` · `GET /me/record/summary` · `GET /me/record/timeline` | CITIZEN | F-CIT-02, 03 |
| citoyen | `PATCH /me/patient/declared` · `POST/PATCH /me/allergies` · `/me/conditions` · `/me/emergency-contacts` | CITIZEN | F-CIT-01, 04 |
| citoyen | `POST /me/health-card/token` · `GET /me/prescriptions` · `GET /me/lab-results` · `GET /me/documents` · `GET /me/documents/{id}/download` | CITIZEN | F-CIT-05, 06 |
| citoyen | `GET/POST /me/dependents` · `POST /me/acting-for` | CITIZEN | F-CIT-07, 08 |
| citoyen | `GET/POST /me/consents` · `POST /me/consents/{id}/revoke` · `POST /me/share-codes` · `GET /me/access-log` · `POST /me/data-requests` | CITIZEN | F-CIT-10 à 13 |
| établissements | `GET /facilities` · `GET /facilities/{id}` · `GET /facilities/{id}/slots` | Public | F-ETA-01, 02 |
| établissements | `PATCH /facility` · `POST/PATCH /facility/services` · `GET/POST /facility/staff` · `POST /facility/staff/{id}/suspend` · `/end` · `GET/POST/PATCH /facility/schedules` · `POST /facility/closures` | FACILITY_ADMIN | F-ETA-03 à 05 |
| rendez-vous | `POST /appointments` · `POST /appointments/{id}/cancel` · `/reschedule` · `/confirm` · `/reject` | CITIZEN, RECEPTIONIST | F-RDV-01 à 03, 06 |
| visites | `GET /facility/queue` · `POST /visits` · `POST /visits/walk-in` · `POST /visits/{id}/checkin-otp` · `POST /visits/{id}/complete` | RECEPTIONIST, soignants | F-RDV-04, 05 |
| patients | `GET /patients/search` · `POST /patients/duplicates-check` · `POST /patients` · `GET /patients/{id}/summary` · `GET /patients/{id}/timeline` · `POST /share-codes/redeem` · `POST /patients/{id}/consent-requests` | DOCTOR, NURSE (RECEPTIONIST : recherche exacte, création) | F-CLI-02 à 04, 09 |
| clinique | `POST /patients/{id}/consultations` · `PATCH /consultations/{id}` · `POST /consultations/{id}/validate` · `/addenda` · `/entered-in-error` | DOCTOR | F-CLI-05 à 08 |
| clinique | `POST /visits/{id}/vitals` · `POST /patients/{id}/nursing-notes` · `POST /patients/{id}/immunizations` · `POST /patients/{id}/documents` | NURSE, DOCTOR | F-CLI-11 à 13 |
| urgence | `POST /emergency-access` | DOCTOR, NURSE | F-CLI-10 |
| prescription | `POST /consultations/{id}/prescriptions` · `PUT /prescriptions/{id}/items` · `POST /prescriptions/{id}/checks` · `/sign` · `/cancel` · `/stop` · `/renew` · `GET /prescriptions/{id}/pdf` | DOCTOR | F-PRE-01 à 05 |
| prescription | `GET /public/prescriptions/{number}/verify?k=` | Public | F-PRE-06 |
| pharmacie | `POST /pharmacy/prescriptions/lookup` · `POST /prescriptions/{id}/dispensations` · `POST /dispensations/{id}/cancel` · `GET /pharmacy/dispensations` | PHARMACIST | F-PHA-02 à 04 |
| laboratoire | `POST /consultations/{id}/lab-orders` · `POST /lab/orders/lookup` · `POST /lab/orders/{id}/collect` · `/reject-sample` · `PUT /lab/orders/{id}/results` · `POST /lab/orders/{id}/validate` · `/release` | DOCTOR, LAB_* | F-LAB-01 à 06 |
| terrain | `GET /community/area/snapshot` · `POST /sync/batches` · `GET /sync/changes` | CHW | F-COM-01 à 04, F-COM-08 |
| références communautaires | `GET /community/referrals` · `POST /community/referrals/{id}/status` | DOCTOR, NURSE (établissement destinataire) | F-COM-03, F-CLI-01 |
| pilotage | `GET /analytics/facility` · `GET /analytics/overview` · `GET /analytics/map` · `GET /analytics/trends` · `GET /analytics/alerts` · `POST /analytics/exports` | FACILITY_ADMIN, HEALTH_AUTHORITY | F-PIL-01 à 06 |
| IA | `POST /patients/{id}/ai-summary` · `POST /ai-requests/{id}/feedback` | DOCTOR | F-IA-01 |
| notifications | `GET /notifications` · `POST /notifications/read` · `GET/PUT /me/notification-preferences` | Tous | F-NOT-01, 03 |
| audit | `GET /audit/events` · `GET /audit/anomalies` · `GET /audit/data-requests` · `POST /audit/integrity-check` | AUDITOR | F-AUD-01, 03, 04 |
| audit | `GET /audit/emergencies` · `POST /audit/emergencies/{id}/review` | AUDITOR ; FACILITY_ADMIN (son établissement) | F-AUD-02 |
| admin | `GET/POST/PATCH /admin/facilities` · `POST /admin/practitioners/{id}/approve` · `/reject` · `GET /admin/accounts` · `POST /admin/accounts/{id}/suspend` · `POST /admin/patients/merge` · `GET/PUT /admin/settings` · `GET/PUT /admin/feature-flags` · `/admin/referentials/*` | PLATFORM_ADMIN | F-ADM-01 à 07 |

## 22.5 Façade HL7 FHIR (P1, lecture seule)

La V1 demande la **compatibilité** avec HL7 FHIR. Le MVP expose une **façade en lecture** au format FHIR R4 (`application/fhir+json`) sous `/fhir/r4`, construite **à partir des mêmes services** (donc des mêmes contrôles d'accès et du même audit). L'écriture FHIR et la conformité à un profil national sont **P2**.

| Ressource FHIR | Source BHIP | Correspondances principales |
|---|---|---|
| `Patient` | patients | identifier (health_id, système `https://bhip.bj/fhir/health-id`), name, gender, birthDate, telecom |
| `Practitioner` | users + practitioner_profiles | identifier (numéro d'inscription), name, qualification |
| `Organization` / `Location` | facilities | identifier (id, DHIS2), type, address, position |
| `Encounter` | consultations (+ visits) | status, class, subject, participant, period, serviceProvider, reasonCode |
| `Condition` | diagnoses, conditions | code (CIM-10, système `http://hl7.org/fhir/sid/icd-10`), verificationStatus |
| `Observation` | vital_signs, lab_results | code (LOINC quand disponible, sinon code local), valueQuantity, interpretation, referenceRange |
| `MedicationRequest` | prescription_items | medicationCodeableConcept, dosageInstruction, dispenseRequest |
| `MedicationDispense` | dispensation_items | quantity, whenHandedOver |
| `DiagnosticReport` | lab_order_items + résultats validés | status, result, presentedForm |
| `Immunization` | immunizations | vaccineCode, occurrenceDateTime, lotNumber |
| `AllergyIntolerance` | allergies | code, reaction, verificationStatus |
| `Consent` | consents | status, scope, provision (period, actor) |

**Règles.** **RG-INT-01** — Les identifiants exposés sont **stables** (UUID internes et identifiant santé). **RG-INT-02** — Une ressource `SENSITIVE` porte l'étiquette de sécurité `meta.security` correspondante et n'est renvoyée que selon les règles du chapitre 5. **RG-INT-03** — Un test automatique valide chaque ressource produite contre le schéma FHIR R4 officiel.

## 22.6 Autres échanges

| Partenaire | Objectif | MVP | Plus tard |
|---|---|---|---|
| **DHIS2** (système national d'information sanitaire) | Transmettre les agrégats mensuels | Les codes d'indicateurs et d'établissements prévoient une colonne `external_dhis2_id` | Export des `dataValueSets` via l'API DHIS2 après accord du ministère (P2) |
| **ANIP** (NPI) | Vérifier l'identité, éviter les doublons | Interface `IdentityVerifier` avec implémentation factice | Implémentation réelle après convention et autorisations (P2) |
| **Fournisseur SMS** | Envoyer les SMS | Boîte d'envoi simulée (`OutboxSmsProvider`) | `HttpSmsProvider` configuré (P2) |
| **Fournisseur de modèle IA** | Résumé de dossier | `FakeProvider` + fournisseur réel sur données fictives | Selon autorisations (chapitre 16) |
| **Cartographie** | Fonds de carte et limites | Tuiles OpenStreetMap ; limites administratives (départements, communes) depuis des jeux de données publics ouverts (ex. geoBoundaries, Humanitarian Data Exchange) convertis en GeoJSON simplifié | Limites des zones sanitaires officielles fournies par le ministère |
| **Assurance maladie, établissements privés, programmes de santé** | Échanges futurs | Non | Via FHIR et API partenaires sécurisées (P2) |

- **RG-INT-10** — Tout échange sortant avec un partenaire DOIT être journalisé : émetteur, destinataire, type de donnée, date, contexte (V1, Partie 8 §2).
