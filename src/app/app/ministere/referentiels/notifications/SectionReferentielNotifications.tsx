"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  basculerActifModeleNotificationAction,
  creerModeleNotificationAction,
  mettreAJourTexteModeleAction,
  type ModeleNotificationResume,
  type ReferentielNotificationActionState,
} from "@/modules/administration/referentiel-notifications";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReferentielNotificationActionState = { error: null, success: false };

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

function LigneNotification({ entree }: { entree: ModeleNotificationResume }) {
  const router = useRouter();
  const [etatTexte, actionTexte, pendingTexte] = useActionState(mettreAJourTexteModeleAction, etatInitial);
  const [etatBasculement, actionBasculement, pendingBasculement] = useActionState(
    basculerActifModeleNotificationAction,
    etatInitial
  );

  useEffect(() => {
    if (etatTexte.success || etatBasculement.success) {
      router.refresh();
    }
  }, [etatTexte.success, etatBasculement.success, router]);

  return (
    <div className="flex flex-col gap-3 border-b border-bordure py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chiffres text-[12px] font-semibold text-encre">{entree.code}</span>
        <Badge tone={entree.actif ? "good" : "neutral"}>{entree.actif ? "Actif" : "Désactivé"}</Badge>
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

      <div className="grid gap-1 text-[13px] text-encre-secondaire sm:grid-cols-3">
        <p>
          <span className="font-semibold text-encre">Déclencheur : </span>
          {entree.declencheur || "-"}
        </p>
        <p>
          <span className="font-semibold text-encre">Destinataire : </span>
          {entree.destinataire || "-"}
        </p>
        <p>
          <span className="font-semibold text-encre">Canaux : </span>
          {entree.canaux || "-"}
        </p>
      </div>

      <form action={actionTexte} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={entree.id} />
        <div className="min-w-72 flex-1">
          <TextField
            label="Texte du modèle (SMS)"
            name="texteModele"
            defaultValue={entree.texteModele}
            maxLength={320}
            placeholder="Ex. BHIP : ..."
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={pendingTexte}>
          {pendingTexte ? "Enregistrement..." : "Enregistrer le texte"}
        </Button>
      </form>

      {etatTexte.error ? (
        <p role="alert" className="text-[13px] text-critique">
          {etatTexte.error}
        </p>
      ) : null}
      {etatBasculement.error ? (
        <p role="alert" className="text-[13px] text-critique">
          {etatBasculement.error}
        </p>
      ) : null}

      <p className="text-[12px] text-encre-attenuee">Modifié le {formaterDate(entree.dateModification)}</p>
    </div>
  );
}

function FormulaireAjoutNotification() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(creerModeleNotificationAction, etatInitial);
  const [cle, setCle] = useState(0);

  useEffect(() => {
    if (state.success) {
      setCle((valeur) => valeur + 1);
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? (
        <Alert level="critical" title="Ajout impossible">
          {state.error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <TextField key={`code-${cle}`} label="Code" name="code" required maxLength={60} placeholder="Ex. N-CUSTOM" />
        </div>
        <div className="w-64">
          <TextField key={`declencheur-${cle}`} label="Déclencheur" name="declencheur" required maxLength={200} />
        </div>
        <div className="w-64">
          <TextField key={`destinataire-${cle}`} label="Destinataire" name="destinataire" required maxLength={200} />
        </div>
        <div className="w-48">
          <TextField key={`canaux-${cle}`} label="Canaux" name="canaux" required maxLength={100} placeholder="Interne + SMS" />
        </div>
      </div>
      <div className="w-full">
        <TextField
          key={`texte-${cle}`}
          label="Texte du modèle (SMS)"
          name="texteModele"
          maxLength={320}
          placeholder="Ex. BHIP : ..."
        />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={pending} className="w-fit">
        {pending ? "Ajout en cours..." : "Ajouter"}
      </Button>
    </form>
  );
}

export function SectionReferentielNotifications({ referentiel }: { referentiel: ModeleNotificationResume[] }) {
  return (
    <div className="flex flex-col gap-6">
      <Card description="Nouveau code ajouté à la fin de la liste, actif par défaut. Les 24 codes du catalogue d'origine sont déjà présents ci-dessous.">
        <FormulaireAjoutNotification />
      </Card>

      <Card>
        <div className="flex flex-col">
          {referentiel.map((entree) => (
            <LigneNotification key={entree.id} entree={entree} />
          ))}
        </div>
      </Card>
    </div>
  );
}
