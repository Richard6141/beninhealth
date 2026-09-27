"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desactiverIaAction, rejouerJeuEvaluationAction, type EvaluationIaEtat } from "@/modules/ai/gouvernance";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

/**
 * Deux commandes de la gouvernance de l'IA (F-IA-05) : rejouer le jeu de 20
 * dossiers fictifs (RG-IA-20) et couper toutes les fonctionnalites d'IA
 * (RG-IA-02, effet immediat).
 */
export function ControlesIa({ iaActive }: { iaActive: boolean }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [evaluation, setEvaluation] = useState<EvaluationIaEtat | null>(null);
  const [message, setMessage] = useState<{ ton: "success" | "critical"; texte: string } | null>(null);

  function rejouer() {
    setMessage(null);
    demarrer(async () => {
      setEvaluation(await rejouerJeuEvaluationAction());
      router.refresh();
    });
  }

  function desactiver() {
    setMessage(null);
    demarrer(async () => {
      const resultat = await desactiverIaAction();
      setMessage(resultat.success ? { ton: "success", texte: "Les fonctionnalités d'IA sont désactivées." } : { ton: "critical", texte: resultat.error ?? "Échec de la désactivation." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={rejouer} disabled={enCours}>
          {enCours && evaluation === null ? "Évaluation en cours" : "Rejouer le jeu d'évaluation"}
        </Button>
        <Button variant="danger" onClick={desactiver} disabled={enCours || !iaActive}>
          Désactiver toute l&apos;IA
        </Button>
      </div>

      {message ? (
        <Alert level={message.ton} title={message.ton === "success" ? "Fait" : "Erreur"}>
          {message.texte}
        </Alert>
      ) : null}

      {evaluation?.error ? (
        <Alert level="critical" title="Évaluation impossible">
          {evaluation.error}
        </Alert>
      ) : null}

      {evaluation && !evaluation.error ? (
        <Alert level={evaluation.success ? "success" : "critical"} title={evaluation.success ? "Jeu d'évaluation réussi" : "Jeu d'évaluation en échec : ne pas déployer (RG-IA-20)"}>
          <p>
            {evaluation.conformes} cas conforme(s) sur {evaluation.total} (dossiers fictifs du résumé et questions de l&apos;assistant).
          </p>
          {evaluation.echecs.length > 0 ? (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[13px]">
              {evaluation.echecs.map((echec, index) => (
                <li key={index}>
                  {echec.dossier} ({echec.regle}) : {echec.detail}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
