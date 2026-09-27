"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import {
  signalerAccesSuspectAction,
  type AccesDossier,
  type PatientActionState,
} from "@/modules/patient/actions";
import type { NomRole } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** Même table que src/app/app/layout.tsx (non exportée depuis ce fichier), pour un libellé de rôle cohérent. */
const LIBELLES_ROLE: Record<NomRole, string> = {
  patient: "Patient",
  medecin: "Médecin",
  infirmier: "Infirmier",
  agent_communautaire: "Agent communautaire",
  pharmacien: "Pharmacien",
  laboratoire: "Laboratoire",
  admin_etablissement: "Administrateur d'établissement",
  admin_national: "Administrateur national",
};

/**
 * Libellés FR par (cible, action). RG-CIT-100 : couvre médecin, laboratoire,
 * pharmacie et agent communautaire, pas seulement la fiche de vérification.
 * Certains codes action (ex. "creation") sont réutilisés d'un module à
 * l'autre : la cible lève l'ambiguïté.
 */
const LIBELLES_ACTION: Record<string, Record<string, string>> = {
  patient: {
    creation_patient_par_professionnel: "création du dossier",
    consultation_resume_patient: "résumé du dossier",
    consultation_historique_patient: "historique complet du dossier",
    consultation_fiche_verification: "fiche de vérification (identité, résumé santé)",
    acces_urgence: "accès d'urgence (bris de glace)",
  },
  consultation: {
    creation: "consultation",
    creation_brouillon: "consultation (brouillon)",
    validation_consultation: "consultation",
    ajout_addendum: "consultation (complément ajouté)",
    retrait_consultation: "consultation (retrait pour erreur)",
    consultation_historique_detail: "consultation (détail depuis l'historique)",
  },
  prescription: {
    creation: "prescription",
    forcage_alerte_allergie: "prescription (alerte allergie forcée)",
    delivrance: "prescription (délivrance)",
    consultation_historique_detail: "prescription (détail depuis l'historique)",
  },
  examen_medical: {
    creation: "examen (demande)",
    modification: "examen (résultat enregistré)",
    annonce_resultat_examen: "examen (résultat annoncé)",
    consultation_historique_detail: "examen (détail depuis l'historique)",
  },
  suivi_communautaire: {
    creation: "visite de suivi communautaire",
    consultation_historique_detail: "suivi communautaire (détail depuis l'historique)",
  },
  document_medical: {
    consultation_document_medical: "document médical (ouverture)",
    ajout_document_medical: "document médical (ajout)",
    retrait_document_medical: "document médical (retrait pour erreur)",
  },
  vaccination: {
    creation_vaccination: "vaccination (enregistrement)",
    retrait_vaccination: "vaccination (retrait pour erreur)",
  },
  prise_en_charge_infirmiere: {
    creation_prise_en_charge_infirmiere: "prise en charge infirmière",
  },
  reference_patient: {
    creation_reference_patient: "référence vers un autre établissement",
    contre_reference_patient: "retour de référence",
  },
  delivrance: {
    creation_delivrance: "délivrance de médicaments",
    annulation_delivrance: "délivrance de médicaments (annulée)",
  },
};

function libelleAcces(cible: string, action: string): string {
  return LIBELLES_ACTION[cible]?.[action] ?? action;
}

function formaterJour(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

function formaterHeure(date: string): string {
  try {
    return new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return date;
  }
}

interface TypeAcces {
  cible: string;
  action: string;
}

interface GroupeAcces {
  cle: string;
  acteurNomComplet: string;
  acteurRole: NomRole | null;
  etablissementNom: string | null;
  jourLibelle: string;
  dernierAcces: string;
  entreeIds: string[];
  typesAcces: TypeAcces[];
  // F-CLI-10 : un acces d'urgence "bris de glace" doit apparaitre en rouge en
  // tete, avec la justification saisie par le professionnel (CA-2).
  estUrgence: boolean;
  justificationUrgence: string;
}

/**
 * Regroupe les accès par acteur et par jour civil (RG-ACC-61/RG-CIT-100 : le
 * patient doit voir "qui, quand, quoi" sans une ligne par événement brut, qui
 * serait illisible dès qu'un même professionnel consulte plusieurs fois dans
 * la journée).
 */
function regrouperParActeurEtJour(acces: AccesDossier[]): GroupeAcces[] {
  const groupes = new Map<string, GroupeAcces>();

  for (const entree of acces) {
    const jour = entree.date.slice(0, 10); // YYYY-MM-DD
    const cle = `${entree.acteurNomComplet}__${jour}`;
    const existant = groupes.get(cle);

    const estUrgence = entree.action === "acces_urgence";

    if (existant) {
      existant.entreeIds.push(entree.id);
      if (!existant.typesAcces.some((t) => t.cible === entree.cible && t.action === entree.action)) {
        existant.typesAcces.push({ cible: entree.cible, action: entree.action });
      }
      if (entree.date > existant.dernierAcces) {
        existant.dernierAcces = entree.date;
      }
      if (estUrgence) {
        existant.estUrgence = true;
        existant.justificationUrgence = entree.justification;
      }
      continue;
    }

    groupes.set(cle, {
      cle,
      acteurNomComplet: entree.acteurNomComplet,
      acteurRole: entree.acteurRole,
      etablissementNom: entree.etablissementNom,
      jourLibelle: formaterJour(entree.date),
      dernierAcces: entree.date,
      entreeIds: [entree.id],
      typesAcces: [{ cible: entree.cible, action: entree.action }],
      estUrgence,
      justificationUrgence: estUrgence ? entree.justification : "",
    });
  }

  return [...groupes.values()].sort((a, b) => {
    if (a.estUrgence !== b.estUrgence) return a.estUrgence ? -1 : 1;
    return a.dernierAcces < b.dernierAcces ? 1 : -1;
  });
}

const ETAT_INITIAL: PatientActionState = { error: null, success: false };

/** RG-CIT-101 : "Je ne reconnais pas cet accès" → signalement tracé pour un futur audit. */
function BoutonSignalement({ entreeIds }: { entreeIds: string[] }) {
  const [state, formAction, pending] = useActionState(signalerAccesSuspectAction, ETAT_INITIAL);
  const [ouvert, setOuvert] = useState(false);
  const motifId = useId();

  if (state.success) {
    return <p className="text-[12.5px] font-semibold text-bon">Signalement envoyé, il sera examiné.</p>;
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="w-fit text-[12.5px] font-semibold text-critique transition-colors motion-reduce:transition-none hover:underline"
      >
        Je ne reconnais pas cet accès
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-champ border border-bordure bg-plan p-3">
      {entreeIds.map((id) => (
        <input key={id} type="hidden" name="entreeId" value={id} />
      ))}
      <label htmlFor={motifId} className="text-[12.5px] font-semibold text-encre">
        Pourquoi ne reconnaissez-vous pas cet accès ? (facultatif)
      </label>
      <textarea
        id={motifId}
        name="motif"
        rows={2}
        maxLength={500}
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[14px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
      {state.error ? <p className="text-[12.5px] text-critique">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Envoi..." : "Signaler cet accès"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Liste interactive de l'historique des accès (F-CIT-12) : filtre par type, regroupement, signalement. */
export function ListeAccesDossier({ acces }: { acces: AccesDossier[] }) {
  const groupes = useMemo(() => regrouperParActeurEtJour(acces), [acces]);
  const [filtreType, setFiltreType] = useState("tous");

  const typesDisponibles = useMemo(() => {
    const ensemble = new Map<string, string>();
    for (const groupe of groupes) {
      for (const { cible, action } of groupe.typesAcces) {
        ensemble.set(`${cible}:${action}`, libelleAcces(cible, action));
      }
    }
    return [...ensemble.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [groupes]);

  const groupesFiltres =
    filtreType === "tous"
      ? groupes
      : groupes.filter((groupe) =>
          groupe.typesAcces.some(({ cible, action }) => `${cible}:${action}` === filtreType)
        );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-bold text-encre">Historique des accès</h2>
        <div className="flex items-center gap-3">
          {typesDisponibles.length > 1 ? (
            <select
              value={filtreType}
              onChange={(event) => setFiltreType(event.target.value)}
              aria-label="Filtrer par type d'accès"
              className="h-9 rounded-champ border border-bordure-forte bg-surface px-2.5 text-[13px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              <option value="tous">Tous les types d&apos;accès</option>
              {typesDisponibles.map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </select>
          ) : null}
          <span className="text-[13px] font-semibold text-encre-secondaire">
            {groupesFiltres.length} {groupesFiltres.length > 1 ? "entrées" : "entrée"}
          </span>
        </div>
      </div>

      {groupesFiltres.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
            <ShieldAlert size={20} aria-hidden="true" />
          </span>
          <p className="text-[14px] font-semibold text-encre">
            {groupes.length === 0 ? "Aucun accès à votre dossier pour le moment" : "Aucun résultat pour ce filtre"}
          </p>
          <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
            {groupes.length === 0
              ? "Dès qu'un professionnel autorisé consultera votre dossier, l'accès apparaîtra ici."
              : "Essayez un autre type d'accès."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupesFiltres.map((groupe) => (
            <Card
              key={groupe.cle}
              className={groupe.estUrgence ? "border-critique bg-critique-clair" : undefined}
            >
              <div className="flex flex-col gap-2">
                {groupe.estUrgence ? (
                  <span className="flex w-fit items-center gap-1.5 rounded-champ bg-critique px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-white">
                    <ShieldAlert size={13} aria-hidden="true" />
                    Accès d&apos;urgence
                  </span>
                ) : null}
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[15px] font-bold text-encre">
                    {groupe.acteurNomComplet}
                    {groupe.acteurRole ? (
                      <span className="font-normal text-encre-secondaire"> · {LIBELLES_ROLE[groupe.acteurRole]}</span>
                    ) : null}
                  </p>
                  <span className="text-[12.5px] text-encre-attenuee">
                    {groupe.jourLibelle} à {formaterHeure(groupe.dernierAcces)}
                  </span>
                </div>
                {groupe.etablissementNom ? (
                  <p className="text-[13px] text-encre-secondaire">{groupe.etablissementNom}</p>
                ) : null}
                <p className="text-[13px] text-encre-attenuee">
                  A consulté :{" "}
                  {groupe.typesAcces.map(({ cible, action }) => libelleAcces(cible, action)).join(", ")}
                </p>
                {groupe.estUrgence && groupe.justificationUrgence ? (
                  <p className="text-[13px] text-encre">
                    <span className="font-semibold">Justification :</span> {groupe.justificationUrgence}
                  </p>
                ) : null}
                <BoutonSignalement entreeIds={groupe.entreeIds} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
