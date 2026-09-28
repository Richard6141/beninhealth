"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  renouvelerPrescriptionAction,
  type PrescriptionActionState,
  type PrescriptionAncienneResume,
} from "@/modules/prescription/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: PrescriptionActionState = { error: null, success: false };

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  if (statut === "annulee") return { texte: "Annulée", tone: "critical" };
  if (statut === "arretee") return { texte: "Arrêtée", tone: "critical" };
  if (statut === "delivree") return { texte: "Délivrée", tone: "good" };
  if (statut === "delivree_partiellement") return { texte: "Délivrée en partie", tone: "warning" };
  return { texte: "Validée", tone: "neutral" };
}

/** Bouton "Renouveler" d'une ancienne prescription precise, avec son propre etat (une useActionState par ligne). */
function BoutonRenouveler({
  prescriptionId,
  consultationId,
  reauthentificationRecente,
  mfaActif,
}: {
  prescriptionId: string;
  consultationId: string;
  reauthentificationRecente: boolean;
  mfaActif: boolean;
}) {
  const [state, formAction, pending] = useActionState(renouvelerPrescriptionAction, etatInitial);
  const [motDePasseSignature, setMotDePasseSignature] = useState("");
  const [codeMfaSignature, setCodeMfaSignature] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.push("/app/medecin/prescriptions");
    }
  }, [state.success, router]);

  if (state.success) {
    return <p className="text-[13px] font-semibold text-bon">Ordonnance renouvelée.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="prescriptionId" value={prescriptionId} />
      <input type="hidden" name="consultationId" value={consultationId} />
      {state.error ? (
        <Alert level="critical" title="Renouvellement impossible" className="mb-1">
          {state.error}
        </Alert>
      ) : null}
      {!reauthentificationRecente ? (
        <div className="flex max-w-xs flex-col gap-2">
          <TextField
            label="Mot de passe (signature)"
            name="motDePasseSignature"
            type="password"
            required
            autoComplete="current-password"
            value={motDePasseSignature}
            onChange={(event) => setMotDePasseSignature(event.target.value)}
          />
          {mfaActif ? (
            <TextField
              label="Code de double authentification"
              name="codeMfaSignature"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={codeMfaSignature}
              onChange={(event) => setCodeMfaSignature(event.target.value)}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] text-encre-attenuee">
          Ré-authentification déjà effectuée il y a moins de 5 minutes (RG-AUTH-53).
        </p>
      )}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={
          pending ||
          (!reauthentificationRecente &&
            (motDePasseSignature.length === 0 || (mfaActif && codeMfaSignature.length === 0)))
        }
        className="w-fit"
      >
        {pending ? "Signature en cours..." : "Renouveler et signer"}
      </Button>
    </form>
  );
}

export interface RenouvellementPrescriptionProps {
  consultationId: string;
  anciennesPrescriptions: PrescriptionAncienneResume[];
  reauthentificationRecente: boolean;
  mfaActif: boolean;
}

/**
 * F-PRE-05 du pack, "Renouveler" : propose de reprendre une ancienne
 * prescription de ce patient (memes lignes, meme posologie deja composee)
 * plutot que de tout ressaisir. Repliee par defaut (section secondaire par
 * rapport a la creation d'une nouvelle prescription, l'action principale de
 * cet ecran). Chaque clic sur "Renouveler" cree immediatement une nouvelle
 * prescription "validee" (voir renouvelerPrescriptionAction : refuse plutot
 * que de forcer silencieusement si un controle de securite F-PRE-02 se
 * declenche sur une ligne copiee), rattachee a la consultation courante de
 * cet ecran.
 */
export function RenouvellementPrescription({
  consultationId,
  anciennesPrescriptions,
  reauthentificationRecente,
  mfaActif,
}: RenouvellementPrescriptionProps) {
  const [ouvert, setOuvert] = useState(false);

  if (anciennesPrescriptions.length === 0) {
    return null;
  }

  return (
    <Card
      title="Renouveler une ancienne ordonnance"
      description="Reprend les mêmes médicaments d'une prescription précédente de ce patient, sans les ressaisir."
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert((valeur) => !valeur)}>
          {ouvert ? "Masquer" : `Voir (${anciennesPrescriptions.length})`}
        </Button>
      }
    >
      {ouvert ? (
        <ul className="flex flex-col gap-4">
          {anciennesPrescriptions.map((prescription) => {
            const statut = libelleStatut(prescription.statut);
            return (
              <li
                key={prescription.id}
                className="flex flex-col gap-2 border-b border-bordure pb-4 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-encre">
                    {prescription.numero} · {formaterDate(prescription.date)}
                  </p>
                  <Badge tone={statut.tone}>{statut.texte}</Badge>
                </div>
                <p className="text-[13px] text-encre-secondaire">
                  {prescription.lignes
                    .map((ligne) => `${ligne.medicamentNom} (${ligne.dosage}, ${ligne.forme})`)
                    .join(", ")}
                </p>
                <BoutonRenouveler
                  prescriptionId={prescription.id}
                  consultationId={consultationId}
                  reauthentificationRecente={reauthentificationRecente}
                  mfaActif={mfaActif}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
