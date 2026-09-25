# 21. Modèle de données (PostgreSQL)

## 21.1 Conventions

- Tables au pluriel en `snake_case` ; modèles Prisma au singulier en `PascalCase` avec `@@map`.
- Clé primaire `id uuid` (UUID v7, triable dans le temps) générée par l'application.
- Colonnes `created_at`, `updated_at` (`timestamptz`, UTC) partout ; `created_by` (utilisateur) sur toute donnée métier ; `facility_id` de l'établissement **dans lequel** la donnée a été créée sur toute donnée clinique.
- Trois **schémas** PostgreSQL : `app` (données métier), `audit` (journal, en ajout seul), `analytics` (agrégats sans identifiant patient).
- **Aucune suppression physique** de donnée médicale : statuts (`ENTERED_IN_ERROR`, `RETIRED`, `MERGED`…) à la place.
- Toute colonne utilisée dans un filtre fréquent a un **index** ; toute clé étrangère a un index.

## 21.2 Correspondance avec les entités de la V1

| Entité V1 (Partie 6) | Table(s) V2 |
|---|---|
| Utilisateur | `users` (+ tables d'authentification) |
| Rôle | Enum `role` + `memberships` (affiliations) |
| Patient | `patients`, `patient_identifiers` |
| Professionnel de santé | `practitioner_profiles` + `memberships` |
| Établissement sanitaire | `facilities`, `facility_services` |
| Consultation | `consultations`, `vital_signs`, `diagnoses`, `consultation_addenda` |
| Prescription | `prescriptions`, `prescription_items` |
| Médicament | `medications`, `drug_classes` |
| Examen médical | `lab_orders`, `lab_order_items`, `lab_results` |
| Document médical | `documents` |
| Rendez-vous | `appointments`, `slots`, `schedules`, `visits` |
| Consentement | `consents`, `care_contexts`, `emergency_accesses`, `share_codes` |
| Journal d'audit | `audit.audit_events` |
| Entités analytiques | `analytics.agg_daily_*` |

## 21.3 Historisation (V1 : « toute modification doit être historisée »)

Deux mécanismes, selon la nature de la donnée :

1. **Données cliniques validées** (consultations, ordonnances signées, résultats validés, vaccinations, délivrances, notes de soins) : **immuables**. On ajoute (addendum, nouvelle version de résultat, retrait motivé). Un **déclencheur PostgreSQL** refuse toute mise à jour des colonnes de contenu quand le statut est validé.
2. **Données modifiables** (allergies, maladies chroniques, contacts d'urgence, identité du patient, fiche d'établissement, paramètres) : chaque modification écrit, **dans la même transaction**, une ligne dans `record_versions` : `entity_type`, `entity_id`, `version` (entier croissant), `data` (JSON de l'état **après** modification), `changed_by`, `changed_at`, `reason`.

## 21.4 Identité, comptes et affiliations

**users** — comptes (gérés avec Better Auth)

| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| phone | text | Unique si non nul, format E.164 |
| phone_verified_at | timestamptz | — |
| email | citext | Unique si non nul |
| last_name, first_names | text | Non nuls |
| birth_date | date | Non nul |
| sex | enum `sex` (F, M) | Non nul |
| status | enum (`ACTIVE`, `SUSPENDED`, `CLOSED`) | Défaut `ACTIVE` |
| identity_level | enum (`N0`, `N1`, `N2`, `N3`) | Défaut `N0` |
| failed_login_count, locked_until | int, timestamptz | Anti force brute |
| terms_version, terms_accepted_at | text, timestamptz | Preuve d'acceptation |
| last_login_at | timestamptz | — |

Tables techniques de Better Auth : `sessions` (jeton haché, expiration, adresse IP, agent, **active_membership_id**, **reauth_at**), `accounts` (mot de passe haché), `verifications` (OTP hachés), `two_factors` (secret chiffré, codes de secours hachés).

**memberships** — affiliations (rôle dans un établissement ou une portée)

| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK users |
| role | enum `role` (les 11 rôles du chapitre 4 autres que CITIZEN) | Non nul |
| facility_id | uuid | FK facilities ; obligatoire sauf pour HEALTH_AUTHORITY, AUDITOR, PLATFORM_ADMIN |
| scope_type | enum (`FACILITY`, `NATIONAL`, `DEPARTMENT`, `HEALTH_ZONE`) | Non nul |
| scope_id | text | Code du département ou de la zone si applicable |
| status | enum (`INVITED`, `ACTIVE`, `SUSPENDED`, `ENDED`) | — |
| service_ids | uuid[] | Services de l'établissement concernés |
| starts_at, ends_at | timestamptz | — |
| invited_by, suspended_reason | uuid, text | — |
| | | Unique (user_id, role, facility_id) pour les statuts non terminés |

**practitioner_profiles** — `user_id` (unique), `profession` (médecin, infirmier, sage-femme, technicien de laboratoire, biologiste, pharmacien, agent communautaire…), `specialty`, `registration_number` (unique par profession), `card_document_id`, `validation_status` (`PENDING_VALIDATION`, `VALIDATED`, `REJECTED`, `INFO_REQUESTED`), `validated_by`, `validated_at`, `rejection_reason`, `show_publicly` (booléen).

**invitations** — `token_hash` (unique), `facility_id`, `role`, `phone` ou `email`, `invited_by`, `expires_at`, `used_at`, `revoked_at`.

## 21.5 Patients

**patients**

| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| health_id | text | Unique, format section 18.2 |
| user_id | uuid | FK users, **unique** si non nul (compte rattaché, base SELF) |
| last_name, first_names, sex | text, text, enum | Non nuls |
| birth_date, birth_date_approximate | date, boolean | — |
| phone | text | E.164, facultatif |
| residence_commune_code, residence_locality | text, text | — |
| blood_group | enum (A+, A−, B+, B−, AB+, AB−, O+, O−, UNKNOWN) | — |
| blood_group_source | enum (`DECLARED`, `CONFIRMED`) | — |
| identity_level | enum N0–N3 | — |
| status | enum (`ACTIVE`, `MERGED`, `DECEASED`) | — |
| merged_into_id | uuid | FK patients |
| claim_code_hash, claim_code_expires_at, claim_attempts | text, timestamptz, int | F-AUTH-03 |
| created_by, created_in_facility_id | uuid, uuid | — |
| search_name | text | Nom + prénoms sans accents, en minuscules ; index trigrammes |

Index : `health_id` unique ; (`phone`, `birth_date`) ; trigrammes sur `search_name`.

**patient_identifiers** — `patient_id`, `type` (`NPI`, `DHIS2_TEI`, `OTHER`), `value_encrypted`, `value_hash` (pour la recherche de doublons), `value_last4`, `verified_at`, `verified_by`. Unique (`type`, `value_hash`).

**guardianships** — `guardian_patient_id` (le tuteur, via son dossier), `dependent_patient_id`, `relationship` (`MOTHER`, `FATHER`, `LEGAL_GUARDIAN`, `CAREGIVER`), `status` (`DECLARED`, `VERIFIED`, `ENDED`), `verified_by`, `verified_at`, `proof_type`, `ended_reason`.

**allergies** — `patient_id`, `substance_type` (`DRUG`, `DRUG_CLASS`, `FOOD`, `OTHER`), `substance_code` (DCI ou classe du référentiel), `substance_label`, `reaction` (liste), `severity` (`MILD`, `MODERATE`, `SEVERE`, `UNKNOWN`), `source` (`DECLARED`, `CONFIRMED`), `status` (`ACTIVE`, `RETIRED`), `recorded_by`.

**conditions** (maladies chroniques et antécédents) — `patient_id`, `icd10_code`, `label`, `onset_year`, `source`, `status`, `sensitive` (booléen calculé depuis le code), `recorded_by`.

**emergency_contacts** — `patient_id`, `name`, `relationship`, `phone` (3 maximum par patient).

**pregnancies** — `patient_id`, `lmp_date` (date des dernières règles), `expected_due_date` (calculée), `status` (`ACTIVE`, `ENDED`), `end_reason`, `source` (`DECLARED`, `CONFIRMED`), `recorded_by`. Renseignée par un `DOCTOR` ou un `NURSE` (section « Suites » ou antécédents de la consultation, F-CLI-06) ou déclarée par la patiente ; utilisée par le contrôle « grossesse » de F-PRE-02 et affichée dans le résumé (F-CLI-04).

## 21.6 Accès et consentement

| Table | Colonnes principales | Contraintes |
|---|---|---|
| `consents` | patient_id, grantee_type (`PRACTITIONER`, `FACILITY`), grantee_user_id, grantee_facility_id, level (`SUMMARY`, `FULL`, `FULL_SENSITIVE`), starts_at, ends_at, channel (`APP`, `QR`, `SMS_OTP`, `DESK`), proof (jsonb), status (`ACTIVE`, `REVOKED`, `EXPIRED`), revoked_at, granted_by_user_id | CHECK ends_at ≤ starts_at + 12 mois ; CHECK `FULL_SENSITIVE` ⇒ grantee_type = `PRACTITIONER` |
| `consent_requests` | patient_id, requester_user_id, facility_id, requested_level, status (`PENDING`, `ACCEPTED`, `REFUSED`, `EXPIRED`) | Expire après 7 jours |
| `care_contexts` | patient_id, facility_id, visit_id, level (`SUMMARY`, `FULL`), verification_method (`QR`, `SMS_OTP`, `ID_DOCUMENT`), id_document_type, opened_by, opened_at, closes_at, closed_at | Index (patient_id, facility_id, closes_at) |
| `emergency_accesses` | patient_id, user_id, membership_id, reason_code, justification, opened_at, expires_at, review_status (`PENDING`, `COMPLIANT`, `NON_COMPLIANT`), reviewed_by, reviewed_at, review_comment | CHECK length(justification) ≥ 20 |
| `share_codes` | patient_id, code_hash, level, duration, expires_at, used_at, used_by | Usage unique |
| `health_card_tokens` | patient_id, nonce, expires_at, used_at, used_by | QR de carte santé |

## 21.7 Établissements, agendas et rendez-vous

| Table | Colonnes principales |
|---|---|
| `facilities` | name, acronym, type, level, sector, department_code, commune_code, arrondissement_code, health_zone_code, locality, address, **location geography(Point, 4326)** (index GIST), phone, email, external_dhis2_id, status, parent_facility_id, opening_hours (jsonb), beds, equipment (jsonb), settings (jsonb : délai de réservation, confirmation…) |
| `facility_services` | facility_id, service_code, online_booking (booléen), confirmation_mode (`AUTO`, `MANUAL`), active |
| `schedules` | facility_id, service_code, practitioner_user_id (facultatif), weekdays (int[]), start_time, end_time, slot_minutes, capacity, valid_from, valid_to, active |
| `slots` | schedule_id, facility_id, service_code, practitioner_user_id, starts_at, ends_at, capacity, **booked** (int), blocked (booléen), block_reason — CHECK booked ≤ capacity ; unique (schedule_id, starts_at) |
| `closures` | facility_id, service_code (facultatif), starts_on, ends_on, reason |
| `appointments` | reference (`AP-…`), patient_id, booked_by_user_id, facility_id, service_code, slot_id, practitioner_user_id, starts_at, reason_code, reason_text, status (figure 9.1), status_reason, reschedule_count, created_channel (`APP`, `DESK`) |
| `appointment_events` | appointment_id, from_status, to_status, actor_id, reason, at (historique des transitions) |
| `visits` | patient_id, facility_id, service_code, appointment_id, status (`ARRIVED`, `IN_CARE`, `COMPLETED`, `LEFT_WITHOUT_CARE`), arrived_at, care_started_at, completed_at, triage_priority, care_context_id — unique partiel : une seule visite ouverte par (patient, établissement) |

## 21.8 Clinique

| Table | Colonnes principales | Règles en base |
|---|---|---|
| `consultations` | patient_id, facility_id, visit_id, appointment_id, author_user_id, status (figure 10.1), started_at, validated_at, reason_code, reason_text, history, symptoms (text[]), clinical_exam, **private_notes**, conclusion, follow_up_date, sensitive (booléen), content_hash, late_validation (booléen), error_reason | Déclencheur : aucune modification de contenu si status ≠ `DRAFT` ; unique partiel (patient_id, author_user_id) où status = `DRAFT` |
| `vital_signs` | patient_id, consultation_id ou visit_id, measured_at, measured_by, temperature_c, pulse_bpm, systolic_mmhg, diastolic_mmhg, respiratory_rate, spo2_pct, weight_kg, height_cm, glucose_gl, bmi (calculé), alerts (text[]) | CHECK des plages acceptées (F-CLI-06) |
| `diagnoses` | consultation_id, icd10_code, rank (`PRIMARY`, `SECONDARY`), certainty (`CONFIRMED`, `SUSPECTED`), corrected_by_addendum_id | Un seul `PRIMARY` actif par consultation |
| `consultation_addenda` | consultation_id, author_user_id, reason_code, text, corrected_primary_icd10, created_at | Immuable |
| `immunizations` | patient_id, vaccine_code, dose_number, administered_on, lot_number, site, route, location_type (`FACILITY`, `CAMPAIGN`, `OUTREACH`), campaign_id, facility_id, administered_by, source (`FACILITY`, `COMMUNITY_SYNC`), client_uuid, status (`VALID`, `ENTERED_IN_ERROR`) | Unique (client_uuid) si non nul |
| `nursing_notes` | patient_id, visit_id, author_user_id, text, created_at, status | Immuable |
| `documents` | patient_id, type, title, document_date, storage_key, mime_type, size_bytes, sha256, sensitive, consultation_id, uploaded_by, facility_id, status (`ACTIVE`, `ENTERED_IN_ERROR`) | — |
| `referrals` (P2) | patient_id, from_facility_id, to_facility_id, reason, urgency, summary, status, counter_referral | — |

## 21.9 Prescription, pharmacie, laboratoire

| Table | Colonnes principales | Règles |
|---|---|---|
| `prescriptions` | number (`RX-…`), consultation_id, patient_id, prescriber_user_id, facility_id, status (figure 11.1), signed_at, valid_until, content_hash, verify_token_hash, patient_weight_kg, cancel_reason | Déclencheur d'immuabilité après signature sur les colonnes de **contenu** ; restent modifiables : `status`, `cancel_reason` et, dans `prescription_items`, `quantity_dispensed` (délivrances et annulations RG-PHA-13) |
| `prescription_items` | prescription_id, position, medication_id (ou free_text), dose, dose_unit, route, frequency_type, frequency_value, max_per_24h, moments (text[]), duration_days, long_term, quantity_prescribed, **quantity_dispensed**, instructions, non_substitutable, non_substitutable_reason, readable_text, alert_overrides (jsonb) | CHECK quantity_dispensed ≤ quantity_prescribed |
| `dispensations` | prescription_id, pharmacy_facility_id, pharmacist_user_id, dispensed_at, cancelled_at, cancel_reason | — |
| `dispensation_items` | dispensation_id, prescription_item_id, quantity, medication_id_dispensed, substituted, not_dispensed_reason, lot_number, expiry_date | — |
| `lab_orders` | number (`LB-…`), consultation_id, patient_id, prescriber_user_id, target_lab_facility_id (nul = au choix), assigned_lab_facility_id, urgency, clinical_info, verify_token_hash, status (`OPEN`, `COMPLETED`, `CANCELLED`, `EXPIRED`, **dérivé** des statuts des items ; ce sont les items qui suivent la figure 12.1) | — |
| `lab_order_items` | lab_order_id, lab_test_code, status, sensitive, announce_required, announced_at, announced_by, sample_type, sample_id, collected_at, collected_by, rejected_reason | — |
| `lab_results` | lab_order_item_id, version, parameter_code, value_numeric, value_text, unit, reference_low, reference_high, flag (`N`, `L`, `H`, `LL`, `HH`), comment, entered_by, entered_at, validated_by, validated_at, correction_reason, document_id | Unique (lab_order_item_id, parameter_code, version) |

## 21.10 Communautaire, notifications, IA, référentiels, système

| Table | Colonnes principales |
|---|---|
| `community_areas` | facility_id (centre de santé), name, localities (text[]), chw_user_id |
| `community_visits` | client_uuid (unique), patient_id, chw_user_id, area_id, visit_type, answers (jsonb), questionnaire_version, danger_signs (text[]), referral_created, local_created_at, received_at |
| `community_referrals` | visit_id, patient_id, to_facility_id, reason, urgency, status (`OPEN`, `SEEN`, `CLOSED`), seen_by, closed_by |
| `campaigns` | name, vaccine_code, target_age_min, target_age_max, area_ids, starts_on, ends_on (référencée par `immunizations.campaign_id`) |
| `duplicate_candidates` | patient_a_id, patient_b_id, score, origin (`FORCED_CREATION`, `SYNC_REVIEW`, `REPORT`), status (`PENDING`, `MERGED`, `NOT_DUPLICATE`), decided_by, decided_at |
| `health_alert_reviews` | alert_id (ligne de `analytics.agg_weekly_alerts`), status (`NEW`, `ACKNOWLEDGED`, `CLOSED`), comment, reason, reviewed_by, reviewed_at — écrite par le service analytics avec le rôle applicatif |
| `child_growth` (P2), tables de suivi de grossesse communautaire (P2) | Prévues pour F-COM-05 et F-COM-06, non créées dans le MVP |
| `sync_batches` / `sync_items` | batch : user_id, device_id, idempotency_key, received_at, counts ; item : client_uuid, type, status (`ACCEPTED`, `DUPLICATE`, `REVIEW`, `REJECTED`), message |
| `notifications` | user_id, membership_id (espace ; nul = citoyen), code, title, body, link, priority, read_at, created_at |
| `notification_preferences` | user_id, category, sms (booléen), email (booléen) |
| `sms_outbox` | to_phone, text, category, template_code, status (`QUEUED`, `SIMULATED`, `SENT`, `FAILED`), attempts, provider_ref, send_after, sent_at |
| `ai_requests` | user_id, patient_id, feature, model, prompt_version, sources_count, removed_bullets, latency_ms, feedback, created_at (texte non conservé au-delà de 30 jours) |
| `record_versions` | entity_type, entity_id, version, data (jsonb), changed_by, changed_at, reason |
| Référentiels | `geo_departments`, `geo_communes`, `geo_arrondissements`, `geo_health_zones` (avec géométries simplifiées), `services`, `icd10_codes` (code, label, patient_label, disease_group, sensitive, active), `drug_classes`, `medications`, `allergy_class_map`, `lab_tests`, `lab_test_parameters`, `vaccines`, `vaccine_schedule`, `appointment_reasons`, `questionnaires`, `holidays`, `referential_versions` |
| Système | `settings` (key, value, default, min, max, description), `feature_flags` (key, enabled, description), `data_requests` (F-CIT-13), `merge_operations` (F-ADM-06), `pending_admin_actions` (quatre yeux, RG-ADM-30) |

## 21.11 Schéma `audit`

**audit.audit_events** : id (bigint, séquence), occurred_at, request_id, actor_user_id, membership_id, role, facility_id, action, patient_id, patient_health_id, resource_type, resource_id, data_category, access_basis, access_basis_id, reason, result (`ALLOWED`, `DENIED`), deny_code, ip, user_agent, prev_hash, hash.

- **RG-DB-01** — L'utilisateur de base de données de l'application a uniquement le droit `INSERT` et `SELECT` sur `audit.audit_events` ; **`UPDATE` et `DELETE` sont révoqués** et un déclencheur les refuse de toute façon.
- **RG-DB-02** — `hash` = SHA-256(`prev_hash` + contenu canonique de la ligne) ; le calcul est fait dans une fonction SQL appelée à l'insertion, sous verrou, pour garantir l'ordre.
- **RG-DB-03** — Partitionnement mensuel de la table (P1) pour conserver de bonnes performances.

**audit.anomalies** : rule_code, actor_user_id, facility_id, detected_at, details (jsonb), status (`NEW`, `REVIEWED`, `CLOSED`), reviewed_by, reviewed_at (F-AUD-03).

## 21.12 Schéma `analytics`

| Table | Grain | Colonnes |
|---|---|---|
| `agg_daily_facility_indicator` | jour × établissement × indicateur × sexe × tranche d'âge | day, facility_id, department_code, health_zone_code, commune_code, facility_type, indicator_code, sex, age_group, value, computed_at |
| `agg_daily_disease` | jour × établissement × groupe de maladies × sexe × tranche d'âge | day, facility_id, territoires…, disease_group, sensitive, sex, age_group, cases, confirmed_cases, computed_at |
| `agg_daily_immunization` | jour × lieu × vaccin × dose × tranche d'âge | … |
| `agg_weekly_alerts` | semaine × zone × groupe | expected_mean, stddev, observed, status |
| `population` (P1) | commune × année × sexe × tranche d'âge | Dénominateurs pour les taux (source officielle à charger) |

- **RG-DB-10** — Le rôle `analytics_reader` a `SELECT` sur le schéma `analytics` **uniquement** (RG-PIL-04).
