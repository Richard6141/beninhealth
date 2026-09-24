"use client";

import { useActionState, useEffect, useId } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  updatePatientProfileAction,
  type DossierPatientResume,
  type PatientActionState,
} from "@/modules/patient/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const optionsGroupeSanguin = [
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
  { value: "inconnu", label: "Inconnu" },
];

const etatInitial: PatientActionState = { error: null, success: false };

export interface FormulaireDossierProps {
  dossier: DossierPatientResume | null;
}

/**
 * Champ texte multiligne (un element par ligne) : le design system ne fournit
 * pas de composant "textarea" dedie, ce champ reprend donc la structure
 * visuelle de TextField (label, aide, meme jetons de style) autour d'un
 * <textarea>, requis par le format attendu par updatePatientProfileAction
 * (allergies/antecedents/maladiesChroniques : une entree par ligne).
 */
function ChampTexteMultiligne({
  label,
  name,
  hint,
  defaultValue,
}: {
  label: string;
  name: string;
  hint: string;
  defaultValue: string;
}) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
      >
        {label}
        <span className="text-[13px] font-normal text-encre-attenuee">
          (facultatif)
        </span>
      </label>
      <p id={hintId} className="text-[13px] text-encre-secondaire">
        {hint}
      </p>
      <textarea
        id={fieldId}
        name={name}
        rows={4}
        aria-describedby={hintId}
        defaultValue={defaultValue}
        className="w-full rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

export function FormulaireDossier({ dossier }: FormulaireDossierProps): ReactNode {
  const [state, formAction, pending] = useActionState(
    updatePatientProfileAction,
    etatInitial
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  const contactPrincipal = dossier?.contactsUrgence[0];

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
      {state.error ? (
        <Alert level="critical" title="Mise à jour impossible">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert level="success" title="Dossier mis à jour">
          Vos informations de santé ont bien été enregistrées.
        </Alert>
      ) : null}

      <SelectField
        label="Groupe sanguin"
        name="groupeSanguin"
        options={optionsGroupeSanguin}
        defaultValue={dossier?.groupeSanguin || "inconnu"}
      />

      <ChampTexteMultiligne
        label="Allergies"
        name="allergies"
        hint="Une allergie par ligne (ex. pénicilline, arachide)."
        defaultValue={dossier?.allergies.join("\n") ?? ""}
      />

      <ChampTexteMultiligne
        label="Antécédents"
        name="antecedents"
        hint="Un antécédent médical ou chirurgical par ligne."
        defaultValue={dossier?.antecedents.join("\n") ?? ""}
      />

      <ChampTexteMultiligne
        label="Maladies chroniques"
        name="maladiesChroniques"
        hint="Une maladie chronique par ligne (ex. diabète, hypertension)."
        defaultValue={dossier?.maladiesChroniques.join("\n") ?? ""}
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-[18px] font-semibold text-encre">
          Contact d&apos;urgence
        </legend>
        <p className="text-[13px] text-encre-secondaire">
          Un seul contact d&apos;urgence peut être enregistré pour le moment.
        </p>
        <TextField
          label="Nom complet"
          name="contactUrgenceNom"
          defaultValue={contactPrincipal?.nom ?? ""}
        />
        <TextField
          label="Téléphone"
          name="contactUrgenceTelephone"
          type="tel"
          defaultValue={contactPrincipal?.telephone ?? ""}
        />
        <TextField
          label="Lien de parenté"
          name="contactUrgenceLien"
          hint="Ex. conjoint(e), parent, enfant, ami(e)."
          defaultValue={contactPrincipal?.lienParente ?? ""}
        />
      </fieldset>

      <Button
        type="submit"
        variant="primary"
        className="w-fit"
        disabled={pending}
      >
        {pending ? "Enregistrement en cours..." : "Enregistrer mes informations"}
      </Button>
    </form>
  );
}
