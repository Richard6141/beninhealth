"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { FormulaireCreationEtablissement } from "./FormulaireCreationEtablissement";

/**
 * Bouton d'ouverture + Modal de creation d'etablissement. La cle React
 * incrementee a chaque ouverture force le remontage du formulaire (et donc
 * la reinitialisation de son useActionState) : sans cela, rouvrir la modale
 * apres une creation reussie continuerait d'afficher le mot de passe
 * temporaire de la creation precedente.
 */
export function CreationEtablissementModal() {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);

  function ouvrir() {
    setCle((valeur) => valeur + 1);
    modalRef.current?.showModal();
  }

  return (
    <>
      <Button type="button" variant="primary" iconBefore={Plus} onClick={ouvrir}>
        Creer un etablissement
      </Button>
      <Modal
        ref={modalRef}
        width="wide"
        title="Creer un etablissement"
        description="Cree l'etablissement et, dans la meme operation, le compte de son administrateur."
      >
        <FormulaireCreationEtablissement key={cle} onFermer={() => modalRef.current?.close()} />
      </Modal>
    </>
  );
}
