"use client";

import { useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { FormulaireChangementMotDePasse } from "./FormulaireChangementMotDePasse";

/**
 * Bouton "Changer mon mot de passe" + Modal, accessible depuis l'ecran
 * ministere quel que soit l'onglet actif. La cle incrementee a chaque
 * ouverture reinitialise le formulaire (efface les champs et l'etat succes
 * d'une ouverture precedente).
 */
export function ChangerMotDePasseModal() {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);

  function ouvrir() {
    setCle((valeur) => valeur + 1);
    modalRef.current?.showModal();
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" iconBefore={KeyRound} onClick={ouvrir}>
        Changer mon mot de passe
      </Button>
      <Modal
        ref={modalRef}
        title="Changer mon mot de passe"
        description="Le mot de passe actuel est requis pour confirmer ce changement."
      >
        <FormulaireChangementMotDePasse key={cle} onFermer={() => modalRef.current?.close()} />
      </Modal>
    </>
  );
}
