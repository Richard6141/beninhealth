"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Clock, Send } from "lucide-react";
import {
  genererCodePartageAction,
  getStatutCodePartage,
  type GenerationCodePartageState,
} from "@/modules/partage/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const etatInitial: GenerationCodePartageState = { error: null, success: false };

const INTERVALLE_SONDAGE_MS = 5000;

function secondesRestantes(expireLeISO: string): number {
  return Math.max(0, Math.round((new Date(expireLeISO).getTime() - Date.now()) / 1000));
}

/**
 * Generation d'un code de partage temporaire (F-CIT-11 du pack) : bouton qui
 * declenche genererCodePartageAction, puis affiche le code en grand pendant
 * sa duree de validite (10 min) avec un compte a rebours, en sondant
 * getStatutCodePartage toutes les 5 secondes pour detecter une consommation
 * ("Partagé avec Dr X en temps réel", comme demande par le pack).
 */
export function GenerateurCodePartage() {
  const [state, formAction, pending] = useActionState(genererCodePartageAction, etatInitial);
  const [statutConsomme, setStatutConsomme] = useState<string | null>(null);
  const [secondes, setSecondes] = useState<number | null>(null);
  const intervalleSondage = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalleCompteARebours = useRef<ReturnType<typeof setInterval> | null>(null);

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
      description="Génère un code à usage unique, valable 10 minutes, pour donner accès à vos consultations récentes sans chercher le professionnel dans une liste."
    >
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Code non généré">
            {state.error}
          </Alert>
        ) : null}
        <Button type="submit" variant="primary" className="w-fit" iconBefore={Send} disabled={pending}>
          {pending ? "Génération en cours..." : "Générer un code de partage"}
        </Button>
      </form>
    </Card>
  );
}
