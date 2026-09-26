"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import {
  enregistrerPersonneAction,
  type EnregistrerPersonneActionState,
  type PersonneCommunautaireResume,
} from "@/modules/communautaire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: EnregistrerPersonneActionState = { error: null, success: false };

const OPTIONS_SEXE = [
  { value: "F", label: "Féminin" },
  { value: "M", label: "Masculin" },
];

export interface ModalNouvellePersonneProps {
  /** Appele avec la personne nouvellement enregistree, pour la selectionner immediatement dans l'ecran appelant. */
  onPersonneCreee?: (personne: PersonneCommunautaireResume) => void;
}

/**
 * Modal d'enregistrement d'une personne suivie par le programme
 * communautaire (F-COM-02 du pack), formulaire proche de ModalNouveauPatient
 * (F-CLI-03) mais SANS compte ni telephone : jamais un dossier Patient, voir
 * src/modules/communautaire/actions.ts. Verification de doublon obligatoire
 * avant creation (par analogie avec RG-CLI-20) : une premiere soumission
 * peut renvoyer un candidat (initiales, annee de naissance, sexe,
 * village/quartier uniquement) qu'il faut confirmer explicitement avec une
 * justification pour continuer.
 */
export function ModalNouvellePersonne({ onPersonneCreee }: ModalNouvellePersonneProps) {
  const modalRef = useRef<ModalHandle>(null);
  const [state, formAction, pending] = useActionState(enregistrerPersonneAction, etatInitial);
  const [confirmerDoublon, setConfirmerDoublon] = useState(false);
  const [dateApproximative, setDateApproximative] = useState(false);

  useEffect(() => {
    if (state.success && state.personneCreee) {
      onPersonneCreee?.(state.personneCreee);
      modalRef.current?.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.personneCreee]);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => modalRef.current?.showModal()}>
        <UserPlus size={16} aria-hidden="true" className="mr-1.5" />
        Nouvelle personne
      </Button>
      <Modal
        ref={modalRef}
        title="Nouvelle personne"
        description="Enregistrer une personne suivie sur le terrain."
        icon={UserPlus}
      >
        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <Alert level={state.candidatDoublon ? "warning" : "critical"} title={state.candidatDoublon ? "Doublon probable" : "Enregistrement impossible"}>
              {state.error}
            </Alert>
          ) : null}

          {state.candidatDoublon ? (
            <div className="flex flex-col gap-3 rounded-champ border border-bordure bg-plan p-3">
              <p className="text-[13px] text-encre-secondaire">
                Personne existante correspondante : initiales{" "}
                <span className="font-semibold text-encre">{state.candidatDoublon.initiales}</span>,
                né(e) en{" "}
                <span className="font-semibold text-encre">{state.candidatDoublon.anneeNaissance}</span>,{" "}
                {state.candidatDoublon.sexe === "F" ? "féminin" : "masculin"}, à{" "}
                <span className="font-semibold text-encre">{state.candidatDoublon.villageQuartier}</span>.
                Recherchez plutôt cette personne dans la liste s&apos;il s&apos;agit de la même.
              </p>
              <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                <input
                  type="checkbox"
                  name="confirmerMalgreDoublon"
                  checked={confirmerDoublon}
                  onChange={(event) => setConfirmerDoublon(event.target.checked)}
                />
                Aucune ne correspond, enregistrer quand même
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
          <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
            <input
              type="checkbox"
              name="dateNaissanceApproximative"
              checked={dateApproximative}
              onChange={(event) => setDateApproximative(event.target.checked)}
            />
            Date approximative (âge estimé)
          </label>
          <TextField label="Village ou quartier" name="villageQuartier" required />
          <TextField label="Chef de ménage" name="chefMenage" hint="Facultatif." />

          <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
            {pending ? "Enregistrement..." : "Enregistrer la personne"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
