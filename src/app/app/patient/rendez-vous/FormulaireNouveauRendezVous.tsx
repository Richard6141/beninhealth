"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  creerRendezVousAction,
  type EtablissementOption,
  type FacilityActionState,
  type ProfessionnelOption,
} from "@/modules/facility/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: FacilityActionState = { error: null, success: false };

export interface FormulaireNouveauRendezVousProps {
  etablissements: EtablissementOption[];
  /** Tous les professionnels, tous établissements confondus : le filtrage
   * par établissement choisi se fait ici, côté client, plutôt que de refaire
   * un aller-retour serveur à chaque changement de sélection. */
  professionnels: ProfessionnelOption[];
  /** Minimum du champ date/heure ("AAAA-MM-JJTHH:mm"), calculé côté serveur
   * (heure de la requête) et transmis en prop plutôt que recalculé côté
   * client, pour éviter tout écart d'hydratation entre serveur et navigateur. */
  dateMinimum: string;
}

/**
 * Contenu du formulaire, isolé à part (remonté via la prop "key" du parent à
 * chaque fermeture de la modale) pour repartir d'un useActionState neuf à
 * chaque ouverture, même pattern que
 * src/app/app/medecin/laboratoire/FormulaireResultat.tsx.
 */
function ContenuFormulaire({
  etablissements,
  professionnels,
  dateMinimum,
  onFermer,
}: FormulaireNouveauRendezVousProps & { onFermer: () => void }) {
  const [state, formAction, pending] = useActionState(
    creerRendezVousAction,
    etatInitial
  );
  const [etablissementId, setEtablissementId] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Demande envoyée">
          Votre demande de rendez-vous a été envoyée. Elle apparaît dans la
          liste de vos rendez-vous à venir.
        </Alert>
        <Button type="button" variant="secondary" className="w-fit" onClick={onFermer}>
          Fermer
        </Button>
      </div>
    );
  }

  const optionsEtablissements = etablissements.map((etablissement) => ({
    value: etablissement.id,
    label: `${etablissement.nom} (${etablissement.type}), ${etablissement.localisation}`,
  }));

  const professionnelsFiltres = professionnels.filter(
    (professionnel) => professionnel.etablissementId === etablissementId
  );
  const optionsProfessionnels = professionnelsFiltres.map((professionnel) => ({
    value: professionnel.id,
    label: `${professionnel.nomComplet}, ${professionnel.specialite}`,
  }));

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Demande impossible">
          {state.error}
        </Alert>
      ) : null}

      <SelectField
        label="Établissement de santé"
        name="etablissementId"
        required
        options={optionsEtablissements}
        placeholder="Choisir un établissement"
        onChange={(evenement) => setEtablissementId(evenement.target.value)}
      />

      <SelectField
        key={etablissementId}
        label="Professionnel de santé"
        name="professionnelId"
        options={optionsProfessionnels}
        placeholder={
          etablissementId === ""
            ? "Choisissez d'abord un établissement"
            : professionnelsFiltres.length > 0
              ? "Peu importe (facultatif)"
              : "Aucun professionnel disponible dans cet établissement"
        }
      />

      <TextField
        label="Date et heure souhaitées"
        name="date"
        type="datetime-local"
        required
        min={dateMinimum}
      />

      <TextField
        label="Motif de la consultation"
        name="motif"
        required
        placeholder="Ex. : douleur abdominale, suivi de grossesse, vaccination..."
      />

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Envoi en cours..." : "Prendre rendez-vous"}
      </Button>
    </form>
  );
}

/**
 * Bouton "Prendre un rendez-vous" + modale de prise de rendez-vous
 * (creerRendezVousAction, module facility). À la fermeture de la modale
 * (bouton "Fermer", Échap ou clic sur le fond), la clé du contenu change pour
 * repartir d'un formulaire vierge à la prochaine ouverture.
 */
export function BoutonNouveauRendezVous(props: FormulaireNouveauRendezVousProps) {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);

  return (
    <>
      <Button
        type="button"
        variant="primary"
        iconBefore={Plus}
        onClick={() => modalRef.current?.showModal()}
      >
        Prendre un rendez-vous
      </Button>
      <Modal
        ref={modalRef}
        width="wide"
        title="Prendre un nouveau rendez-vous"
        description="Choisissez un établissement de santé et, si vous le souhaitez, un professionnel en particulier."
        onClose={() => setCle((valeur) => valeur + 1)}
      >
        <ContenuFormulaire key={cle} {...props} onFermer={() => modalRef.current?.close()} />
      </Modal>
    </>
  );
}
