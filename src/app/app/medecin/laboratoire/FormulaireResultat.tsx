"use client";

import { useActionState, useId, useRef, useState } from "react";
import {
  saisirResultatExamenAction,
  type ExamenResume,
  type LaboratoireActionState,
} from "@/modules/laboratoire/actions";
import { parametresPourExamen } from "@/modules/laboratoire/referentiel-parametres-examens";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";

/**
 * Saisie structuree par parametre (F-LAB-03 du pack), pour le sous-ensemble
 * d'examens quantitatifs couvert par referentiel-parametres-examens.ts :
 * un champ numerique par parametre (unite affichee), serialise dans un champ
 * cache "parametresJson" a chaque frappe pour rester un <form action=...>
 * natif (Server Action), sans passer par un gestionnaire de soumission JS.
 * L'indicateur (N/L/H/LL/HH) et le rejet des valeurs hors limites
 * physiologiquement possibles (RG-LAB-20) sont calcules cote serveur, jamais
 * ici : ce composant ne fait que collecter la saisie.
 */
function ChampParametresStructures({
  parametres,
  valeursInitiales,
}: {
  parametres: ReturnType<typeof parametresPourExamen>;
  valeursInitiales: Record<string, string>;
}) {
  const [valeurs, setValeurs] = useState<Record<string, string>>(valeursInitiales);

  if (!parametres) return null;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="parametresJson" value={JSON.stringify(Object.entries(valeurs).map(([code, valeur]) => ({ code, valeur })))} />
      {parametres.map((parametre) => {
        const fieldId = `param-${parametre.code}`;
        return (
          <div key={parametre.code} className="flex flex-col gap-1.5">
            <label htmlFor={fieldId} className="text-[14px] font-semibold text-encre">
              {parametre.libelle}{" "}
              <span className="text-critique" aria-hidden="true">
                *
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id={fieldId}
                type="text"
                inputMode="decimal"
                required
                value={valeurs[parametre.code] ?? ""}
                onChange={(e) => setValeurs((v) => ({ ...v, [parametre.code]: e.target.value }))}
                className="w-40 rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              />
              <span className="text-[13px] text-encre-attenuee">{parametre.unite}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const etatInitial: LaboratoireActionState = { error: null, success: false };

/**
 * Champ texte multiligne libre pour le resultat d'examen : le design system
 * (src/components/ui) ne fournit pas de composant "textarea" dedie, seul
 * TextField existe et ne gere que <input>. Reprend la structure visuelle de
 * TextField (label, jetons de style) autour d'un <textarea> natif, comme deja
 * fait localement ailleurs dans le projet (src/app/app/patient/dossier/
 * FormulaireDossier.tsx, src/app/app/ministere/ChampTextarea.tsx).
 */
function ChampResultat({ valeurInitiale }: { valeurInitiale: string }) {
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
      >
        Resultat
        <span className="text-critique" aria-hidden="true">
          *
        </span>
      </label>
      <textarea
        id={fieldId}
        name="resultat"
        rows={6}
        required
        defaultValue={valeurInitiale}
        placeholder="Valeurs mesurees, observations, conclusion..."
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

/**
 * Contenu du formulaire de saisie, isole a part (remonte via la prop "key" du
 * parent a chaque fermeture de la modale) pour repartir d'un useActionState
 * neuf a chaque ouverture, plutot que de conserver l'ecran de succes
 * precedent affiche (meme pattern que FormulaireAjoutPersonnel).
 */
function ContenuFormulaire({
  examen,
  onFermer,
}: {
  examen: ExamenResume;
  onFermer: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    saisirResultatExamenAction,
    etatInitial
  );
  const enCorrection = examen.statut === "correction_demandee";
  const parametresStructures = parametresPourExamen(examen.typeExamen);
  const valeursInitiales = Object.fromEntries(
    (enCorrection ? examen.resultatsParametres ?? [] : []).map((p) => [p.code, String(p.valeur)])
  );

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Resultat enregistre">
          Le resultat a bien ete enregistre. Il est desormais en attente de
          validation par un autre professionnel du laboratoire (principe des
          quatre yeux).
        </Alert>
        <Button type="button" variant="secondary" className="w-fit" onClick={onFermer}>
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
      <input type="hidden" name="examenId" value={examen.id} />

      {enCorrection ? (
        <Alert level="warning" title="Correction demandee">
          {examen.commentaireValidation ?? "Motif du renvoi non precise."}
        </Alert>
      ) : null}

      {state.error ? (
        <Alert level="critical" title="Enregistrement impossible">
          {state.error}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1 rounded-champ border border-bordure bg-plan px-3 py-2">
        <p className="text-[14px] font-semibold text-encre">
          {examen.patientNomComplet ?? "Patient non precise"}
        </p>
        <p className="text-[13px] text-encre-attenuee">
          {examen.patientIdentifiantSante ?? "Identifiant sante non precise"}
        </p>
        <p className="text-[13px] text-encre-secondaire">{examen.typeExamen}</p>
      </div>

      {parametresStructures ? (
        <ChampParametresStructures parametres={parametresStructures} valeursInitiales={valeursInitiales} />
      ) : (
        <ChampResultat valeurInitiale={enCorrection ? examen.resultat ?? "" : ""} />
      )}

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending
          ? "Enregistrement en cours..."
          : enCorrection
            ? "Resaisir le resultat"
            : "Enregistrer le resultat"}
      </Button>
    </form>
  );
}

/**
 * Bouton "Saisir le resultat" (ou "Resaisir le resultat" apres un renvoi pour
 * correction, F-LAB-04) + modale de saisie (saisirResultatExamenAction,
 * module laboratoire/actions). A la fermeture de la modale, la cle du contenu
 * change pour repartir d'un formulaire vierge a la prochaine ouverture.
 */
export function FormulaireResultat({ examen }: { examen: ExamenResume }) {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);
  const enCorrection = examen.statut === "correction_demandee";

  return (
    <>
      <Button
        type="button"
        variant={enCorrection ? "danger" : "secondary"}
        className="w-fit"
        onClick={() => modalRef.current?.showModal()}
      >
        {enCorrection ? "Resaisir le resultat" : "Saisir le resultat"}
      </Button>
      <Modal
        ref={modalRef}
        width="wide"
        title={enCorrection ? "Resaisir le resultat" : "Saisir le resultat"}
        description={`${examen.typeExamen}, ${examen.patientNomComplet ?? "patient non precise"}`}
        onClose={() => setCle((valeur) => valeur + 1)}
      >
        <ContenuFormulaire key={cle} examen={examen} onFermer={() => modalRef.current?.close()} />
      </Modal>
    </>
  );
}
