"use client";

import { useActionState, useRef, useState } from "react";
import {
  changerMotDePasseAction,
  type GestionCompteActionState,
} from "@/modules/identity/gestion-comptes";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";

const etatInitial: GestionCompteActionState = { error: null, success: false };

/**
 * Contenu du formulaire de changement de mot de passe. Isole a part et
 * remonte via la prop "key" du parent a chaque fermeture de la modale, pour
 * repartir d'un formulaire vierge au prochain ouvre.
 */
function ContenuFormulaireMotDePasse({ onFermer }: { onFermer: () => void }) {
  const [state, formAction, pending] = useActionState(
    changerMotDePasseAction,
    etatInitial
  );

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Mot de passe modifié">
          Votre mot de passe a bien été mis à jour. Utilisez le nouveau mot de
          passe lors de votre prochaine connexion.
        </Alert>
        <Button type="button" variant="secondary" className="w-fit" onClick={onFermer}>
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
      {state.error ? (
        <Alert level="critical" title="Modification impossible">
          {state.error}
        </Alert>
      ) : null}

      <TextField
        label="Mot de passe actuel"
        name="motDePasseActuel"
        type="password"
        autoComplete="current-password"
        required
      />
      <TextField
        label="Nouveau mot de passe"
        name="nouveauMotDePasse"
        type="password"
        autoComplete="new-password"
        required
      />
      <TextField
        label="Confirmation du nouveau mot de passe"
        name="confirmationMotDePasse"
        type="password"
        autoComplete="new-password"
        required
      />

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Modification en cours..." : "Changer le mot de passe"}
      </Button>
    </form>
  );
}

/**
 * Bouton "Changer mon mot de passe" + modale (changerMotDePasseAction,
 * module identity/gestion-comptes, autre agent), accessible depuis l'ecran
 * etablissement.
 */
export function FormulaireChangementMotDePasse() {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => modalRef.current?.showModal()}
      >
        Changer mon mot de passe
      </Button>
      <Modal
        ref={modalRef}
        title="Changer mon mot de passe"
        description="Le nouveau mot de passe doit être différent de l'actuel."
        onClose={() => setCle((valeur) => valeur + 1)}
      >
        <ContenuFormulaireMotDePasse key={cle} onFermer={() => modalRef.current?.close()} />
      </Modal>
    </>
  );
}
