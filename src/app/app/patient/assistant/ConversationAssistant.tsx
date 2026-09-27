"use client";

import { useId, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { poserQuestionAssistantAction } from "@/modules/ai/assistant-actions";
import type { ReponseAssistant } from "@/modules/ai/assistant";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

interface Echange {
  question: string;
  reponse: ReponseAssistant | null;
  erreur: string | null;
}

const LONGUEUR_MAX = 300;

function LienBouton({ href, libelle }: { href: string; libelle: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 w-fit items-center justify-center rounded-carte bg-marine px-3 text-[13px] font-semibold text-white hover:bg-marine-fonce focus-visible:outline-2 focus-visible:outline-marine focus-visible:outline-offset-2"
    >
      {libelle}
    </Link>
  );
}

function ReponseAffichee({ reponse, poser }: { reponse: ReponseAssistant; poser: (question: string) => void }) {
  if (reponse.type === "symptome") {
    return (
      <Alert level={reponse.urgence ? "critical" : "warning"} title={reponse.urgence ? "Urgence possible" : "Question de santé"}>
        <p>{reponse.texte}</p>
        {reponse.lien ? (
          <div className="mt-3">
            <LienBouton href={reponse.lien.href} libelle={reponse.lien.libelle} />
          </div>
        ) : null}
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-carte border border-bordure bg-surface-appui px-4 py-3">
      <p className="text-[15px] text-encre">{reponse.texte}</p>
      {reponse.etablissements.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[14px]">
          {reponse.etablissements.map((etablissement) => (
            <li key={etablissement.id}>
              <Link href={`/etablissements/${encodeURIComponent(etablissement.id)}`} className="font-semibold text-accent hover:underline">
                {etablissement.nom}
              </Link>{" "}
              <span className="text-encre-secondaire">({etablissement.localisation})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {reponse.lien ? <LienBouton href={reponse.lien.href} libelle={reponse.lien.libelle} /> : null}
      {reponse.suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {reponse.suggestions.map((suggestion) => (
            <Button key={suggestion} size="sm" variant="secondary" onClick={() => poser(suggestion)}>
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Conversation avec l'assistant d'orientation (F-IA-02). L'echange reste dans
 * cette page : rien n'est conserve cote serveur (seul un compteur par type de
 * reponse est journalise), et fermer la page l'efface.
 */
export function ConversationAssistant({ suggestions }: { suggestions: readonly string[] }) {
  const [echanges, setEchanges] = useState<Echange[]>([]);
  const [saisie, setSaisie] = useState("");
  const [enCours, demarrer] = useTransition();
  const idChamp = useId();
  const fin = useRef<HTMLDivElement>(null);

  function poser(question: string) {
    const propre = question.trim();
    if (propre.length === 0) return;
    setSaisie("");
    demarrer(async () => {
      const resultat = await poserQuestionAssistantAction(propre);
      setEchanges((precedents) => [...precedents, { question: propre, reponse: resultat.reponse, erreur: resultat.erreur }]);
      requestAnimationFrame(() => fin.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    });
  }

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    poser(saisie);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4" aria-live="polite">
        {echanges.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-carte border border-bordure bg-surface-appui px-4 py-3">
            <p className="text-[15px] text-encre">Bonjour. Posez une question pratique sur la plateforme, ou choisissez un sujet :</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button key={suggestion} size="sm" variant="secondary" onClick={() => poser(suggestion)} disabled={enCours}>
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {echanges.map((echange, index) => (
          <div key={index} className="flex flex-col gap-2">
            <p className="ml-auto max-w-[85%] rounded-carte bg-marine px-4 py-2 text-[15px] text-white">{echange.question}</p>
            {echange.erreur ? (
              <Alert level="warning" title="Réponse indisponible">
                {echange.erreur}
              </Alert>
            ) : echange.reponse ? (
              <ReponseAffichee reponse={echange.reponse} poser={poser} />
            ) : null}
          </div>
        ))}

        {enCours ? (
          <p role="status" className="text-[13px] text-encre-attenuee">
            L&apos;assistant cherche une réponse
          </p>
        ) : null}
        <div ref={fin} />
      </div>

      <form onSubmit={soumettre} className="flex flex-col gap-2 border-t border-bordure pt-4">
        <label htmlFor={idChamp} className="text-[15px] font-semibold text-encre">
          Votre question
        </label>
        <div className="flex gap-2">
          <input
            id={idChamp}
            value={saisie}
            onChange={(evenement) => setSaisie(evenement.target.value)}
            maxLength={LONGUEUR_MAX}
            autoComplete="off"
            placeholder="Par exemple : comment annuler un rendez-vous ?"
            className="h-11 min-w-0 flex-1 rounded-champ border border-bordure-forte bg-surface px-3 text-[15px] text-encre placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
          <Button type="submit" iconBefore={Send} disabled={enCours || saisie.trim().length === 0}>
            Envoyer
          </Button>
        </div>
        <p className="text-[12px] text-encre-attenuee">Ne saisissez ni nom, ni numéro personnel : cette conversation n&apos;est pas conservée.</p>
      </form>
    </div>
  );
}
