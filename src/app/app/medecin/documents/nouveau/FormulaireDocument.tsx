"use client";

import { useActionState, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { ajouterDocumentAction, type DocumentActionState } from "@/modules/document/actions";
import { OPTIONS_NIVEAU_CONFIDENTIALITE, OPTIONS_TYPE_DOCUMENT } from "@/modules/document/types-documents";
import { ModalNouveauPatient, type PatientCree } from "@/app/app/medecin/patients/ModalNouveauPatient";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: DocumentActionState = { error: null, success: false };

export interface PatientPourSelection {
  patientId: string;
  nomComplet: string;
  identifiantSante: string;
}

export interface ConsultationPourSelection {
  id: string;
  patientId: string;
  date: string;
  motif: string;
}

export interface FormulaireDocumentProps {
  patients: PatientPourSelection[];
  consultations: ConsultationPourSelection[];
  /** PatientId a pre-selectionner (arrivee depuis une consultation ou la fiche patient). Chaine vide sinon. */
  patientIdPreselectionne: string;
  /** ConsultationId a pre-selectionner. Chaine vide si aucune (le lien est facultatif, RG-CLI-111). */
  consultationIdPreselectionnee: string;
}

const OPTIONS_TYPE = OPTIONS_TYPE_DOCUMENT.map((option) => ({ value: option.valeur, label: option.libelle }));
const OPTIONS_NIVEAU = OPTIONS_NIVEAU_CONFIDENTIALITE.map((option) => ({
  value: option.valeur,
  label: option.libelle,
}));

function dateDuJour(): string {
  return new Date().toISOString().slice(0, 10);
}

function formaterDateConsultation(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

/**
 * Formulaire d'ajout d'un document medical (F-CLI-13 du pack) : patient et
 * consultation liee (facultative) choisis dans des selecteurs (meme source
 * que /app/medecin/examens/nouvelle - getPatientsAvecConsentement et
 * getConsultationsDuProfessionnel), le fichier etant transmis directement en
 * FormData a ajouterDocumentAction. RG-CLI-110 (format reel, taille) est
 * verifie exclusivement cote serveur : ce formulaire ne fait qu'indiquer les
 * formats attendus a titre d'aide, jamais une garantie.
 */
export function FormulaireDocument({
  patients: patientsInitiaux,
  consultations,
  patientIdPreselectionne,
  consultationIdPreselectionnee,
}: FormulaireDocumentProps) {
  const [state, formAction, pending] = useActionState(ajouterDocumentAction, etatInitial);
  const [patients, setPatients] = useState(patientsInitiaux);
  const [patientId, setPatientId] = useState(patientIdPreselectionne);
  const [consultationId, setConsultationId] = useState(consultationIdPreselectionnee);
  const [nomFichierSelectionne, setNomFichierSelectionne] = useState("");

  const optionsPatients = patients.map((patient) => ({
    value: patient.patientId,
    label: `${patient.nomComplet} (${patient.identifiantSante})`,
  }));

  const consultationsDuPatient = consultations.filter(
    (consultation) => consultation.patientId === patientId
  );

  const optionsConsultations = consultationsDuPatient.map((consultation) => ({
    value: consultation.id,
    label: `${formaterDateConsultation(consultation.date)} : ${consultation.motif || "Consultation"}`,
  }));

  function handlePatientCree(patient: PatientCree) {
    setPatients((actuels) => [
      { patientId: patient.patientId, nomComplet: patient.nomComplet, identifiantSante: patient.identifiantSante },
      ...actuels,
    ]);
    setPatientId(patient.patientId);
    setConsultationId("");
  }

  function handleChangementPatient(event: ChangeEvent<HTMLSelectElement>) {
    const nouveauPatientId = event.target.value;
    setPatientId(nouveauPatientId);
    const consultationEncoreValide = consultations.some(
      (consultation) => consultation.id === consultationId && consultation.patientId === nouveauPatientId
    );
    if (!consultationEncoreValide) {
      setConsultationId("");
    }
  }

  function handleChangementFichier(event: ChangeEvent<HTMLInputElement>) {
    setNomFichierSelectionne(event.target.files?.[0]?.name ?? "");
  }

  const erreurConsentement =
    state.error !== null && state.error.toLowerCase().includes("consentement");

  if (state.success) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert level="success" title="Document ajoute">
            Le document a bien ete ajoute au dossier du patient.
          </Alert>
          <div className="flex flex-wrap gap-3">
            {patientId ? (
              <Link
                href={`/app/medecin/patients/${patientId}`}
                className="text-[13px] font-semibold text-accent hover:underline"
              >
                Retour a la fiche du patient
              </Link>
            ) : null}
            <Link
              href="/app/medecin/documents/nouveau"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Ajouter un autre document
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Nouveau document"
      description="Renseignez le patient, le type de document et televersez le fichier."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-6">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="consultationId" value={consultationId} />

        {state.error ? (
          erreurConsentement ? (
            <Alert level="warning" title="Consentement necessaire">
              {state.error}
            </Alert>
          ) : (
            <Alert level="critical" title="Document non ajoute">
              {state.error}
            </Alert>
          )
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <SelectField
                label="Patient"
                required
                options={optionsPatients}
                placeholder="Choisir un patient"
                value={patientId}
                onChange={handleChangementPatient}
              />
            </div>
            <ModalNouveauPatient onPatientCree={handlePatientCree} libelleBouton="Ajouter un patient" />
          </div>
          {patients.length === 0 ? (
            <p className="text-[13px] text-encre-attenuee">
              Aucun patient ne vous a encore accorde d&apos;acces a son
              dossier. Utilisez « Ajouter un patient » pour un patient qui se
              presente sans compte.
            </p>
          ) : null}
        </div>

        <SelectField
          label="Consultation liee"
          options={optionsConsultations}
          placeholder="Aucune (facultatif)"
          value={consultationId}
          onChange={(event) => setConsultationId(event.target.value)}
          hint={
            patientId && consultationsDuPatient.length === 0
              ? "Ce patient n'a pas encore de consultation enregistree."
              : undefined
          }
        />

        <SelectField label="Type de document" name="type" required options={OPTIONS_TYPE} placeholder="Choisir un type" />

        <TextField
          label="Titre"
          name="titre"
          required
          maxLength={200}
          placeholder="Ex. Compte rendu d'hospitalisation"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Date du document"
            name="dateDocument"
            type="date"
            required
            defaultValue={dateDuJour()}
            max={dateDuJour()}
          />
          <SelectField
            label="Niveau de confidentialite"
            name="niveauConfidentialite"
            required
            options={OPTIONS_NIVEAU}
            defaultValue="normal"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="fichier"
            className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
          >
            Fichier
            <span className="text-critique" aria-hidden="true">
              *
            </span>
          </label>
          <p className="text-[13px] text-encre-secondaire">PDF, JPEG ou PNG, 10 Mo maximum.</p>
          <input
            id="fichier"
            name="fichier"
            type="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={handleChangementFichier}
            className="block w-full text-[14px] text-encre file:mr-3 file:h-9 file:cursor-pointer file:rounded-champ file:border file:border-bordure-forte file:bg-surface file:px-3 file:text-[13px] file:font-semibold file:text-encre hover:file:bg-surface-appui"
          />
          {nomFichierSelectionne ? (
            <p className="text-[13px] text-encre-secondaire">Fichier selectionne : {nomFichierSelectionne}</p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" className="w-fit" disabled={pending || !patientId}>
          {pending ? "Envoi en cours..." : "Ajouter le document"}
        </Button>
      </form>
    </Card>
  );
}
