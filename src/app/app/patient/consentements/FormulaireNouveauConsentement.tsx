"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  grantConsentAction,
  type PatientActionState,
  type ProfessionnelDisponible,
} from "@/modules/patient/actions";
import { OPTIONS_DUREE_CONSENTEMENT, calculerDateFinConsentement } from "@/modules/patient/consentement-durees";
import type { DureeConsentement } from "@/modules/patient/consentement-durees";
import {
  NIVEAU_VERIFICATION_MINIMAL_FULL_SENSITIVE,
  OPTIONS_NIVEAU_ACCES_CONSENTEMENT,
  PHRASES_NIVEAU_ACCES_RECAPITULATIF,
} from "@/modules/patient/consentement-niveaux";
import type { NiveauAccesConsentement } from "@/modules/patient/consentement-niveaux";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { SelecteurProfessionnel } from "./SelecteurProfessionnel";

const etatInitial: PatientActionState = { error: null, success: false };

const optionsTypeAcces = [
  { value: "dossier_complet", label: "Dossier complet" },
  { value: "consultations", label: "Consultations" },
  { value: "prescriptions", label: "Prescriptions" },
  { value: "examens", label: "Examens" },
  { value: "documents", label: "Documents" },
];

export interface FormulaireNouveauConsentementProps {
  /** Niveau de verification d'identite du patient connecte (N0 a N3, RG-ACC-13/CA-2). */
  niveauVerification: string | null;
}

export function FormulaireNouveauConsentement({ niveauVerification }: FormulaireNouveauConsentementProps) {
  const [state, formAction, pending] = useActionState(grantConsentAction, etatInitial);
  const [professionnel, setProfessionnel] = useState<ProfessionnelDisponible | null>(null);
  const [typeAcces, setTypeAcces] = useState("");
  const [niveauAcces, setNiveauAcces] = useState<NiveauAccesConsentement | "">("");
  const [duree, setDuree] = useState("");
  const router = useRouter();
  const modalRef = useRef<ModalHandle>(null);

  const compteVerifieN2 = niveauVerification === NIVEAU_VERIFICATION_MINIMAL_FULL_SENSITIVE;

  // Ajustement d'etat pendant le rendu (comparaison avec l'etat precedent),
  // meme motif que GestionMfa.tsx : router.refresh() reste le seul effet.
  const [etatPrecedent, setEtatPrecedent] = useState(state);
  if (state !== etatPrecedent) {
    setEtatPrecedent(state);
    if (state.success) {
      setProfessionnel(null);
      setTypeAcces("");
      setNiveauAcces("");
      setDuree("");
    }
  }

  useEffect(() => {
    if (state.success) {
      modalRef.current?.close();
      router.refresh();
    }
  }, [state.success, router]);

  const optionsDuree = OPTIONS_DUREE_CONSENTEMENT.map((option) => ({
    value: option.valeur,
    label: option.libelle,
  }));

  const optionsNiveau = OPTIONS_NIVEAU_ACCES_CONSENTEMENT.map((option) => ({
    value: option.valeur,
    label:
      option.valeur === "FULL_SENSITIVE" && !compteVerifieN2
        ? `${option.libelle} (compte vérifié requis)`
        : option.libelle,
  }));

  // F-CIT-10, etape 5 du pack : ecran de confirmation dedie, recapitulant
  // professionnel, niveau et duree avant validation finale. Le controle
  // definitif (RG-ACC-13, compte N2 obligatoire pour FULL_SENSITIVE) reste
  // fait server-side par grantConsentAction : ce bouton n'est qu'un confort.
  const formulaireComplet = professionnel !== null && typeAcces !== "" && niveauAcces !== "" && duree !== "";
  const niveauSensibleBloque = niveauAcces === "FULL_SENSITIVE" && !compteVerifieN2;

  const dateFinPrevue =
    duree !== "" ? calculerDateFinConsentement(duree as DureeConsentement, new Date()) : null;

  const optionDuree = OPTIONS_DUREE_CONSENTEMENT.find((option) => option.valeur === duree);

  return (
    <Card description="Recherchez le professionnel choisi, choisissez le niveau d'informations partagées et la durée : un écran de confirmation récapitule votre choix avant validation.">
      <div className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Autorisation impossible">
            {state.error}
          </Alert>
        ) : null}
        {state.success ? (
          <Alert level="success" title="Accès accordé">
            Le professionnel sélectionné peut désormais accéder à votre
            dossier selon le niveau choisi.
          </Alert>
        ) : null}

        <SelecteurProfessionnel
          professionnelChoisi={professionnel}
          onChoisir={setProfessionnel}
          onEffacer={() => setProfessionnel(null)}
        />

        <SelectField
          label="Type d'accès"
          name="typeAcces"
          required
          options={optionsTypeAcces}
          placeholder="Choisir un type d'accès"
          value={typeAcces}
          onChange={(evenement) => setTypeAcces(evenement.target.value)}
        />

        <SelectField
          label="Niveau d'informations partagées"
          name="niveauAcces"
          required
          options={optionsNiveau}
          placeholder="Choisir un niveau"
          value={niveauAcces}
          onChange={(evenement) => setNiveauAcces(evenement.target.value as NiveauAccesConsentement)}
          hint="« Tout, y compris les informations sensibles » n'est proposé qu'à un professionnel nommé, depuis un compte vérifié (N2)."
        />
        {niveauSensibleBloque ? (
          <Alert level="warning" title="Compte non vérifié">
            Le niveau « Tout, y compris les informations sensibles » nécessite
            un compte vérifié (N2). Faites vérifier votre identité pour
            débloquer ce niveau.
          </Alert>
        ) : null}

        <SelectField
          label="Durée de l'autorisation"
          name="duree"
          required
          options={optionsDuree}
          placeholder="Choisir une durée"
          value={duree}
          onChange={(evenement) => setDuree(evenement.target.value)}
          hint="Maximum 12 mois. Vous pourrez retirer l'accès avant l'échéance à tout moment."
        />

        <Button
          type="button"
          variant="primary"
          className="w-fit"
          disabled={!formulaireComplet || niveauSensibleBloque}
          onClick={() => modalRef.current?.showModal()}
        >
          Vérifier et confirmer
        </Button>

        <Modal
          ref={modalRef}
          title="Confirmer cette autorisation ?"
          description="Vérifiez le récapitulatif avant d'accorder l'accès : vous pourrez le retirer à tout moment."
        >
          <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
            <input type="hidden" name="acteurAutoriseId" value={professionnel?.userId ?? ""} />
            <input type="hidden" name="typeAcces" value={typeAcces} />
            <input type="hidden" name="niveauAcces" value={niveauAcces} />
            <input type="hidden" name="duree" value={duree} />

            {state.error ? (
              <Alert level="critical" title="Autorisation impossible">
                {state.error}
              </Alert>
            ) : null}

            <p className="text-[14px] text-encre-secondaire">
              {professionnel ? (
                <>
                  <strong className="text-encre">{professionnel.nomComplet}</strong> (
                  {professionnel.etablissementNom}) pourra voir{" "}
                  <strong className="text-encre">
                    {niveauAcces !== "" ? PHRASES_NIVEAU_ACCES_RECAPITULATIF[niveauAcces] : ""}
                  </strong>
                  {dateFinPrevue ? (
                    <>
                      {" "}
                      jusqu&apos;au{" "}
                      <strong className="text-encre">{dateFinPrevue.toLocaleDateString("fr-FR")}</strong>
                      {optionDuree ? ` (${optionDuree.libelle})` : ""}.
                    </>
                  ) : (
                    "."
                  )}
                </>
              ) : null}
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => modalRef.current?.close()}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Envoi en cours..." : "Confirmer"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </Card>
  );
}
