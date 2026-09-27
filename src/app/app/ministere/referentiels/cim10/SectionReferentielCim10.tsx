"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  basculerDiagnosticCim10Action,
  creerDiagnosticCim10Action,
  type DiagnosticCim10Resume,
  type ReferentielCim10ActionState,
} from "@/modules/administration/referentiel-cim10";
import { LIBELLES_GROUPES_CIM10, type GroupeCim10 } from "@/modules/administration/cim10-groupes";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReferentielCim10ActionState = { error: null, success: false };

function libelleGroupe(groupe: string): string {
  return LIBELLES_GROUPES_CIM10[groupe as GroupeCim10] ?? groupe;
}

function LigneDiagnostic({ diagnostic }: { diagnostic: DiagnosticCim10Resume }) {
  const router = useRouter();
  const [etatActif, actionActif, pendingActif] = useActionState(basculerDiagnosticCim10Action, etatInitial);
  const [etatSensible, actionSensible, pendingSensible] = useActionState(basculerDiagnosticCim10Action, etatInitial);

  // Un effet par action, sur l'objet d'etat et non sur son booleen : une seconde action sur la meme ligne doit rafraichir aussi.
  useEffect(() => {
    if (etatActif.success) {
      router.refresh();
    }
  }, [etatActif, router]);

  useEffect(() => {
    if (etatSensible.success) {
      router.refresh();
    }
  }, [etatSensible, router]);

  return (
    <div className="flex flex-col gap-2 border-b border-bordure py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chiffres text-[14px] font-bold text-accent">{diagnostic.code}</span>
          <p className="text-[14px] font-semibold text-encre">{diagnostic.libelle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{libelleGroupe(diagnostic.groupeMaladie)}</Badge>
          {diagnostic.sensible ? <Badge tone="critical">Sensible</Badge> : null}
          <Badge tone={diagnostic.actif ? "good" : "neutral"}>{diagnostic.actif ? "Actif" : "Désactivé"}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={actionSensible}>
          <input type="hidden" name="id" value={diagnostic.id} />
          <input type="hidden" name="champ" value="sensible" />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            aria-label={`${diagnostic.sensible ? "Retirer le caractère sensible de" : "Marquer sensible"} ${diagnostic.code}`}
            disabled={pendingSensible}
          >
            {diagnostic.sensible ? "Non sensible" : "Sensible"}
          </Button>
        </form>
        <form action={actionActif}>
          <input type="hidden" name="id" value={diagnostic.id} />
          <input type="hidden" name="champ" value="actif" />
          <Button
            type="submit"
            variant={diagnostic.actif ? "danger" : "primary"}
            size="sm"
            aria-label={`${diagnostic.actif ? "Désactiver" : "Activer"} ${diagnostic.code}`}
            disabled={pendingActif}
          >
            {pendingActif ? "..." : diagnostic.actif ? "Désactiver" : "Activer"}
          </Button>
        </form>
      </div>

      {etatActif.error || etatSensible.error ? (
        <p role="alert" className="w-full text-[13px] text-critique">
          {etatActif.error ?? etatSensible.error}
        </p>
      ) : null}
    </div>
  );
}

function FormulaireAjout() {
  const router = useRouter();
  const [etat, action, enCours] = useActionState(creerDiagnosticCim10Action, etatInitial);
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
      {etat.error ? (
        <Alert level="critical" title="Ajout impossible" className="w-full">
          {etat.error}
        </Alert>
      ) : null}
      <div className="w-36">
        <TextField key={`code-${cle}`} label="Code" name="code" required maxLength={8} placeholder="Ex. B50.9" />
      </div>
      <div className="w-96 max-w-full">
        <TextField key={`libelle-${cle}`} label="Libellé" name="libelle" required maxLength={250} />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={enCours}>
        {enCours ? "Ajout en cours..." : "Ajouter"}
      </Button>
    </form>
  );
}

export function SectionReferentielCim10({ diagnostics }: { diagnostics: DiagnosticCim10Resume[] }) {
  return (
    <div className="flex flex-col gap-6">
      <Card description="Le groupe de maladies, le chapitre et le caractère sensible se déduisent du code ; le caractère sensible se corrige ensuite code par code.">
        <FormulaireAjout />
      </Card>

      <Card title={`${diagnostics.length} diagnostic${diagnostics.length > 1 ? "s" : ""}`}>
        {diagnostics.length === 0 ? (
          <p className="text-[13px] text-encre-attenuee">Aucun diagnostic ne correspond à cette recherche.</p>
        ) : (
          <div className="flex flex-col">
            {diagnostics.map((diagnostic) => (
              <LigneDiagnostic key={diagnostic.id} diagnostic={diagnostic} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
