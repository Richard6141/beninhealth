"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  basculerActifVaccinReferentielAction,
  creerVaccinReferentielAction,
  reordonnerVaccinReferentielAction,
  type ReferentielVaccinalActionState,
  type VaccinReferentielResume,
} from "@/modules/administration/referentiel-vaccinal";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReferentielVaccinalActionState = { error: null, success: false };

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

function LigneVaccin({
  entree,
  estPremier,
  estDernier,
}: {
  entree: VaccinReferentielResume;
  estPremier: boolean;
  estDernier: boolean;
}) {
  const router = useRouter();
  const [etatBasculement, actionBasculement, pendingBasculement] = useActionState(
    basculerActifVaccinReferentielAction,
    etatInitial
  );
  const [etatReordonnancement, actionReordonnancement, pendingReordonnancement] = useActionState(
    reordonnerVaccinReferentielAction,
    etatInitial
  );

  useEffect(() => {
    if (etatBasculement.success || etatReordonnancement.success) {
      router.refresh();
    }
  }, [etatBasculement.success, etatReordonnancement.success, router]);

  return (
    <div className="flex flex-col gap-2 border-b border-bordure py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-encre">{entree.nom}</p>
          <Badge tone={entree.actif ? "good" : "neutral"}>{entree.actif ? "Actif" : "Désactivé"}</Badge>
        </div>
        <p className="text-[12px] text-encre-attenuee">Modifié le {formaterDate(entree.dateModification)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={actionReordonnancement}>
          <input type="hidden" name="id" value={entree.id} />
          <input type="hidden" name="direction" value="haut" />
          <Button type="submit" variant="secondary" size="sm" disabled={estPremier || pendingReordonnancement}>
            ↑
          </Button>
        </form>
        <form action={actionReordonnancement}>
          <input type="hidden" name="id" value={entree.id} />
          <input type="hidden" name="direction" value="bas" />
          <Button type="submit" variant="secondary" size="sm" disabled={estDernier || pendingReordonnancement}>
            ↓
          </Button>
        </form>
        <form action={actionBasculement}>
          <input type="hidden" name="id" value={entree.id} />
          <Button
            type="submit"
            variant={entree.actif ? "danger" : "primary"}
            size="sm"
            disabled={pendingBasculement}
          >
            {pendingBasculement ? "..." : entree.actif ? "Désactiver" : "Activer"}
          </Button>
        </form>
      </div>

      {etatBasculement.error ? (
        <p role="alert" className="w-full text-[13px] text-critique">
          {etatBasculement.error}
        </p>
      ) : null}
    </div>
  );
}

function FormulaireAjoutVaccin() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(creerVaccinReferentielAction, etatInitial);
  const [cle, setCle] = useState(0);
  const [etatTraite, setEtatTraite] = useState(state);

  // Nouveau succes : on repart d'un formulaire vierge. Comparaison d'etat au
  // rendu plutot que setState dans un effet (react-hooks/set-state-in-effect).
  if (state.success && state !== etatTraite) {
    setEtatTraite(state);
    setCle((valeur) => valeur + 1);
  }

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {state.error ? (
        <Alert level="critical" title="Ajout impossible" className="w-full">
          {state.error}
        </Alert>
      ) : null}
      <div className="w-64">
        <TextField key={cle} label="Nom du vaccin" name="nom" required maxLength={100} />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        {pending ? "Ajout en cours..." : "Ajouter"}
      </Button>
    </form>
  );
}

export function SectionReferentielVaccinal({ referentiel }: { referentiel: VaccinReferentielResume[] }) {
  return (
    <div className="flex flex-col gap-6">
      <Card description="Nouveau vaccin ajouté à la fin de la liste, actif par défaut.">
        <FormulaireAjoutVaccin />
      </Card>

      <Card>
        <div className="flex flex-col">
          {referentiel.map((entree, index) => (
            <LigneVaccin
              key={entree.id}
              entree={entree}
              estPremier={index === 0}
              estDernier={index === referentiel.length - 1}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
