"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { declencherAccesUrgenceAction, type UrgenceActionState } from "@/modules/urgence/actions";
import { OPTIONS_MOTIF_URGENCE } from "@/modules/urgence/motifs-urgence";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: UrgenceActionState = { error: null, success: false };

function formaterHeure(dateIso: string): string {
  try {
    return new Date(dateIso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateIso;
  }
}

/**
 * Formulaire de declenchement de l'acces d'urgence (F-CLI-10, CA-1) : chaque
 * champ est obligatoire cote serveur (identifiant, motif, justification 20 a
 * 500 caracteres, code de double authentification), jamais seulement cote
 * client.
 */
export function FormulaireAccesUrgence() {
  const [state, formAction, pending] = useActionState(declencherAccesUrgenceAction, etatInitial);
  const [identifiantSante, setIdentifiantSante] = useState("");
  const [motif, setMotif] = useState("");
  const [justification, setJustification] = useState("");
  const [codeTotp, setCodeTotp] = useState("");

  if (state.success && state.patientId && state.dateFin) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert level="critical" title="Acces d'urgence actif">
            Trace et controle, expire a {formaterHeure(state.dateFin)}.
          </Alert>
          <p className="text-[13px] text-encre-secondaire">
            Le patient et le responsable de votre etablissement ont ete notifies. Chaque acces sera revu.
          </p>
          <Link
            href={`/app/medecin/patients/${state.patientId}`}
            className="w-fit rounded-champ bg-critique px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity motion-reduce:transition-none hover:opacity-90"
          >
            Ouvrir le dossier du patient
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Acces d'urgence refuse">
            {state.error}
          </Alert>
        ) : null}

        <TextField
          label="Identifiant sante du patient"
          name="identifiantSante"
          required
          value={identifiantSante}
          onChange={(event) => setIdentifiantSante(event.target.value)}
          placeholder="BJ-SANTE-PAT-XXXX"
          hint="Identifiant present sur la carte sante ou communique par un tiers."
        />

        <SelectField
          label="Motif de l'urgence"
          name="motif"
          required
          value={motif}
          onChange={(event) => setMotif(event.target.value)}
          options={OPTIONS_MOTIF_URGENCE}
          placeholder="Choisir un motif"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="justification-urgence" className="text-[18px] font-semibold text-encre">
            Justification <span className="text-critique" aria-hidden="true">*</span>
          </label>
          <p className="text-[13px] text-encre-secondaire">Entre 20 et 500 caracteres, sera conservee dans le journal d&apos;audit.</p>
          <textarea
            id="justification-urgence"
            name="justification"
            required
            minLength={20}
            maxLength={500}
            rows={4}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>

        <TextField
          label="Code de double authentification (TOTP)"
          name="codeTotp"
          required
          inputMode="numeric"
          maxLength={6}
          value={codeTotp}
          onChange={(event) => setCodeTotp(event.target.value)}
          placeholder="123456"
          hint="Le code a 6 chiffres de votre application d'authentification. La double authentification doit deja etre activee sur votre compte."
        />

        <Button type="submit" variant="danger" disabled={pending} iconBefore={ShieldAlert}>
          {pending ? "Verification..." : "Declencher l'acces d'urgence"}
        </Button>
      </form>
    </Card>
  );
}
