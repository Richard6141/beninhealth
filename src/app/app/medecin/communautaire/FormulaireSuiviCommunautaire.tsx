"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import {
  creerSuiviCommunautaireAction,
  type PersonneCommunautaireResume,
  type SigneDangerResume,
  type SuiviCommunautaireActionState,
} from "@/modules/communautaire/actions";
import { LIBELLES_TYPE_VISITE, TYPES_VISITE_COMMUNAUTAIRE } from "@/modules/communautaire/communautaire-catalogue";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ModalNouvellePersonne } from "./ModalNouvellePersonne";
import { FormulaireVaccinationCommunautaire } from "./FormulaireVaccinationCommunautaire";

const etatInitial: SuiviCommunautaireActionState = { error: null, success: false };

const optionsTypeVisite = TYPES_VISITE_COMMUNAUTAIRE.map((type) => ({
  value: type,
  label: LIBELLES_TYPE_VISITE[type],
}));

/**
 * Signes de danger a cocher (F-COM-03, RG-COM-10) pour le type de visite
 * choisi : au moins une case cochee affiche l'alerte "Referer immediatement"
 * et cree une reference communautaire a la soumission (jamais un diagnostic
 * ni un traitement, RG-COM-11, la decision reste humaine ensuite).
 */
function ChampsSignesDanger({
  signes,
  signesCoches,
  onChangeSignesCoches,
}: {
  signes: SigneDangerResume[];
  signesCoches: string[];
  onChangeSignesCoches: (signes: string[]) => void;
}) {
  if (signes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-champ border border-bordure-forte bg-plan p-4">
      <p className="text-[14px] font-semibold text-encre">
        Signes de danger observés
        <span className="ml-1.5 text-[13px] font-normal text-encre-attenuee">(cochez si présent)</span>
      </p>
      <div className="flex flex-col gap-2">
        {signes.map((signe) => (
          <label key={signe.id} className="flex items-center gap-2 text-[14px] text-encre">
            <input
              type="checkbox"
              name="signesDanger"
              value={signe.libelle}
              checked={signesCoches.includes(signe.libelle)}
              onChange={(evenement) => {
                onChangeSignesCoches(
                  evenement.target.checked
                    ? [...signesCoches, signe.libelle]
                    : signesCoches.filter((libelle) => libelle !== signe.libelle)
                );
              }}
            />
            {signe.libelle}
          </label>
        ))}
      </div>
      {signesCoches.length > 0 ? (
        <div className="mt-1 flex items-start gap-2 rounded-champ border border-critique bg-critique-clair px-3 py-2.5 text-[14px] font-semibold text-critique">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          Référer immédiatement au centre de santé
        </div>
      ) : null}
    </div>
  );
}

/**
 * Champ notes multiligne libre : le design system ne fournit pas de
 * composant "textarea" dedie (voir src/app/app/medecin/laboratoire/
 * FormulaireResultat.tsx, meme constat local).
 */
function ChampNotes() {
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
      >
        Notes
        <span className="text-[13px] font-normal text-encre-attenuee">(facultatif)</span>
      </label>
      <textarea
        id={fieldId}
        name="notes"
        rows={3}
        placeholder="Observations, recommandations, suivi à prévoir..."
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

const VALEUR_NOUVEAU_BENEFICIAIRE = "";

/**
 * Contenu du formulaire, isole a part (remonte via la prop "key" du parent
 * apres chaque visite enregistree) pour repartir d'un useActionState neuf,
 * meme pattern que src/app/app/medecin/laboratoire/FormulaireResultat.tsx.
 */
function ContenuFormulaire({
  personnesInitiales,
  signesDangerParType,
  onNouvelleVisite,
}: {
  personnesInitiales: PersonneCommunautaireResume[];
  signesDangerParType: Record<string, SigneDangerResume[]>;
  onNouvelleVisite: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    creerSuiviCommunautaireAction,
    etatInitial
  );
  const router = useRouter();
  const [personnes, setPersonnes] = useState(personnesInitiales);
  const [personneId, setPersonneId] = useState(VALEUR_NOUVEAU_BENEFICIAIRE);
  const [typeVisite, setTypeVisite] = useState("");
  const [signesCoches, setSignesCoches] = useState<string[]>([]);
  const [cleVaccination, setCleVaccination] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Visite enregistrée">
          La visite a bien été ajoutée à votre historique de suivi communautaire.
        </Alert>
        {state.avertissementDoublonBeneficiaire ? (
          <Alert level="warning" title="Bénéficiaire peut-être déjà connu">
            {state.avertissementDoublonBeneficiaire}
          </Alert>
        ) : null}
        {state.referenceCreee ? (
          <Alert level="critical" title="Référence communautaire créée">
            Le centre de santé de votre établissement a été informé et verra
            cette référence. Ceci ne remplace pas un avis médical : orientez
            le bénéficiaire vers le centre de santé dès que possible.
          </Alert>
        ) : null}
        <Button type="button" variant="secondary" className="w-fit" onClick={onNouvelleVisite}>
          Enregistrer une nouvelle visite
        </Button>
      </div>
    );
  }

  const optionsPersonnes = [
    { value: VALEUR_NOUVEAU_BENEFICIAIRE, label: "Saisir un nom (sans enregistrement)" },
    ...personnes.map((personne) => ({ value: personne.id, label: personne.nomComplet })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={formRef}
        aria-busy={pending}
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          // Jamais de prop action={formAction} sur ce <form> : un champ
          // controle (le premier signe de danger coche, name="signesDanger")
          // n'arrivait pas de facon fiable dans le FormData que React
          // construit lui-meme pour un <form action={...}>, alors qu'un
          // `new FormData(form)` construit a la main au meme instant le
          // contient correctement (meme constat que
          // src/app/app/patient/bienvenue/AssistantPremiereUtilisation.tsx,
          // F-CIT-04). On construit donc le FormData nous-memes et on y
          // complete signesDanger depuis l'etat React, avant d'appeler
          // formAction manuellement (voir react.dev/reference/react/useActionState).
          evenement.preventDefault();
          const donnees = new FormData(evenement.currentTarget);
          donnees.delete("signesDanger");
          for (const libelle of signesCoches) donnees.append("signesDanger", libelle);
          startTransition(() => {
            formAction(donnees);
          });
        }}
      >
        {state.error ? (
          <Alert level="critical" title="Enregistrement impossible">
            {state.error}
          </Alert>
        ) : null}

        <input type="hidden" name="personneId" value={personneId} />

        <div className="flex flex-col gap-1.5">
          <SelectField
            label="Bénéficiaire"
            name="personneSelection"
            // Jamais "required" ici : sa premiere option ("Saisir un nom (sans
            // enregistrement)") porte volontairement la valeur vide "",
            // choix par defaut valide (beneficiaireNom pris a la place). Un
            // <select required> avec une valeur vide selectionnee est
            // invalide au sens HTML5 : le navigateur bloque alors la
            // soumission native du <form> AVANT meme que React ne la voie
            // (constate en direct : le clic sur "Enregistrer la visite" ne
            // produisait plus aucune requete reseau une fois ce <form>
            // repasse en soumission manuelle, voir onSubmit plus haut, qui a
            // fait ressortir cette validation HTML5 jusque-la contournee par
            // le mecanisme interne de <form action={...}>). Validation reelle
            // deja assuree cote serveur (schemaSuivi + le controle explicite
            // juste apres, "Le nom du beneficiaire est obligatoire").
            options={optionsPersonnes}
            value={personneId}
            onChange={(e) => setPersonneId(e.target.value)}
          />
        </div>

        {personneId === VALEUR_NOUVEAU_BENEFICIAIRE ? (
          <TextField
            label="Nom du bénéficiaire"
            name="beneficiaireNom"
            required
            placeholder="Nom et prénom"
          />
        ) : null}

        <SelectField
          label="Type de visite"
          name="typeVisite"
          required
          options={optionsTypeVisite}
          placeholder="Choisir un type de visite"
          value={typeVisite}
          onChange={(e) => {
            setTypeVisite(e.target.value);
            setSignesCoches([]);
          }}
        />
        <ChampsSignesDanger
          signes={signesDangerParType[typeVisite] ?? []}
          signesCoches={signesCoches}
          onChangeSignesCoches={setSignesCoches}
        />
        <TextField label="Localisation" name="localisation" placeholder="Quartier, village..." />
        <ChampNotes />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
          {pending ? "Enregistrement en cours..." : "Enregistrer la visite"}
        </Button>
      </form>

      {/*
        En dehors du <form> ci-dessus : un <form> (celui de la modale) ne
        peut jamais etre imbrique dans un autre <form> (HTML invalide, cause
        une erreur d'hydratation et desactive silencieusement la soumission
        du formulaire imbrique). Aucun changement visuel : <dialog> s'affiche
        de toute facon par-dessus tout le reste une fois ouvert.
      */}
      <ModalNouvellePersonne
        onPersonneCreee={(personne) => {
          setPersonnes((liste) => [personne, ...liste]);
          setPersonneId(personne.id);
        }}
      />

      {typeVisite === "vaccination" ? (
        personneId !== VALEUR_NOUVEAU_BENEFICIAIRE ? (
          <FormulaireVaccinationCommunautaire
            key={cleVaccination}
            personneId={personneId}
            onEnregistree={() => setCleVaccination((valeur) => valeur + 1)}
          />
        ) : (
          <Alert level="info" title="Vaccin, dose et lot non enregistrés">
            Ces informations détaillées ne peuvent être ajoutées au carnet de
            vaccination que pour une personne enregistrée. Enregistrez
            d&apos;abord cette personne (bouton ci-dessus) pour saisir le
            vaccin, la dose et le lot.
          </Alert>
        )
      ) : null}
    </div>
  );
}

/** Formulaire d'enregistrement d'une visite de suivi communautaire (creerSuiviCommunautaireAction, module communautaire). */
export function FormulaireSuiviCommunautaire({
  personnes,
  signesDangerParType,
}: {
  personnes: PersonneCommunautaireResume[];
  signesDangerParType: Record<string, SigneDangerResume[]>;
}) {
  const [cle, setCle] = useState(0);

  return (
    <Card
      title="Enregistrer une visite"
      description="Chaque visite de terrain est tracée dans votre historique de suivi."
    >
      <ContenuFormulaire
        key={cle}
        personnesInitiales={personnes}
        signesDangerParType={signesDangerParType}
        onNouvelleVisite={() => setCle((valeur) => valeur + 1)}
      />
    </Card>
  );
}
