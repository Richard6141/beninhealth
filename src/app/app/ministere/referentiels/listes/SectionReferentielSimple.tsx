"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  basculerActifEntreeReferentielSimpleAction,
  creerEntreeReferentielSimpleAction,
  reordonnerEntreeReferentielSimpleAction,
  type EntreeReferentielSimpleResume,
  type ReferentielSimpleActionState,
} from "@/modules/administration/referentiels-simples";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReferentielSimpleActionState = { error: null, success: false };

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

function LigneEntree({
  entree,
  estPremiere,
  estDerniere,
}: {
  entree: EntreeReferentielSimpleResume;
  estPremiere: boolean;
  estDerniere: boolean;
}) {
  const router = useRouter();
  const [etatBasculement, actionBasculement, pendingBasculement] = useActionState(
    basculerActifEntreeReferentielSimpleAction,
    etatInitial
  );
  const [etatReordonnancement, actionReordonnancement, pendingReordonnancement] = useActionState(
    reordonnerEntreeReferentielSimpleAction,
    etatInitial
  );

  // Un effet par action, sur l'objet d'etat et non sur son booleen : une seconde action sur la meme ligne doit rafraichir aussi.
  useEffect(() => {
    if (etatBasculement.success) {
      router.refresh();
    }
  }, [etatBasculement, router]);

  useEffect(() => {
    if (etatReordonnancement.success) {
      router.refresh();
    }
  }, [etatReordonnancement, router]);

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
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            aria-label={`Monter ${entree.libelle}`}
            disabled={estPremiere || pendingReordonnancement}
          >
            ↑
          </Button>
        </form>
        <form action={actionReordonnancement}>
          <input type="hidden" name="id" value={entree.id} />
          <input type="hidden" name="direction" value="bas" />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            aria-label={`Descendre ${entree.libelle}`}
            disabled={estDerniere || pendingReordonnancement}
          >
            ↓
          </Button>
        </form>
        <form action={actionBasculement}>
          <input type="hidden" name="id" value={entree.id} />
          <Button
            type="submit"
            variant={entree.actif ? "danger" : "primary"}
            size="sm"
            aria-label={`${entree.actif ? "Désactiver" : "Activer"} ${entree.libelle}`}
            disabled={pendingBasculement}
          >
            {pendingBasculement ? "..." : entree.actif ? "Désactiver" : "Activer"}
          </Button>
        </form>
      </div>

      {etatBasculement.error || etatReordonnancement.error ? (
        <p role="alert" className="w-full text-[13px] text-critique">
          {etatBasculement.error ?? etatReordonnancement.error}
        </p>
      ) : null}
    </div>
  );
}

function FormulaireAjout({ type }: { type: string }) {
  const router = useRouter();
  const [etat, action, enCours] = useActionState(creerEntreeReferentielSimpleAction, etatInitial);
  const [cle, setCle] = useState(0);
  const [etatTraite, setEtatTraite] = useState(etat);

  // Nouveau succes : on repart d'un formulaire vierge (comparaison d'etat au rendu, pas de setState dans un effet).
  if (etat.success && etat !== etatTraite) {
    setEtatTraite(etat);
    setCle((valeur) => valeur + 1);
  }

  useEffect(() => {
    if (etat.success) {
      router.refresh();
    }
  }, [etat, router]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="type" value={type} />
      {etat.error ? (
        <Alert level="critical" title="Ajout impossible" className="w-full">
          {etat.error}
        </Alert>
      ) : null}
      <div className="w-48">
        <TextField
          key={`code-${cle}`}
          label="Code"
          name="code"
          required
          maxLength={40}
          placeholder="Ex. dermatologie"
          hint="Minuscules, chiffres et _"
        />
      </div>
      <div className="w-72">
        <TextField key={`libelle-${cle}`} label="Libellé" name="libelle" required maxLength={120} />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={enCours}>
        {enCours ? "Ajout en cours..." : "Ajouter"}
      </Button>
    </form>
  );
}

export function SectionReferentielSimple({
  type,
  entrees,
}: {
  type: string;
  entrees: EntreeReferentielSimpleResume[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card description="Nouvelle entrée ajoutée à la fin de la liste, active par défaut.">
        <FormulaireAjout type={type} />
      </Card>

      <Card>
        <div className="flex flex-col">
          {entrees.map((entree, index) => (
            <LigneEntree
              key={entree.id}
              entree={entree}
              estPremiere={index === 0}
              estDerniere={index === entrees.length - 1}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
