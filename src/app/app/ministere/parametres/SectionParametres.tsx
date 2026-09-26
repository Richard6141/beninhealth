"use client";

import { useActionState, useState } from "react";
import {
  basculerFonctionnaliteAction,
  modifierParametreAction,
  type FonctionnaliteResume,
  type ParametreResume,
  type ParametresActionState,
} from "@/modules/administration/parametres";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

const etatInitial: ParametresActionState = { error: null, success: false };

function LigneFonctionnalite({ fonctionnalite }: { fonctionnalite: FonctionnaliteResume }) {
  const [state, formAction, pending] = useActionState(basculerFonctionnaliteAction, etatInitial);

  return (
    <div className="flex flex-col gap-2 border-b border-bordure py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="chiffres text-[13px] font-semibold text-encre">{fonctionnalite.cle}</p>
          <Badge tone={fonctionnalite.actif ? "good" : "neutral"}>
            {fonctionnalite.actif ? "Activée" : "Désactivée"}
          </Badge>
        </div>
        <p className="text-[13px] text-encre-secondaire">{fonctionnalite.description}</p>
        <p className="text-[12px] text-encre-attenuee">
          Modifiée le {formaterDate(fonctionnalite.dateModification)}
        </p>
      </div>
      <form action={formAction}>
        <input type="hidden" name="cle" value={fonctionnalite.cle} />
        <Button
          type="submit"
          variant={fonctionnalite.actif ? "danger" : "primary"}
          size="sm"
          disabled={pending}
        >
          {pending ? "..." : fonctionnalite.actif ? "Désactiver" : "Activer"}
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="text-[13px] text-critique">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function LigneParametre({ parametre }: { parametre: ParametreResume }) {
  const [state, formAction, pending] = useActionState(modifierParametreAction, etatInitial);
  const [valeur, setValeur] = useState(String(parametre.valeur));

  return (
    <div className="flex flex-col gap-2 border-b border-bordure py-3 last:border-0">
      <p className="chiffres text-[13px] font-semibold text-encre">{parametre.cle}</p>
      <p className="text-[13px] text-encre-secondaire">{parametre.description}</p>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="cle" value={parametre.cle} />
        <div className="w-32">
          <TextField
            label="Valeur"
            name="valeur"
            type="number"
            min={parametre.borneMin}
            max={parametre.borneMax}
            value={valeur}
            onChange={(event) => setValeur(event.target.value)}
            hint={`Entre ${parametre.borneMin} et ${parametre.borneMax} (défaut : ${parametre.valeurDefaut})`}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "..." : "Enregistrer"}
        </Button>
        <p className="chiffres text-[12px] text-encre-attenuee">
          Modifié le {formaterDate(parametre.dateModification)}
        </p>
      </form>
      {state.error ? (
        <p role="alert" className="text-[13px] text-critique">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

export function SectionParametres({
  fonctionnalites,
  parametres,
}: {
  fonctionnalites: FonctionnaliteResume[];
  parametres: ParametreResume[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="titre-fonctionnalites" className="flex flex-col gap-4">
        <h2 id="titre-fonctionnalites" className="text-[20px] font-bold text-encre">
          Fonctionnalités activables
        </h2>
        <Alert level="info" title="Désactivées par défaut">
          Toute fonctionnalité listée ici (notamment l&apos;IA) reste désactivée par défaut en
          production, et peut être coupée instantanément sans redéploiement.
        </Alert>
        <Card>
          <div className="flex flex-col">
            {fonctionnalites.map((fonctionnalite) => (
              <LigneFonctionnalite key={fonctionnalite.cle} fonctionnalite={fonctionnalite} />
            ))}
          </div>
        </Card>
      </section>

      <section aria-labelledby="titre-parametres" className="flex flex-col gap-4">
        <h2 id="titre-parametres" className="text-[20px] font-bold text-encre">
          Paramètres numériques
        </h2>
        <Card>
          <div className="flex flex-col">
            {parametres.map((parametre) => (
              <LigneParametre key={parametre.cle} parametre={parametre} />
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
