"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  creerProfessionnelAction,
  type GestionCompteActionState,
} from "@/modules/identity/gestion-comptes";
import { Alert } from "@/components/ui/Alert";
import { InvitationEnvoyee } from "@/components/InvitationEnvoyee";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: GestionCompteActionState = { error: null, success: false };

const optionsRole: SelectOption[] = [
  { value: "medecin", label: "Médecin" },
  { value: "infirmier", label: "Infirmier" },
  { value: "agent_communautaire", label: "Agent communautaire" },
  { value: "pharmacien", label: "Pharmacien" },
  { value: "laboratoire", label: "Laboratoire" },
];

/**
 * Contenu du formulaire de creation d'un compte professionnel. Isole dans un
 * composant a part (remonte via la prop "key" du parent a chaque fermeture de
 * la modale) pour repartir sur un useActionState neuf a chaque ouverture,
 * plutot que de conserver l'ecran de succes precedent affiche.
 */
function ContenuFormulaireAjout({ onFermer }: { onFermer: () => void }) {
  const [state, formAction, pending] = useActionState(
    creerProfessionnelAction,
    etatInitial
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Invitation envoyée">
          Le compte est créé et rattaché à votre établissement. Il sera actif dès que la personne aura activé son compte.
        </Alert>
        <InvitationEnvoyee email={state.invitationEnvoyeeA ?? ""} lien={state.lienInvitation} />
        <Button type="button" variant="secondary" className="w-fit" onClick={onFermer}>
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
      {state.error ? (
        <Alert level="critical" title="Création impossible">
          {state.error}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nom" name="nom" required />
        <TextField label="Prénom" name="prenom" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Email" name="email" type="email" required />
        <TextField label="Téléphone" name="telephone" type="tel" required />
      </div>

      <SelectField
        label="Rôle"
        name="role"
        required
        placeholder="Sélectionnez un rôle"
        options={optionsRole}
      />

      <TextField
        label="Spécialité"
        name="specialite"
        hint="Le cas échéant, précisez la spécialité (ex. pédiatrie, soins infirmiers)."
      />

      <TextField
        label="Numéro d'inscription à l'Ordre"
        name="numeroOrdre"
        autoComplete="off"
        hint="Recommandé : il identifie la personne de façon unique et évite un second compte si elle exerce déjà ailleurs."
      />

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Création en cours..." : "Créer le compte"}
      </Button>
    </form>
  );
}

/**
 * Bouton "Ajouter un membre du personnel" + modale de creation
 * (creerProfessionnelAction, module identity/gestion-comptes, autre agent).
 * A la fermeture de la modale, la cle du contenu change pour repartir d'un
 * formulaire vierge au prochain ouvre (voir ContenuFormulaireAjout).
 */
export function FormulaireAjoutPersonnel() {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);

  return (
    <>
      <Button type="button" onClick={() => modalRef.current?.showModal()}>
        Ajouter un membre du personnel
      </Button>
      <Modal
        ref={modalRef}
        width="wide"
        title="Ajouter un membre du personnel"
        description="Créez un compte professionnel rattaché à votre établissement."
        onClose={() => setCle((valeur) => valeur + 1)}
      >
        <ContenuFormulaireAjout key={cle} onFermer={() => modalRef.current?.close()} />
      </Modal>
    </>
  );
}
