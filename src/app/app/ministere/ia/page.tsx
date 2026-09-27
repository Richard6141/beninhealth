import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getGouvernanceIa } from "@/modules/ai/gouvernance";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ControlesIa } from "./ControlesIa";

function pourcentage(valeur: number | null): string {
  return valeur === null ? "aucune donnée" : `${Math.round(valeur * 100)} %`;
}

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/**
 * Gouvernance de l'IA (F-IA-05 du pack), reservee a l'administration
 * nationale : fiche de chaque fonctionnalite, suivi agrege (jamais de donnee
 * de patient), jeu d'evaluation et coupure instantanee. Voir
 * src/modules/ai/gouvernance.ts.
 */
export default async function GouvernanceIaPage() {
  const gouvernance = await getGouvernanceIa();

  if (!gouvernance) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <Alert level="critical" title="Accès refusé">
          Cet écran est réservé à l&apos;administration nationale.
        </Alert>
      </div>
    );
  }

  const { statistiques, statistiquesAssistant } = gouvernance;
  const iaActive = gouvernance.fonctionnalites.some((fonctionnalite) => fonctionnalite.actif);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link href="/app/ministere" className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
        <h1 className="text-[28px] font-bold text-titre">Gouvernance de l&apos;IA</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          L&apos;IA assiste le professionnel, elle ne remplace pas son jugement. Elle reste désactivée par défaut, ne traite que des données fictives
          tant que l&apos;autorité de protection des données n&apos;a pas autorisé le traitement, et peut être coupée à tout moment.
        </p>
      </header>

      <section aria-labelledby="titre-etat" className="flex flex-col gap-4">
        <h2 id="titre-etat" className="text-[20px] font-bold text-encre">
          État et commandes
        </h2>
        <Card>
          <div className="mb-4 flex flex-col gap-2 text-[14px] text-encre-secondaire">
            <p>
              Fournisseur : <span className="font-semibold text-encre">{gouvernance.fournisseur}</span>{" "}
              {gouvernance.fournisseur === "regles_locales" ? "(calcul local sur le serveur, aucun service externe)" : ""}
            </p>
            <ul className="flex flex-wrap gap-2">
              {gouvernance.fonctionnalites.map((fonctionnalite) => (
                <li key={fonctionnalite.cle}>
                  <Badge tone={fonctionnalite.actif ? "warning" : "neutral"}>
                    {fonctionnalite.cle} : {fonctionnalite.actif ? "active" : "désactivée"}
                  </Badge>
                </li>
              ))}
            </ul>
            <p>
              Dernière évaluation :{" "}
              {gouvernance.derniereEvaluation
                ? `${formaterDate(gouvernance.derniereEvaluation.date)}, ${gouvernance.derniereEvaluation.conformes}/${gouvernance.derniereEvaluation.total} cas conformes`
                : "jamais rejouée depuis cet écran"}
            </p>
          </div>
          <ControlesIa iaActive={iaActive} />
        </Card>
      </section>

      <section aria-labelledby="titre-suivi" className="flex flex-col gap-4">
        <h2 id="titre-suivi" className="text-[20px] font-bold text-encre">
          Suivi des résumés ({gouvernance.joursSuivi} derniers jours)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card description="Appels">
            <p className="text-[28px] font-bold text-encre">{statistiques.appels}</p>
            <p className="text-[13px] text-encre-secondaire">
              {statistiques.ok} réussis, {statistiques.indisponibles} indisponibles, {statistiques.bloques} bloqués, {statistiques.erreurs} en erreur
            </p>
          </Card>
          <Card description="Retours « inexact »">
            <p className="text-[28px] font-bold text-encre">{pourcentage(statistiques.tauxInexact)}</p>
            <p className="text-[13px] text-encre-secondaire">
              {statistiques.retoursInexacts} inexact(s), {statistiques.retoursUtiles} utile(s)
            </p>
          </Card>
          <Card description="Puces supprimées par la validation">
            <p className="text-[28px] font-bold text-encre">{pourcentage(statistiques.tauxPucesSupprimees)}</p>
            <p className="text-[13px] text-encre-secondaire">
              {statistiques.pucesSupprimees} sur {statistiques.pucesLues} lues
            </p>
          </Card>
          <Card description="Temps de réponse moyen">
            <p className="text-[28px] font-bold text-encre">{statistiques.dureeMoyenneMs === null ? "aucune donnée" : `${statistiques.dureeMoyenneMs} ms`}</p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="titre-suivi-assistant" className="flex flex-col gap-4">
        <h2 id="titre-suivi-assistant" className="text-[20px] font-bold text-encre">
          Suivi de l&apos;assistant citoyen ({gouvernance.joursSuivi} derniers jours)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card description="Questions">
            <p className="text-[28px] font-bold text-encre">{statistiquesAssistant.appels}</p>
            <p className="text-[13px] text-encre-secondaire">Le texte des questions n&apos;est jamais conservé.</p>
          </Card>
          <Card description="Réponses trouvées">
            <p className="text-[28px] font-bold text-encre">{statistiquesAssistant.ok}</p>
          </Card>
          <Card description="Questions de santé redirigées">
            <p className="text-[28px] font-bold text-encre">{statistiquesAssistant.symptomes}</p>
            <p className="text-[13px] text-encre-secondaire">Réponse fixe vers les secours, aucun avis médical.</p>
          </Card>
          <Card description="Sans réponse">
            <p className="text-[28px] font-bold text-encre">{statistiquesAssistant.sansReponse}</p>
            <p className="text-[13px] text-encre-secondaire">Sujets à ajouter à la base validée.</p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="titre-fiches" className="flex flex-col gap-4">
        <h2 id="titre-fiches" className="text-[20px] font-bold text-encre">
          Fiches des fonctionnalités
        </h2>
        {gouvernance.fiches.map((fiche) => (
          <Card key={fiche.id} title={`${fiche.titre} (${fiche.fiche})`} description={`Version de consigne : ${fiche.versionConsigne}`}>
            <div className="flex flex-col gap-4 text-[14px] text-encre-secondaire">
              <p>{fiche.objectif}</p>
              <div>
                <h4 className="font-bold text-encre">Données utilisées</h4>
                <ul className="list-disc pl-4">
                  {fiche.donneesUtilisees.map((element) => (
                    <li key={element}>{element}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-encre">Données jamais envoyées</h4>
                <ul className="list-disc pl-4">
                  {fiche.donneesExclues.map((element) => (
                    <li key={element}>{element}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-encre">Consigne système</h4>
                <pre className="whitespace-pre-wrap rounded-champ border border-bordure bg-surface-appui p-3 text-[13px]">{fiche.consigne}</pre>
              </div>
              <div>
                <h4 className="font-bold text-encre">Limites connues</h4>
                <ul className="list-disc pl-4">
                  {fiche.limites.map((element) => (
                    <li key={element}>{element}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
