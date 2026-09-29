"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Clock, Send } from "lucide-react";
import {
  genererCodePartageAction,
  getStatutCodePartage,
  type GenerationCodePartageState,
} from "@/modules/partage/actions";
import { OPTIONS_DUREE_CONSENTEMENT } from "@/modules/patient/consentement-durees";
import {
  NIVEAU_VERIFICATION_MINIMAL_FULL_SENSITIVE,
  OPTIONS_NIVEAU_ACCES_CONSENTEMENT,
} from "@/modules/patient/consentement-niveaux";
import type { NiveauAccesConsentement } from "@/modules/patient/consentement-niveaux";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";

const etatInitial: GenerationCodePartageState = { error: null, success: false };

const INTERVALLE_SONDAGE_MS = 5000;

function secondesRestantes(expireLeISO: string): number {
  return Math.max(0, Math.round((new Date(expireLeISO).getTime() - Date.now()) / 1000));
}

export interface GenerateurCodePartageProps {
  /** Niveau de verification d'identite du patient connecte (N0 a N3, meme regle que F-CIT-10, RG-ACC-13/CA-2). */
  niveauVerification: string | null;
}

/**
 * Generation d'un code de partage temporaire (F-CIT-11 du pack) : le patient
 * choisit le niveau d'acces et la duree du consentement resultant (comme
 * F-CIT-10, memes options), puis declenche genererCodePartageAction. Affiche
 * ensuite le code en grand pendant sa duree de validite (10 min) avec un
 * compte a rebours, en sondant getStatutCodePartage toutes les 5 secondes
 * pour detecter une consommation ("Partagé avec Dr X en temps réel", comme
 * demande par le pack).
 */
export function GenerateurCodePartage({ niveauVerification }: GenerateurCodePartageProps) {
  const [state, formAction, pending] = useActionState(genererCodePartageAction, etatInitial);
  const [statutConsomme, setStatutConsomme] = useState<string | null>(null);
  const [secondes, setSecondes] = useState<number | null>(null);
  const [niveauAcces, setNiveauAcces] = useState<NiveauAccesConsentement | "">("");
  const [duree, setDuree] = useState("");
  const intervalleSondage = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalleCompteARebours = useRef<ReturnType<typeof setInterval> | null>(null);

  const compteVerifieN2 = niveauVerification === NIVEAU_VERIFICATION_MINIMAL_FULL_SENSITIVE;
  const niveauSensibleBloque = niveauAcces === "FULL_SENSITIVE" && !compteVerifieN2;
  const formulaireComplet = niveauAcces !== "" && duree !== "" && !niveauSensibleBloque;

  const optionsNiveau = OPTIONS_NIVEAU_ACCES_CONSENTEMENT.map((option) => ({
    value: option.valeur,
    label:
      option.valeur === "FULL_SENSITIVE" && !compteVerifieN2
        ? `${option.libelle} (compte vérifié requis)`
        : option.libelle,
  }));

  const optionsDuree = OPTIONS_DUREE_CONSENTEMENT.map((option) => ({
    value: option.valeur,
    label: option.libelle,
  }));

  useEffect(() => {
    if (!state.success || !state.codeId || !state.expireLe) {
      return;
    }

    const actualiserCompteARebours = () => setSecondes(secondesRestantes(state.expireLe!));
    const premierCalcul = setTimeout(actualiserCompteARebours, 0);
    intervalleCompteARebours.current = setInterval(actualiserCompteARebours, 1000);

    intervalleSondage.current = setInterval(async () => {
      const statut = await getStatutCodePartage(state.codeId!);
      if (statut?.consomme) {
        setStatutConsomme(statut.consommeParNomComplet ?? "un professionnel");
        if (intervalleSondage.current) clearInterval(intervalleSondage.current);
        if (intervalleCompteARebours.current) clearInterval(intervalleCompteARebours.current);
      }
    }, INTERVALLE_SONDAGE_MS);

    return () => {
      clearTimeout(premierCalcul);
      if (intervalleSondage.current) clearInterval(intervalleSondage.current);
      if (intervalleCompteARebours.current) clearInterval(intervalleCompteARebours.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.codeId, state.expireLe]);

  if (statutConsomme) {
    return (
      <Card title="Code de partage">
        <Alert level="success" title="Partagé">
          Partagé avec {statutConsomme}.
        </Alert>
      </Card>
    );
  }

  if (state.success && state.code && secondes !== null) {
    const expire = secondes <= 0;

    return (
      <Card
        title="Code de partage"
        description="Présentez ce code au professionnel devant vous, ou faites-le-lui scanner."
      >
        <div className="flex flex-col items-center gap-3 py-2">
          <p
            className={`font-mono text-[36px] font-bold tracking-[0.1em] ${expire ? "text-encre-attenuee line-through" : "text-encre"}`}
          >
            {state.code}
          </p>
          <p className="flex items-center gap-1.5 text-[13px] text-encre-secondaire">
            <Clock size={14} aria-hidden="true" />
            {expire
              ? "Ce code a expiré."
              : `Valable ${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, "0")}`}
          </p>
        </div>
        {expire ? (
          <form action={formAction}>
            <input type="hidden" name="niveauAcces" value={niveauAcces} />
            <input type="hidden" name="duree" value={duree} />
            <Button type="submit" variant="secondary" className="w-fit" disabled={pending}>
              Générer un nouveau code
            </Button>
          </form>
        ) : null}
      </Card>
    );
  }

  return (
    <Card
      title="Code de partage"
      description="Choisissez le niveau d'informations partagées et la durée : génère un code à usage unique, valable 10 minutes, pour donner accès à votre dossier sans chercher le professionnel dans une liste."
    >
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Code non généré">
            {state.error}
          </Alert>
        ) : null}

        <SelectField
          label="Niveau d'informations partagées"
          name="niveauAcces"
          required
          options={optionsNiveau}
          placeholder="Choisir un niveau"
          value={niveauAcces}
          onChange={(evenement) => setNiveauAcces(evenement.target.value as NiveauAccesConsentement)}
          hint="« Tout, y compris les informations sensibles » n'est proposé que depuis un compte vérifié (N2)."
        />
        {niveauSensibleBloque ? (
          <Alert level="warning" title="Compte non vérifié">
            Le niveau « Tout, y compris les informations sensibles » nécessite
            un compte vérifié (N2). Faites vérifier votre identité pour
            débloquer ce niveau.
          </Alert>
        ) : null}

        <SelectField
          label="Durée de l'autorisation"
          name="duree"
          required
          options={optionsDuree}
          placeholder="Choisir une durée"
          value={duree}
          onChange={(evenement) => setDuree(evenement.target.value)}
          hint="Maximum 12 mois. Vous pourrez retirer l'accès avant l'échéance à tout moment."
        />

        <Button
          type="submit"
          variant="primary"
          className="w-fit"
          iconBefore={Send}
          disabled={pending || !formulaireComplet}
        >
          {pending ? "Génération en cours..." : "Générer un code de partage"}
        </Button>
      </form>
    </Card>
  );
}
