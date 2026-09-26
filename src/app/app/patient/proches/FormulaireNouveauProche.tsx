"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { creerPersonneAChargeAction, type ProcheActionState } from "@/modules/proches/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ProcheActionState = { error: null, success: false };

const optionsSexe = [
  { value: "M", label: "Masculin" },
  { value: "F", label: "Féminin" },
];

const optionsLien = [
  { value: "mere", label: "Mère" },
  { value: "pere", label: "Père" },
  { value: "tuteur_legal", label: "Tuteur légal" },
  { value: "autre", label: "Autre" },
];

export function BoutonNouveauProche() {
  const [state, formAction, pending] = useActionState(creerPersonneAChargeAction, etatInitial);
  const modalRef = useRef<ModalHandle>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      modalRef.current?.close();
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <>
      <Button type="button" variant="primary" onClick={() => modalRef.current?.showModal()}>
        Ajouter une personne à charge
      </Button>
      <Modal
        ref={modalRef}
        title="Ajouter une personne à charge"
        description="Pour un enfant de moins de 18 ans dont vous vous occupez. Une personne majeure doit accepter elle-même depuis son propre compte (non disponible dans cette version)."
      >
        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <Alert level="critical" title="Ajout impossible">
              {state.error}
            </Alert>
          ) : null}

          <TextField label="Nom" name="nom" required maxLength={100} />
          <TextField label="Prénom" name="prenom" required maxLength={100} />
          <TextField
            label="Date de naissance"
            name="dateNaissance"
            type="date"
            required
            max={new Date().toISOString().slice(0, 10)}
          />
          <SelectField
            label="Sexe"
            name="sexe"
            required
            options={optionsSexe}
            placeholder="Choisir"
          />
          <SelectField
            label="Votre lien avec cette personne"
            name="lien"
            required
            options={optionsLien}
            placeholder="Choisir"
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => modalRef.current?.close()}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Ajout en cours..." : "Ajouter"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
