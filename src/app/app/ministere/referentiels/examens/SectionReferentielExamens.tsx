"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  basculerActifExamenReferentielAction,
  creerExamenReferentielAction,
  reordonnerExamenReferentielAction,
  type ExamenReferentielAdminResume,
  type ReferentielExamensActionState,
} from "@/modules/administration/referentiel-examens";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReferentielExamensActionState = { error: null, success: false };

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

function LigneExamen({
  entree,
  estPremierDeSaFamille,
  estDernierDeSaFamille,
}: {
  entree: ExamenReferentielAdminResume;
  estPremierDeSaFamille: boolean;
  estDernierDeSaFamille: boolean;
}) {
  const router = useRouter();
  const [etatBasculement, actionBasculement, pendingBasculement] = useActionState(
    basculerActifExamenReferentielAction,
    etatInitial
  );
  const [etatReordonnancement, actionReordonnancement, pendingReordonnancement] = useActionState(
    reordonnerExamenReferentielAction,
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-encre">{entree.libelle}</p>
          <span className="chiffres text-[12px] text-encre-attenuee">{entree.code}</span>
          <Badge tone={entree.actif ? "good" : "neutral"}>{entree.actif ? "Actif" : "Désactivé"}</Badge>
        </div>
        <p className="text-[12px] text-encre-attenuee">Modifié le {formaterDate(entree.dateModification)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={actionReordonnancement}>
          <input type="hidden" name="id" value={entree.id} />
          <input type="hidden" name="direction" value="haut" />
          <Button type="submit" variant="secondary" size="sm" disabled={estPremierDeSaFamille || pendingReordonnancement}>
            ↑
          </Button>
        </form>
        <form action={actionReordonnancement}>
          <input type="hidden" name="id" value={entree.id} />
          <input type="hidden" name="direction" value="bas" />
          <Button type="submit" variant="secondary" size="sm" disabled={estDernierDeSaFamille || pendingReordonnancement}>
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

function FormulaireAjoutExamen({ familles }: { familles: readonly string[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(creerExamenReferentielAction, etatInitial);
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

  const optionsFamilles = familles.map((famille) => ({ value: famille, label: famille }));

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {state.error ? (
        <Alert level="critical" title="Ajout impossible" className="w-full">
          {state.error}
        </Alert>
      ) : null}
      <div className="w-40">
        <TextField
          key={`code-${cle}`}
          label="Code"
          name="code"
          required
          maxLength={40}
          placeholder="Ex. IRM_GENOU"
        />
      </div>
      <div className="w-64">
        <TextField key={`libelle-${cle}`} label="Libellé" name="libelle" required maxLength={200} />
      </div>
      <div className="w-48">
        <SelectField
          key={`famille-${cle}`}
          label="Famille"
          name="famille"
          required
          options={optionsFamilles}
          placeholder="Choisir"
        />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        {pending ? "Ajout en cours..." : "Ajouter"}
      </Button>
    </form>
  );
}

export function SectionReferentielExamens({
  referentiel,
  familles,
}: {
  referentiel: ExamenReferentielAdminResume[];
  familles: readonly string[];
}) {
  const parFamille = familles
    .map((famille) => ({ famille, entrees: referentiel.filter((entree) => entree.famille === famille) }))
    .filter((groupe) => groupe.entrees.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <Card description="Nouvel examen ajouté à la fin de sa famille, actif par défaut.">
        <FormulaireAjoutExamen familles={familles} />
      </Card>

      {parFamille.map(({ famille, entrees }) => (
        <Card key={famille} title={famille}>
          <div className="flex flex-col">
            {entrees.map((entree, index) => (
              <LigneExamen
                key={entree.id}
                entree={entree}
                estPremierDeSaFamille={index === 0}
                estDernierDeSaFamille={index === entrees.length - 1}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
