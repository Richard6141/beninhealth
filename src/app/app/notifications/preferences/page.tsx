import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMesPreferencesNotification } from "@/modules/notification/preferences";
import { CATEGORIES_MODIFIABLES, CATEGORIES_VERROUILLEES } from "@/modules/notification/categories";
import { Card } from "@/components/ui/Card";
import { LignePreferenceCategorie } from "./LignePreferenceCategorie";

/**
 * Ecran "Préférences de notification" (F-NOT-03 du pack), ouvert a tout
 * utilisateur connecte (le pack le reserve a CITIZEN "et professionnels
 * pour leurs alertes"). RG-NOT-10 : les categories "sécurité" et "codes"
 * sont affichées verrouillées (toujours actives), jamais proposées a la
 * désactivation.
 */
export default async function PreferencesNotificationPage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  const preferences = await getMesPreferencesNotification();

  if (!preferences) {
    redirect("/connexion");
  }

  const preferenceParCategorie = new Map(preferences.map((p) => [p.categorie, p]));

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/notifications"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour aux notifications
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Notifications
        </p>
        <h1 className="text-[28px] font-bold text-titre">Préférences de notification</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Choisissez, pour chaque catégorie, les canaux par lesquels vous souhaitez être averti.
          Le canal interne (dans l&apos;application) reste toujours actif.
        </p>
      </header>

      <Card
        title="Limite actuelle"
        description="Seul le canal interne fonctionne réellement dans cette version. SMS et e-mail sont enregistrés mais n'ont pas encore d'effet : aucun fournisseur SMS ni service d'e-mail n'est branché à ce système de notification."
      />

      <div className="flex flex-col gap-3">
        {CATEGORIES_MODIFIABLES.map((definition) => {
          const preference = preferenceParCategorie.get(definition.code) ?? {
            categorie: definition.code,
            sms: false,
            email: false,
          };
          return (
            <LignePreferenceCategorie
              key={definition.code}
              definition={definition}
              preferenceInitiale={preference}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-[16px] font-bold text-encre">Catégories toujours actives</h2>
        <div className="flex flex-col gap-3">
          {CATEGORIES_VERROUILLEES.map((categorie) => (
            <div
              key={categorie.libelle}
              className="flex items-start gap-3 rounded-champ border border-bordure bg-plan p-4"
            >
              <Lock size={16} className="mt-0.5 shrink-0 text-encre-attenuee" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="text-[14px] font-semibold text-encre">{categorie.libelle}</p>
                <p className="text-[13px] text-encre-secondaire">{categorie.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
