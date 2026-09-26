"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  basculerActifJourFerieAction,
  creerJourFerieAction,
  genererJoursFeriesAction,
  type JourFerieResume,
  type ReferentielJoursFeriesActionState,
} from "@/modules/administration/jours-feries";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReferentielJoursFeriesActionState = { error: null, success: false };

function formaterJour(jour: string): string {
  try {
    return new Date(`${jour}T00:00:00.000Z`).toLocaleDateString("fr-FR", {
      dateStyle: "full",
      timeZone: "UTC",
    });
  } catch {
    return jour;
  }
}

function LigneJourFerie({ jour }: { jour: JourFerieResume }) {
  const router = useRouter();
  const [etat, action, enCours] = useActionState(basculerActifJourFerieAction, etatInitial);

  useEffect(() => {
    if (etat.success) {
      router.refresh();
    }
  }, [etat.success, router]);

  return (
    <div className="flex flex-col gap-2 border-b border-bordure py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-encre">{jour.libelle}</p>
          <Badge tone={jour.actif ? "good" : "neutral"}>{jour.actif ? "Actif" : "Désactivé"}</Badge>
          <Badge tone="neutral">{jour.source === "genere" ? "Généré" : "Saisi"}</Badge>
        </div>
        <p className="chiffres text-[12px] text-encre-attenuee">{formaterJour(jour.date)}</p>
      </div>

      <form action={action}>
        <input type="hidden" name="id" value={jour.id} />
        <Button type="submit" variant={jour.actif ? "danger" : "primary"} size="sm" disabled={enCours}>
          {enCours ? "..." : jour.actif ? "Désactiver" : "Activer"}
        </Button>
      </form>

      {etat.error ? (
        <p role="alert" className="w-full text-[13px] text-critique">
          {etat.error}
        </p>
      ) : null}
    </div>
  );
}

function FormulaireGeneration({ annee }: { annee: number }) {
  const router = useRouter();
  const [etat, action, enCours] = useActionState(genererJoursFeriesAction, etatInitial);

  useEffect(() => {
    if (etat.success) {
      router.refresh();
    }
  }, [etat, router]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="annee" value={annee} />
      {etat.error ? (
        <Alert level="critical" title="Génération impossible">
          {etat.error}
        </Alert>
      ) : null}
      {etat.success ? (
        <Alert level="success" title="Génération terminée">
          {etat.nombreAjoutes === 0
            ? "Tous les jours de cette année étaient déjà dans le référentiel."
            : `${etat.nombreAjoutes} jour(s) férié(s) ajouté(s).`}
        </Alert>
      ) : null}
      <p className="text-[13px] text-encre-secondaire">
        Ajoute les dates fixes et les fêtes chrétiennes mobiles de {annee} qui manquent. Une date déjà présente, même
        désactivée, n&apos;est jamais modifiée.
      </p>
      <Button type="submit" variant="secondary" size="sm" className="w-fit" disabled={enCours}>
        {enCours ? "Génération en cours..." : `Générer les jours fériés de ${annee}`}
      </Button>
    </form>
  );
}

function FormulaireAjout() {
  const router = useRouter();
  const [etat, action, enCours] = useActionState(creerJourFerieAction, etatInitial);
  const [cle, setCle] = useState(0);
  const [etatTraite, setEtatTraite] = useState(etat);

  // Nouveau succes : on repart d'un formulaire vierge. Comparaison d'etat au
  // rendu plutot que setState dans un effet (react-hooks/set-state-in-effect).
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
      {etat.error ? (
        <Alert level="critical" title="Ajout impossible" className="w-full">
          {etat.error}
        </Alert>
      ) : null}
      <div className="w-48">
        <TextField key={`date-${cle}`} label="Date" name="date" type="date" required />
      </div>
      <div className="w-72">
        <TextField
          key={`libelle-${cle}`}
          label="Libellé"
          name="libelle"
          required
          maxLength={100}
          placeholder="Ex. Aïd el-Fitr"
        />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={enCours}>
        {enCours ? "Ajout en cours..." : "Ajouter"}
      </Button>
    </form>
  );
}

export function SectionJoursFeries({ annee, jours }: { annee: number; jours: JourFerieResume[] }) {
  return (
    <div className="flex flex-col gap-6">
      <Card
        title={`Générer les jours fériés de ${annee}`}
        description="Dates fixes et fêtes chrétiennes mobiles, calculées. Les fêtes musulmanes dépendent de la lune : à saisir à la main ci-dessous."
      >
        <FormulaireGeneration annee={annee} />
      </Card>

      <Card description="Ajouter un jour férié à la main (fête musulmane, jour exceptionnel). Actif dès la création.">
        <FormulaireAjout />
      </Card>

      <Card title={`Jours fériés de ${annee}`}>
        {jours.length === 0 ? (
          <p className="text-[13px] text-encre-attenuee">
            Aucun jour férié enregistré pour {annee}. Aucun rendez-vous n&apos;est bloqué tant que l&apos;année n&apos;est
            pas renseignée.
          </p>
        ) : (
          <div className="flex flex-col">
            {jours.map((jour) => (
              <LigneJourFerie key={jour.id} jour={jour} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
