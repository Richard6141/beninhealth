-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'actif',
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereConnexion" TIMESTAMP(3),
    "avatarUrl" TEXT,
    "mfaSecret" TEXT,
    "mfaActif" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtablissementSanitaire" (
    "id" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "localisation" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "servicesDisponibles" TEXT NOT NULL DEFAULT '[]',
    "capacite" INTEGER NOT NULL,

    CONSTRAINT "EtablissementSanitaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionnelSante" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialite" TEXT NOT NULL,
    "numeroProfessionnel" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "statutValidation" TEXT NOT NULL DEFAULT 'en_attente',

    CONSTRAINT "ProfessionnelSante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identifiantSante" TEXT NOT NULL,
    "referenceIdentiteNationale" TEXT,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "sexe" TEXT NOT NULL,
    "groupeSanguin" TEXT NOT NULL DEFAULT 'inconnu',
    "contactsUrgence" TEXT NOT NULL DEFAULT '[]',
    "allergies" TEXT NOT NULL DEFAULT '[]',
    "antecedents" TEXT NOT NULL DEFAULT '[]',
    "maladiesChroniques" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consentement" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "acteurAutoriseId" TEXT NOT NULL,
    "typeAcces" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "statut" TEXT NOT NULL DEFAULT 'actif',

    CONSTRAINT "Consentement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RendezVous" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "professionnelId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "motif" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'demande',
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RendezVous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionnelId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "rendezVousId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT NOT NULL DEFAULT '',
    "symptomes" TEXT NOT NULL DEFAULT '[]',
    "temperatureCelsius" DOUBLE PRECISION,
    "pouls" INTEGER,
    "tensionSystolique" INTEGER,
    "tensionDiastolique" INTEGER,
    "frequenceRespiratoire" INTEGER,
    "saturationOxygene" INTEGER,
    "poidsKg" DOUBLE PRECISION,
    "tailleCm" DOUBLE PRECISION,
    "glycemieGL" DOUBLE PRECISION,
    "observations" TEXT NOT NULL DEFAULT '',
    "conclusion" TEXT NOT NULL DEFAULT '',
    "statut" TEXT NOT NULL DEFAULT 'brouillon',
    "dateValidation" TIMESTAMP(3),
    "empreinteContenu" TEXT,
    "saisieParErreur" BOOLEAN NOT NULL DEFAULT false,
    "motifRetrait" TEXT,
    "dateRetrait" TIMESTAMP(3),

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddendumConsultation" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddendumConsultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamenMedical" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "demandeurId" TEXT NOT NULL,
    "laboratoireId" TEXT NOT NULL,
    "consultationId" TEXT,
    "typeExamen" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'demande',
    "resultat" TEXT,
    "dateResultat" TIMESTAMP(3),
    "saisiParId" TEXT,
    "valideParId" TEXT,
    "dateValidation" TIMESTAMP(3),
    "empreinteResultat" TEXT,
    "commentaireValidation" TEXT,
    "sensible" BOOLEAN NOT NULL DEFAULT false,
    "resultatAnnonceAuPatient" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExamenMedical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuiviCommunautaire" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "patientId" TEXT,
    "beneficiaireNom" TEXT NOT NULL,
    "typeVisite" TEXT NOT NULL,
    "dateVisite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localisation" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuiviCommunautaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medicament" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "principeActif" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "forme" TEXT NOT NULL,
    "classeTherapeutique" TEXT NOT NULL DEFAULT '',
    "informationsComplementaires" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Medicament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "medecinPrescripteurId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'validee',
    "instructions" TEXT NOT NULL DEFAULT '',
    "numero" TEXT NOT NULL,
    "empreinteContenu" TEXT NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LignePrescription" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicamentId" TEXT NOT NULL,
    "posologie" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "dureeTraitementJours" INTEGER NOT NULL,
    "nonSubstituable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LignePrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivrance" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "pharmacienId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annulee" BOOLEAN NOT NULL DEFAULT false,
    "motifAnnulation" TEXT,
    "dateAnnulation" TIMESTAMP(3),

    CONSTRAINT "Delivrance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneDelivrance" (
    "id" TEXT NOT NULL,
    "delivranceId" TEXT NOT NULL,
    "lignePrescriptionId" TEXT NOT NULL,
    "quantiteDelivree" INTEGER NOT NULL,
    "medicamentDelivreId" TEXT,
    "motifNonDelivrance" TEXT,
    "numeroLot" TEXT,
    "datePeremption" TIMESTAMP(3),

    CONSTRAINT "LigneDelivrance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvenementPrescription" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateurId" TEXT NOT NULL,
    "commentaire" TEXT,

    CONSTRAINT "EvenementPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeVerificationEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "consommeLe" TIMESTAMP(3),

    CONSTRAINT "CodeVerificationEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalAudit" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "donneeConcernee" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adresseTechnique" TEXT NOT NULL,
    "justification" TEXT NOT NULL,

    CONSTRAINT "JournalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevueAccesUrgence" (
    "id" TEXT NOT NULL,
    "journalAuditId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "commentaire" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevueAccesUrgence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "lien" TEXT,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vaccination" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionnelId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "vaccin" TEXT NOT NULL,
    "numeroDose" INTEGER NOT NULL,
    "dateAdministration" TIMESTAMP(3) NOT NULL,
    "numeroLot" TEXT NOT NULL,
    "siteInjection" TEXT NOT NULL,
    "voie" TEXT NOT NULL,
    "saisieParErreur" BOOLEAN NOT NULL DEFAULT false,
    "motifRetrait" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vaccination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentMedical" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "consultationId" TEXT,
    "type" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "dateDocument" TIMESTAMP(3) NOT NULL,
    "niveauConfidentialite" TEXT NOT NULL DEFAULT 'normal',
    "cheminFichier" TEXT NOT NULL,
    "nomFichierOriginal" TEXT NOT NULL,
    "typeMime" TEXT NOT NULL,
    "tailleOctets" INTEGER NOT NULL,
    "retirePourErreur" BOOLEAN NOT NULL DEFAULT false,
    "motifRetrait" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentMedical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriseEnChargeInfirmiere" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "infirmierId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "prioriteTri" TEXT NOT NULL,
    "temperatureCelsius" DOUBLE PRECISION,
    "pouls" INTEGER,
    "tensionSystolique" INTEGER,
    "tensionDiastolique" INTEGER,
    "frequenceRespiratoire" INTEGER,
    "saturationOxygene" INTEGER,
    "poidsKg" DOUBLE PRECISION,
    "tailleCm" DOUBLE PRECISION,
    "glycemieGL" DOUBLE PRECISION,
    "noteSoins" TEXT NOT NULL DEFAULT '',
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "consultationRattacheeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriseEnChargeInfirmiere_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_nom_key" ON "UserRole"("userId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "EtablissementSanitaire_identifiant_key" ON "EtablissementSanitaire"("identifiant");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionnelSante_userId_key" ON "ProfessionnelSante"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionnelSante_numeroProfessionnel_key" ON "ProfessionnelSante"("numeroProfessionnel");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_identifiantSante_key" ON "Patient"("identifiantSante");

-- CreateIndex
CREATE UNIQUE INDEX "Consentement_patientId_acteurAutoriseId_key" ON "Consentement"("patientId", "acteurAutoriseId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_rendezVousId_key" ON "Consultation"("rendezVousId");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_numero_key" ON "Prescription"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "RevueAccesUrgence_journalAuditId_key" ON "RevueAccesUrgence"("journalAuditId");

-- CreateIndex
CREATE UNIQUE INDEX "PriseEnChargeInfirmiere_consultationRattacheeId_key" ON "PriseEnChargeInfirmiere"("consultationRattacheeId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionnelSante" ADD CONSTRAINT "ProfessionnelSante_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionnelSante" ADD CONSTRAINT "ProfessionnelSante_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consentement" ADD CONSTRAINT "Consentement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consentement" ADD CONSTRAINT "Consentement_acteurAutoriseId_fkey" FOREIGN KEY ("acteurAutoriseId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RendezVous" ADD CONSTRAINT "RendezVous_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RendezVous" ADD CONSTRAINT "RendezVous_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RendezVous" ADD CONSTRAINT "RendezVous_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_rendezVousId_fkey" FOREIGN KEY ("rendezVousId") REFERENCES "RendezVous"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumConsultation" ADD CONSTRAINT "AddendumConsultation_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumConsultation" ADD CONSTRAINT "AddendumConsultation_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamenMedical" ADD CONSTRAINT "ExamenMedical_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamenMedical" ADD CONSTRAINT "ExamenMedical_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamenMedical" ADD CONSTRAINT "ExamenMedical_laboratoireId_fkey" FOREIGN KEY ("laboratoireId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamenMedical" ADD CONSTRAINT "ExamenMedical_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamenMedical" ADD CONSTRAINT "ExamenMedical_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "ProfessionnelSante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamenMedical" ADD CONSTRAINT "ExamenMedical_valideParId_fkey" FOREIGN KEY ("valideParId") REFERENCES "ProfessionnelSante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiviCommunautaire" ADD CONSTRAINT "SuiviCommunautaire_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiviCommunautaire" ADD CONSTRAINT "SuiviCommunautaire_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiviCommunautaire" ADD CONSTRAINT "SuiviCommunautaire_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_medecinPrescripteurId_fkey" FOREIGN KEY ("medecinPrescripteurId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LignePrescription" ADD CONSTRAINT "LignePrescription_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LignePrescription" ADD CONSTRAINT "LignePrescription_medicamentId_fkey" FOREIGN KEY ("medicamentId") REFERENCES "Medicament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivrance" ADD CONSTRAINT "Delivrance_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivrance" ADD CONSTRAINT "Delivrance_pharmacienId_fkey" FOREIGN KEY ("pharmacienId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivrance" ADD CONSTRAINT "Delivrance_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneDelivrance" ADD CONSTRAINT "LigneDelivrance_delivranceId_fkey" FOREIGN KEY ("delivranceId") REFERENCES "Delivrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneDelivrance" ADD CONSTRAINT "LigneDelivrance_lignePrescriptionId_fkey" FOREIGN KEY ("lignePrescriptionId") REFERENCES "LignePrescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneDelivrance" ADD CONSTRAINT "LigneDelivrance_medicamentDelivreId_fkey" FOREIGN KEY ("medicamentDelivreId") REFERENCES "Medicament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvenementPrescription" ADD CONSTRAINT "EvenementPrescription_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvenementPrescription" ADD CONSTRAINT "EvenementPrescription_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeVerificationEmail" ADD CONSTRAINT "CodeVerificationEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalAudit" ADD CONSTRAINT "JournalAudit_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevueAccesUrgence" ADD CONSTRAINT "RevueAccesUrgence_journalAuditId_fkey" FOREIGN KEY ("journalAuditId") REFERENCES "JournalAudit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevueAccesUrgence" ADD CONSTRAINT "RevueAccesUrgence_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentMedical" ADD CONSTRAINT "DocumentMedical_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentMedical" ADD CONSTRAINT "DocumentMedical_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentMedical" ADD CONSTRAINT "DocumentMedical_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriseEnChargeInfirmiere" ADD CONSTRAINT "PriseEnChargeInfirmiere_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriseEnChargeInfirmiere" ADD CONSTRAINT "PriseEnChargeInfirmiere_infirmierId_fkey" FOREIGN KEY ("infirmierId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriseEnChargeInfirmiere" ADD CONSTRAINT "PriseEnChargeInfirmiere_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriseEnChargeInfirmiere" ADD CONSTRAINT "PriseEnChargeInfirmiere_consultationRattacheeId_fkey" FOREIGN KEY ("consultationRattacheeId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
