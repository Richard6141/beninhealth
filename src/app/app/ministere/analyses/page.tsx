import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAnalyseAgregats } from "@/modules/ai/analyse-lecture";
import { EXPLICATION_METHODE, MENTION_SIGNAL, VERSION_METHODE_ANALYSE } from "@/modules/ai/regles-analyse";
import { MENTION_GENEREE } from "@/modules/ai/regles";
import type { TypeSignal } from "@/modules/ai/analyse-agregats";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const LIBELLES_SIGNAL: Record<TypeSignal, { libelle: string; ton: "critical" | "warning" | "info" }> = {
  pic: { libelle: "Pic", ton: "critical" },
  hausse: { libelle: "Hausse continue", ton: "warning" },
  chute: { libelle: "Chute", ton: "info" },
  baisse: { libelle: "Baisse continue", ton: "info" },
};

function formaterSemaine(dateIso: string): string {
  const [annee, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}/${annee}`;
}

/**
 * Analyses assistees des indicateurs de pilotage (F-IA-04 du pack),
 * reservees a l'administration nationale : pics, chutes et tendances calcules
 * sur les agregats seulement, chacun avec l'explication de son calcul.
 * Fonctionnalite ai.analytics, desactivee par defaut (RG-IA-02).
 */
export default async function AnalysesAssisteesPage() {
  const analyse = await getAnalyseAgregats();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link href="/app/ministere" className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
        <h1 className="text-[28px] font-bold text-titre">Analyses assistées</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Pics, chutes et tendances repérés sur les indicateurs de pilotage. Le calcul est expliqué pour chaque signal.
        </p>
      </header>

      {analyse === null ? (
        <Alert level="critical" title="Accès refusé">
          Cet écran est réservé à l&apos;administration nationale.
        </Alert>
      ) : !analyse.actif ? (
        <Alert level="info" title="Analyse désactivée">
          L&apos;analyse assistée n&apos;est pas activée. Elle se règle dans les paramètres de la plateforme (fonctionnalité « ai.analytics »), après réussite du jeu d&apos;évaluation.
        </Alert>
      ) : (
        <>
          <Alert level="warning" title="Signaux à vérifier">
            <p>{MENTION_SIGNAL}</p>
            <p className="mt-1 text-[13px]">{MENTION_GENEREE}</p>
          </Alert>

          <section aria-labelledby="titre-signaux" className="flex flex-col gap-4">
            <h2 id="titre-signaux" className="text-[20px] font-bold text-encre">
              {analyse.signaux.length === 0 ? "Aucun signal" : `${analyse.signaux.length} signal(aux)`}
            </h2>
            <p className="text-[13px] text-encre-secondaire">
              {analyse.seriesAnalysees} séries analysées
              {analyse.premiereSemaine && analyse.derniereSemaine
                ? `, semaines du ${formaterSemaine(analyse.premiereSemaine)} au ${formaterSemaine(analyse.derniereSemaine)}`
                : ""}
              . Méthode {VERSION_METHODE_ANALYSE}.
            </p>

            {analyse.signaux.length === 0 ? (
              <Card>
                <p className="text-[14px] text-encre-secondaire">
                  Rien d&apos;inhabituel sur la période, ou historique insuffisant (moins de 6 semaines) : aucune conclusion n&apos;est tirée sur des données trop courtes.
                </p>
              </Card>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {analyse.signaux.map((signal, index) => (
                  <li key={`${signal.code}-${signal.territoire}-${signal.type}-${index}`}>
                    <Card
                      title={`${signal.libelle} : ${signal.territoire}`}
                      description={`Semaine du ${formaterSemaine(signal.semaine)}`}
                      actions={<Badge tone={LIBELLES_SIGNAL[signal.type].ton}>{LIBELLES_SIGNAL[signal.type].libelle}</Badge>}
                    >
                      <p className="text-[14px] text-encre-secondaire">{signal.explication}</p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="titre-methode" className="flex flex-col gap-3">
        <h2 id="titre-methode" className="text-[20px] font-bold text-encre">
          Comment c&apos;est calculé
        </h2>
        <Card>
          <ul className="flex list-disc flex-col gap-2 pl-4 text-[14px] text-encre-secondaire">
            {EXPLICATION_METHODE.map((ligne) => (
              <li key={ligne}>{ligne}</li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
