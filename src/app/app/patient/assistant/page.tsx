import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { MENTION_ASSISTANT } from "@/modules/ai/assistant";
import { SUGGESTIONS_ASSISTANT } from "@/modules/ai/assistant-faq";
import { MENTION_DONNEES_FICTIVES } from "@/modules/ai/regles";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { ConversationAssistant } from "./ConversationAssistant";

/**
 * Assistant d'orientation du citoyen (F-IA-02 du pack), derriere la
 * fonctionnalite activable ai.citizen_assistant (desactivee par defaut,
 * RG-IA-02). Il ne lit jamais le dossier : voir
 * src/modules/ai/assistant-actions.ts.
 */
export default async function AssistantPage() {
  const actif = await estFonctionnaliteActive("ai.citizen_assistant");

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Assistant</p>
        <h1 className="text-[28px] font-bold text-titre">Poser une question pratique</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          L&apos;assistant vous oriente dans la plateforme : rendez-vous, ordonnances, consentements, carte santé, établissements. Il ne donne pas d&apos;avis médical.
        </p>
      </header>

      {actif ? (
        <>
          <Alert level="info" title="Réponses automatiques">
            <p>{MENTION_ASSISTANT}</p>
            <p className="mt-1 text-[13px]">{MENTION_DONNEES_FICTIVES}</p>
          </Alert>
          <Card>
            <ConversationAssistant suggestions={SUGGESTIONS_ASSISTANT} />
          </Card>
        </>
      ) : (
        <Alert level="info" title="Assistant indisponible">
          L&apos;assistant n&apos;est pas activé pour le moment. Pour une urgence, rendez-vous au centre de santé le plus proche.
        </Alert>
      )}
    </div>
  );
}
