"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updatePatientProfileAction,
  type DossierPatientResume,
  type PatientActionState,
} from "@/modules/patient/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: PatientActionState = { error: null, success: false };

const optionsGroupeSanguin = [
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
  { value: "inconnu", label: "Je ne sais pas" },
];

/** Meme structure visuelle que FormulaireDossier.tsx (aucun composant "textarea" dedie dans le design system). */
function ChampTexteMultiligne({
  label,
  name,
  hint,
  defaultValue,
}: {
  label: string;
  name: string;
  hint: string;
  defaultValue: string;
}) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre">
        {label}
        <span className="text-[13px] font-normal text-encre-attenuee">(facultatif)</span>
      </label>
      <p id={hintId} className="text-[13px] text-encre-secondaire">
        {hint}
      </p>
      <textarea
        id={fieldId}
        name={name}
        rows={4}
        aria-describedby={hintId}
        defaultValue={defaultValue}
        className="w-full rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

const NOMBRE_ETAPES = 4;

const TITRES_ETAPES = [
  "Votre groupe sanguin",
  "Vos allergies",
  "Vos maladies chroniques",
  "Un contact d'urgence",
];

export interface AssistantPremiereUtilisationProps {
  dossier: DossierPatientResume;
}

/**
 * Assistant de premiere utilisation (F-CIT-01 du pack), affiche une seule
 * fois juste apres l'inscription (registerPatientAction redirige ici plutot
 * que directement vers /app/patient, voir src/modules/identity/actions.ts).
 * Pas de champ "assistant termine" en base : ce n'est pas un ecran auquel on
 * revient plus tard, uniquement une etape du parcours d'inscription, jamais
 * re-affichee ensuite (le patient modifie ces memes informations via
 * /app/patient/dossier apres coup).
 *
 * 4 etapes reprenant exactement les champs cites par l'audit
 * (docs/audit-cote-patient.md, F-CIT-01) : groupe sanguin, allergies,
 * maladies chroniques, contact d'urgence. Un seul formulaire, un seul appel
 * a updatePatientProfileAction (deja existant, src/modules/patient/actions.ts) :
 * chaque etape ne fait qu'afficher/masquer ses propres champs, tous presents
 * dans le DOM du debut a la fin pour que leur valeur survive à la navigation
 * entre etapes sans gestion d'etat React dediee par champ. Les antecedents
 * medicaux (aussi geres par updatePatientProfileAction) ne sont pas repris
 * ici, en dehors des 4 champs cites par l'audit ; toujours modifiables
 * ensuite depuis /app/patient/dossier.
 */
export function AssistantPremiereUtilisation({ dossier }: AssistantPremiereUtilisationProps) {
  const [etape, setEtape] = useState(0);
  const [state, formAction, pending] = useActionState(updatePatientProfileAction, etatInitial);
  const router = useRouter();
  // Garde contre une double soumission (observee en developpement sous Fast
  // Refresh frequent : un rechargement a chaud pendant la soumission peut
  // redeclencher l'action ; jamais reproduit sur /app/patient/dossier, qui
  // n'a pas cette etape multi-ecrans, donc probablement lie a la
  // combinaison useState(etape) + useActionState de ce composant). Une fois
  // la premiere soumission reussie amorcee, plus aucune autre n'est
  // acceptee, meme si le composant est remonte avant que la redirection
  // n'ait eu lieu.
  const dejaSoumis = useRef(false);

  useEffect(() => {
    if (state.success) {
      router.push("/app/patient");
    }
  }, [state.success, router]);

  const contactPrincipal = dossier.contactsUrgence[0];
  const derniereEtape = etape === NOMBRE_ETAPES - 1;

  // Contact d'urgence en champs controles (value/onChange), contrairement
  // aux autres etapes en defaultValue non controle : constate en pratique
  // que ces 3 champs precis arrivaient vides a la soumission finale (les
  // autres etapes, plus tot dans le formulaire, arrivaient elles
  // correctement remplies), reproductible de facon deterministe meme sans
  // aucune modification recente du fichier ni Fast Refresh visible au
  // moment du clic - mecanisme exact non identifie avec certitude (DOM
  // confirme rempli juste avant le clic via .inputValue(), pourtant absent
  // du FormData reellement envoye). Rendre l'etat proprietaire de React
  // plutot que du DOM elimine la classe de bug entiere, quelle qu'en soit
  // la cause exacte.
  const [contactNom, setContactNom] = useState(contactPrincipal?.nom ?? "");
  const [contactTelephone, setContactTelephone] = useState(contactPrincipal?.telephone ?? "");
  const [contactLien, setContactLien] = useState(contactPrincipal?.lienParente ?? "");

  return (
    <Card>
      <div className="mb-5 flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-encre-secondaire">
          Étape {etape + 1} sur {NOMBRE_ETAPES}
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: NOMBRE_ETAPES }).map((_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full ${index <= etape ? "bg-accent" : "bg-bordure"}`}
            />
          ))}
        </div>
        <h2 className="text-[20px] font-bold text-encre">{TITRES_ETAPES[etape]}</h2>
      </div>

      {state.error ? (
        <Alert level="critical" title="Enregistrement impossible" className="mb-4">
          {state.error}
        </Alert>
      ) : null}

      <form
        action={formAction}
        aria-busy={pending}
        className="flex flex-col gap-5"
        onSubmit={(evenement) => {
          if (!derniereEtape || dejaSoumis.current) {
            evenement.preventDefault();
            return;
          }
          dejaSoumis.current = true;
        }}
      >
        <div hidden={etape !== 0}>
          <SelectField
            label="Groupe sanguin"
            name="groupeSanguin"
            options={optionsGroupeSanguin}
            defaultValue={dossier.groupeSanguin || "inconnu"}
            hint="Utile en cas d'urgence. Vous pourrez le préciser plus tard si vous ne le connaissez pas."
          />
        </div>

        <div hidden={etape !== 1}>
          <ChampTexteMultiligne
            label="Allergies"
            name="allergies"
            hint="Une allergie par ligne (ex. pénicilline, arachide). Laissez vide si vous n'en avez pas."
            defaultValue={dossier.allergies.join("\n")}
          />
        </div>

        <div hidden={etape !== 2} className="flex flex-col gap-5">
          <ChampTexteMultiligne
            label="Maladies chroniques"
            name="maladiesChroniques"
            hint="Une maladie chronique par ligne (ex. diabète, hypertension). Laissez vide si vous n'en avez pas."
            defaultValue={dossier.maladiesChroniques.join("\n")}
          />
          {dossier.sexe === "F" ? (
            <label className="flex items-center gap-2 text-[16px] font-semibold text-encre">
              <input type="checkbox" name="grossesseEnCours" defaultChecked={dossier.grossesseEnCours} />
              Grossesse en cours
            </label>
          ) : null}
        </div>

        <div hidden={etape !== 3} className="flex flex-col gap-4">
          <p className="text-[13px] text-encre-secondaire">
            Une personne à prévenir en cas d&apos;urgence (facultatif).
          </p>
          <TextField
            label="Nom complet"
            name="contactUrgenceNom"
            value={contactNom}
            onChange={(evenement) => setContactNom(evenement.target.value)}
          />
          <TextField
            label="Téléphone"
            name="contactUrgenceTelephone"
            type="tel"
            value={contactTelephone}
            onChange={(evenement) => setContactTelephone(evenement.target.value)}
          />
          <TextField
            label="Lien de parenté"
            name="contactUrgenceLien"
            hint="Ex. conjoint(e), parent, enfant, ami(e)."
            value={contactLien}
            onChange={(evenement) => setContactLien(evenement.target.value)}
          />
        </div>

        {/* Antecedents non repris dans cet assistant (voir docstring), mais
            requis par le schema de updatePatientProfileAction cote serveur :
            transmis vide, modifiable ensuite depuis /app/patient/dossier. */}
        <input type="hidden" name="antecedents" value={dossier.antecedents.join("\n")} />

        <div className="flex items-center justify-between gap-3 border-t border-bordure pt-5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/app/patient")}
          >
            Passer pour l&apos;instant
          </Button>

          <div className="flex gap-2">
            {etape > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setEtape((valeur) => valeur - 1)}>
                Précédent
              </Button>
            ) : null}
            {derniereEtape ? (
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Enregistrement en cours..." : "Terminer"}
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={() => setEtape((valeur) => valeur + 1)}>
                Suivant
              </Button>
            )}
          </div>
        </div>
      </form>
    </Card>
  );
}
