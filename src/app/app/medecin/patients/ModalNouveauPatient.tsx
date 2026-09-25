"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import {
  creerPatientParProfessionnelAction,
  type CreationPatientActionState,
} from "@/modules/identity/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: CreationPatientActionState = { error: null, success: false };

const OPTIONS_SEXE = [
  { value: "F", label: "Féminin" },
  { value: "M", label: "Masculin" },
];

export interface PatientCree {
  patientId: string;
  identifiantSante: string;
  nomComplet: string;
}

export interface ModalNouveauPatientProps {
  /** Appele avec le patient nouvellement cree, pour le selectionner immediatement dans l'ecran appelant. */
  onPatientCree?: (patient: PatientCree) => void;
  /** Libelle du bouton d'ouverture ; par defaut "Ajouter un patient". */
  libelleBouton?: string;
}

/**
 * Modal de creation rapide d'un dossier patient "sans compte" (F-CLI-03 du
 * pack), pour un patient qui se presente sans avoir encore de compte sur la
 * plateforme. Verification de doublon obligatoire avant creation
 * (RG-CLI-20) : une premiere soumission peut renvoyer un candidat (initiales,
 * annee de naissance, sexe, telephone masque uniquement) qu'il faut confirmer
 * explicitement avec une justification pour continuer.
 */
export function ModalNouveauPatient({ onPatientCree, libelleBouton }: ModalNouveauPatientProps) {
  const modalRef = useRef<ModalHandle>(null);
  const [state, formAction, pending] = useActionState(creerPatientParProfessionnelAction, etatInitial);
  const [confirmerDoublon, setConfirmerDoublon] = useState(false);

  // Notifie l'ecran appelant et ferme la modale une seule fois par creation
  // reussie (pas a chaque re-rendu) : effet declenche par le changement de
  // patientId, jamais un appel direct pendant le rendu (interdit quand
  // onPatientCree met a jour l'etat d'un composant ancetre).
  useEffect(() => {
    if (state.success && state.patientId && state.identifiantSante) {
      onPatientCree?.({
        patientId: state.patientId,
        identifiantSante: state.identifiantSante,
        nomComplet: state.nomComplet ?? "",
      });
      modalRef.current?.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.patientId]);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => modalRef.current?.showModal()}>
        <UserPlus size={16} aria-hidden="true" className="mr-1.5" />
        {libelleBouton ?? "Ajouter un patient"}
      </Button>
      <Modal
        ref={modalRef}
        title="Nouveau patient"
        description="Pour un patient qui n'a pas encore de compte sur la plateforme."
        icon={UserPlus}
      >
        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <Alert level={state.candidatDoublon ? "warning" : "critical"} title={state.candidatDoublon ? "Doublon probable" : "Création impossible"}>
              {state.error}
            </Alert>
          ) : null}

          {state.candidatDoublon ? (
            <div className="flex flex-col gap-3 rounded-champ border border-bordure bg-plan p-3">
              <p className="text-[13px] text-encre-secondaire">
                Patient existant correspondant : initiales{" "}
                <span className="font-semibold text-encre">{state.candidatDoublon.initiales}</span>,
                né(e) en{" "}
                <span className="font-semibold text-encre">{state.candidatDoublon.anneeNaissance}</span>,{" "}
                {state.candidatDoublon.sexe === "F" ? "féminin" : "masculin"}
                {state.candidatDoublon.telephoneMasque ? (
                  <>
                    {" "}
                    · tél. <span className="font-semibold text-encre">{state.candidatDoublon.telephoneMasque}</span>
                  </>
                ) : null}
                . Recherchez plutôt ce patient dans la liste s&apos;il s&apos;agit de la même personne.
              </p>
              <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                <input
                  type="checkbox"
                  name="confirmerMalgreDoublon"
                  checked={confirmerDoublon}
                  onChange={(event) => setConfirmerDoublon(event.target.checked)}
                />
                Aucun ne correspond, créer quand même
              </label>
              {confirmerDoublon ? (
                <TextField
                  label="Justification"
                  name="justificationDoublon"
                  required
                  hint="Au moins 10 caractères, tracée dans l'audit."
                />
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nom" name="nom" required />
            <TextField label="Prénom" name="prenom" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Sexe" name="sexe" required options={OPTIONS_SEXE} placeholder="Choisir" />
            <TextField label="Date de naissance" name="dateNaissance" type="date" required />
          </div>
          <TextField label="Téléphone" name="telephone" hint="Facultatif." />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Contact d'urgence : nom" name="contactUrgenceNom" hint="Facultatif." />
            <TextField label="Contact d'urgence : téléphone" name="contactUrgenceTelephone" hint="Facultatif." />
          </div>

          <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
            {pending ? "Création..." : "Créer le dossier patient"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
