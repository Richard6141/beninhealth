"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { genererResumeIaAction, noterResumeIaAction, type ResultatResumeIa } from "@/modules/ai/actions";
import { LONGUEUR_MAX_COMMENTAIRE_RETOUR, MENTION_DONNEES_FICTIVES, MENTION_GENEREE } from "@/modules/ai/regles";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

interface PanneauResumeIaProps {
  patientId: string;
}

function formaterDate(date: string | null): string {
  if (!date) return "";
  try {
    return new Date(date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  } catch {
    return date;
  }
}

/**
 * Panneau "Resume IA" (F-IA-01, RG-IA-07) : contenu genere, jamais enregistre
 * dans le dossier, presente avec un style distinct (bordure pointillee), la
 * mention obligatoire et le bandeau "donnees fictives" (RG-IA-03). Chaque
 * etiquette [S#] renvoie a l'element source, affiche sous le resume.
 */
export function PanneauResumeIa({ patientId }: PanneauResumeIaProps) {
  const [resultat, setResultat] = useState<ResultatResumeIa | null>(null);
  const [enCours, demarrer] = useTransition();
  const [retourEnvoye, setRetourEnvoye] = useState<"utile" | "inexact" | null>(null);
  const [erreurRetour, setErreurRetour] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const idCommentaire = useId();

  function generer() {
    setRetourEnvoye(null);
    setErreurRetour(null);
    setCommentaire("");
    demarrer(async () => {
      setResultat(await genererResumeIaAction(patientId));
    });
  }

  function noter(retour: "utile" | "inexact") {
    if (!resultat?.appelId) return;
    const appelId = resultat.appelId;
    setErreurRetour(null);
    demarrer(async () => {
      const reponse = await noterResumeIaAction(appelId, retour, commentaire);
      if (reponse.succes) setRetourEnvoye(retour);
      else setErreurRetour(reponse.erreur ?? "Le retour n'a pas pu être enregistré.");
    });
  }

  return (
    <section aria-labelledby="titre-resume-ia" className="flex flex-col gap-3 rounded-carte border-2 border-dashed border-info bg-info-clair px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titre-resume-ia" className="flex items-center gap-2 text-[20px] font-bold text-encre">
          <Sparkles size={20} aria-hidden="true" />
          Résumé IA
        </h2>
        <Button size="sm" variant="secondary" onClick={generer} disabled={enCours}>
          {enCours && resultat === null ? "Génération en cours" : resultat ? "Régénérer" : "Générer un résumé"}
        </Button>
      </div>

      <p className="text-[13px] text-encre-secondaire">{MENTION_DONNEES_FICTIVES}</p>

      {resultat?.erreur ? (
        <Alert level="warning" title="Résumé non généré">
          {resultat.erreur}
        </Alert>
      ) : null}

      {resultat?.message ? (
        <Alert level="info" title="Résumé indisponible">
          {resultat.message}{" "}
          <Link href={`/app/medecin/patients/${encodeURIComponent(patientId)}/historique`} className="font-semibold text-accent hover:underline">
            Ouvrir l&apos;historique
          </Link>
        </Alert>
      ) : null}

      {resultat && resultat.puces.length > 0 ? (
        <div className="flex flex-col gap-4">
          <p className="w-fit rounded-champ border border-info px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-info">
            {MENTION_GENEREE}
          </p>

          <ul className="flex flex-col gap-2 text-[15px] text-encre">
            {resultat.puces.map((puce, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-2">
                <span>{puce.texte.replace(/\s*\[S\d+\]/g, "")}</span>
                {puce.sources.map((etiquette) => (
                  <a
                    key={etiquette}
                    href={`#source-ia-${etiquette}`}
                    className="rounded-champ border border-info px-1.5 text-[12px] font-semibold text-info hover:bg-surface"
                  >
                    {etiquette}
                  </a>
                ))}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 border-t border-bordure pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[14px] font-bold text-encre">Éléments sources</h3>
              <Link href={`/app/medecin/patients/${encodeURIComponent(patientId)}/historique`} className="text-[13px] font-semibold text-accent hover:underline">
                Ouvrir la chronologie
              </Link>
            </div>
            <ul className="flex flex-col gap-1 text-[13px] text-encre-secondaire">
              {resultat.sources.map((source) => (
                <li key={source.etiquette} id={`source-ia-${source.etiquette}`}>
                  <span className="font-semibold text-encre">[{source.etiquette}]</span> {source.libelleType}
                  {source.date ? `, ${formaterDate(source.date)}` : ""} : {source.texte}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2 border-t border-bordure pt-3">
            {retourEnvoye ? (
              <p role="status" className="text-[13px] font-semibold text-bon">
                Merci, votre retour « {retourEnvoye} » est enregistré.
              </p>
            ) : (
              <>
                <label htmlFor={idCommentaire} className="text-[13px] font-semibold text-encre">
                  Ce résumé est-il fiable ? Commentaire facultatif (sans nom ni donnée personnelle)
                </label>
                <textarea
                  id={idCommentaire}
                  value={commentaire}
                  onChange={(evenement) => setCommentaire(evenement.target.value)}
                  maxLength={LONGUEUR_MAX_COMMENTAIRE_RETOUR}
                  rows={2}
                  className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[14px] text-encre focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => noter("utile")} disabled={enCours}>
                    Utile
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => noter("inexact")} disabled={enCours}>
                    Inexact
                  </Button>
                </div>
                {erreurRetour ? (
                  <p role="alert" className="text-[13px] text-critique">
                    {erreurRetour}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
