"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, Search } from "lucide-react";
import {
  creerRendezVousGuichetAction,
  rechercherPatientGuichetAction,
  type ProfessionnelGuichetOption,
  type RechercheGuichetState,
  type RendezVousGuichetActionState,
} from "@/modules/facility/rendez-vous-guichet";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatRechercheInitial: RechercheGuichetState = { error: null, success: false };
const etatCreationInitial: RendezVousGuichetActionState = { error: null, success: false };

function EtapeRecherche({ onTrouve }: { onTrouve: (patient: { id: string; nomComplet: string; anneeNaissance: number }) => void }) {
  const [state, formAction, pending] = useActionState(rechercherPatientGuichetAction, etatRechercheInitial);
  const [mode, setMode] = useState<"identifiant" | "telephone">("identifiant");

  if (state.success && state.patientId && state.nomComplet && state.anneeNaissance) {
    onTrouve({ id: state.patientId, nomComplet: state.nomComplet, anneeNaissance: state.anneeNaissance });
  }

  return (
    <Card title="1. Retrouver le patient" description="Recherche exacte uniquement (RG-ACC-40) : aucune recherche par nom.">
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Patient introuvable">
            {state.error}
          </Alert>
        ) : null}

        <div className="flex gap-1 rounded-champ border border-bordure bg-plan p-1 w-fit">
          <button
            type="button"
            onClick={() => setMode("identifiant")}
            className={
              mode === "identifiant"
                ? "rounded-champ bg-accent px-3 py-1.5 text-[13px] font-semibold text-surface"
                : "rounded-champ px-3 py-1.5 text-[13px] font-semibold text-encre-secondaire"
            }
          >
            Par identifiant santé
          </button>
          <button
            type="button"
            onClick={() => setMode("telephone")}
            className={
              mode === "telephone"
                ? "rounded-champ bg-accent px-3 py-1.5 text-[13px] font-semibold text-surface"
                : "rounded-champ px-3 py-1.5 text-[13px] font-semibold text-encre-secondaire"
            }
          >
            Par téléphone + date de naissance
          </button>
        </div>

        {mode === "identifiant" ? (
          <TextField
            label="Identifiant santé"
            name="identifiantSante"
            placeholder="Ex. BJ-SANTE-PAT-0001"
          />
        ) : (
          <>
            <TextField label="Téléphone" name="telephone" type="tel" placeholder="+229 90 00 00 00" />
            <TextField label="Date de naissance" name="dateNaissance" type="date" />
          </>
        )}

        <Button type="submit" variant="primary" iconBefore={Search} className="w-fit" disabled={pending}>
          {pending ? "Recherche en cours..." : "Rechercher"}
        </Button>
      </form>
    </Card>
  );
}

function EtapeCreation({
  patient,
  professionnels,
  onAnnuler,
}: {
  patient: { id: string; nomComplet: string; anneeNaissance: number };
  professionnels: ProfessionnelGuichetOption[];
  onAnnuler: () => void;
}) {
  const [state, formAction, pending] = useActionState(creerRendezVousGuichetAction, etatCreationInitial);

  const options = professionnels.map((professionnel) => ({
    value: professionnel.id,
    label: `${professionnel.nomComplet}, ${professionnel.specialite}`,
  }));

  if (state.success) {
    return (
      <Card title="Rendez-vous confirmé">
        <Alert level="success" title="Rendez-vous créé">
          Le rendez-vous de {patient.nomComplet} est confirmé et apparaîtra dans la file du jour à l&apos;heure
          choisie.
        </Alert>
        <Button type="button" variant="secondary" className="mt-4 w-fit" onClick={onAnnuler}>
          Prendre un autre rendez-vous
        </Button>
      </Card>
    );
  }

  return (
    <Card
      title="2. Choisir le créneau"
      description={`Patient : ${patient.nomComplet} (né(e) en ${patient.anneeNaissance})`}
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        <input type="hidden" name="patientId" value={patient.id} />

        {state.error ? (
          <Alert level="critical" title="Rendez-vous impossible">
            {state.error}
          </Alert>
        ) : null}

        <SelectField
          label="Professionnel de santé"
          name="professionnelId"
          options={options}
          placeholder={options.length > 0 ? "Peu importe (facultatif)" : "Aucun professionnel disponible"}
        />

        <TextField label="Date et heure" name="date" type="datetime-local" required />

        <TextField
          label="Motif"
          name="motif"
          required
          placeholder="Ex. : consultation, suivi, vaccination..."
        />

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onAnnuler}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" iconBefore={CalendarPlus} disabled={pending}>
            {pending ? "Confirmation en cours..." : "Confirmer le rendez-vous"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SectionRendezVousGuichet({ professionnels }: { professionnels: ProfessionnelGuichetOption[] }) {
  const [patient, setPatient] = useState<{ id: string; nomComplet: string; anneeNaissance: number } | null>(null);
  const [cle, setCle] = useState(0);

  if (!patient) {
    return <EtapeRecherche key={cle} onTrouve={setPatient} />;
  }

  return (
    <EtapeCreation
      key={patient.id}
      patient={patient}
      professionnels={professionnels}
      onAnnuler={() => {
        setPatient(null);
        setCle((valeur) => valeur + 1);
      }}
    />
  );
}
