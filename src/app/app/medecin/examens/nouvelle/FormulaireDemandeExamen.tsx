"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  demanderExamenAction,
  type LaboratoireActionState,
  type LaboratoireOption,
} from "@/modules/laboratoire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: LaboratoireActionState = { error: null, success: false };

export interface FormulaireDemandeExamenProps {
  laboratoires: LaboratoireOption[];
  /** Chaine vide si aucune consultation n'est a l'origine de la demande. */
  consultationId: string;
}

/**
 * Formulaire de demande d'examen (Phase 8). demanderExamenAction (module
 * laboratoire) attend toujours un patientId explicite dans le FormData, que
 * la demande parte ou non d'une consultation : le champ "Identifiant du
 * patient" reste donc une saisie libre dans les deux cas pour cette premiere
 * version. Un rappel s'affiche quand consultationId est fourni, car la
 * resolution automatique du patient depuis la consultation n'est pas encore
 * disponible avec le contrat expose par le module laboratoire.
 */
export function FormulaireDemandeExamen({
  laboratoires,
  consultationId,
}: FormulaireDemandeExamenProps) {
  const [state, formAction, pending] = useActionState(demanderExamenAction, etatInitial);

  const optionsLaboratoires = laboratoires.map((laboratoire) => ({
    value: laboratoire.id,
    label: `${laboratoire.nom} (${laboratoire.localisation})`,
  }));

  const erreurConsentement =
    state.error !== null && state.error.toLowerCase().includes("consentement");

  if (state.success) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert level="success" title="Demande d'examen enregistree">
            La demande d&apos;examen a bien ete transmise au laboratoire.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app/medecin/consultations"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Retour a l&apos;historique des consultations
            </Link>
            <Link
              href="/app/medecin/examens"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Voir l&apos;historique des examens demandes
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Demande d'examen"
      description="Renseignez le patient, le laboratoire et le type d'examen souhaite."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-6">
        <input type="hidden" name="consultationId" value={consultationId} />

        {state.error ? (
          erreurConsentement ? (
            <Alert level="warning" title="Consentement necessaire">
              {state.error}
            </Alert>
          ) : (
            <Alert level="critical" title="Demande non enregistree">
              {state.error}
            </Alert>
          )
        ) : null}

        {consultationId ? (
          <Alert level="info" title="Fonctionnalite disponible uniquement depuis une consultation pour l'instant">
            La recuperation automatique du patient depuis cette consultation
            n&apos;est pas encore disponible : renseignez ci-dessous
            l&apos;identifiant du patient pour finaliser cette demande.
          </Alert>
        ) : null}

        <TextField
          label="Identifiant du patient"
          name="patientId"
          required
          hint="Vous pouvez aussi arriver sur cet ecran depuis une consultation, via le lien « Demander un examen »."
        />

        <SelectField
          label="Laboratoire"
          name="laboratoireId"
          required
          options={optionsLaboratoires}
          placeholder="Choisir un laboratoire"
        />

        <TextField
          label="Type d'examen"
          name="typeExamen"
          required
          placeholder="Ex. Numeration formule sanguine"
        />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
          {pending ? "Envoi en cours..." : "Envoyer la demande"}
        </Button>
      </form>
    </Card>
  );
}
