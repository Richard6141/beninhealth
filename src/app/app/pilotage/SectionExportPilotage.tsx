"use client";

import { useActionState, useState } from "react";
import { Download } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { MOTIFS_EXPORT, type ExportPilotageActionState, type MotifExport, type PorteeExportPilotage } from "@/modules/pilotage/exports-constantes";

const etatInitial: ExportPilotageActionState = { error: null, success: false };

const styleLien =
  "inline-flex h-11 items-center justify-center gap-2 rounded-champ border border-bordure-forte bg-surface px-4 text-[14px] font-semibold text-encre transition-colors motion-reduce:transition-none hover:bg-surface-appui focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

interface SectionExportPilotageProps {
  portee: PorteeExportPilotage;
  periode: string;
  action: (prevState: ExportPilotageActionState, formData: FormData) => Promise<ExportPilotageActionState>;
}

/**
 * Ecran d'export F-PIL-05 : motif obligatoire (RG-PIL-40) + re-
 * authentification par mot de passe, meme principe que
 * src/app/app/patient/droits/GestionDroitsDonnees.tsx (F-CIT-13). Une fois
 * confirmee, revele les liens PDF/CSV qui regenerent le contenu a la demande
 * a partir de la session courante et de la periode actuellement affichee a
 * l'ecran (deja masquee cote lecture, RG-PIL-41).
 */
export function SectionExportPilotage({ portee, periode, action }: SectionExportPilotageProps) {
  const [state, formAction, pending] = useActionState(action, etatInitial);
  const [motif, setMotif] = useState<MotifExport | "">("");

  const parametresLien =
    state.success && state.jeton
      ? `portee=${portee}&periode=${encodeURIComponent(periode)}&jeton=${encodeURIComponent(state.jeton)}`
      : "";

  return (
    <Card
      title="Exporter un rapport"
      description="Rapport PDF (filtres, indicateurs clés, graphique, tableau, définitions) ou données CSV, après indication d'un motif et confirmation de votre mot de passe."
    >
      {state.success ? (
        <div className="flex flex-col gap-3">
          <Alert level="success" title="Identité confirmée">
            Vos fichiers sont prêts. Chaque lien régénère un rapport à jour au moment du téléchargement.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <a href={`/api/pilotage/export/pdf?${parametresLien}`} className={styleLien}>
              <Download size={16} aria-hidden="true" />
              Télécharger (PDF)
            </a>
            <a href={`/api/pilotage/export/csv?${parametresLien}`} className={styleLien}>
              <Download size={16} aria-hidden="true" />
              Télécharger (CSV)
            </a>
          </div>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <Alert level="critical" title="Confirmation impossible">
              {state.error}
            </Alert>
          ) : null}
          <SelectField
            label="Motif de l'export"
            name="motif"
            required
            placeholder="Choisissez un motif"
            value={motif}
            onChange={(event) => setMotif(event.target.value as MotifExport)}
            options={MOTIFS_EXPORT.map((option) => ({ value: option.value, label: option.label }))}
          />
          {motif === "autre" ? (
            <TextField label="Précisez le motif" name="motifTexte" required minLength={5} />
          ) : null}
          <TextField label="Mot de passe actuel" name="motDePasse" type="password" autoComplete="current-password" required />
          <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
            {pending ? "Vérification..." : "Confirmer et préparer l'export"}
          </Button>
        </form>
      )}
    </Card>
  );
}
