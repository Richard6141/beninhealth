import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStatutMfa } from "@/modules/identity/mfa";
import { listerMesSessions } from "@/modules/identity/sessions";
import { Card } from "@/components/ui/Card";
import { GestionMfa } from "./GestionMfa";
import { GestionSessions } from "./GestionSessions";

/**
 * Ecran "Securite de mon compte" (Phase 7) : gestion de la double
 * authentification (TOTP). Route distincte de /app/profil (informations
 * personnelles/avatar, gere ailleurs) pour rester dans un perimetre de
 * fichiers propre.
 */
export default async function SecuritePage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  const [statutMfa, sessions] = await Promise.all([getStatutMfa(), listerMesSessions()]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Sécurité du compte
        </p>
        <h1 className="text-[28px] font-bold text-titre">Ma sécurité</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          La double authentification ajoute une vérification supplémentaire à
          la connexion, en plus de votre mot de passe.
        </p>
      </header>

      <Card
        title="Double authentification"
        description="Application d'authentification (TOTP), compatible Google Authenticator, Authy et équivalents."
      >
        <GestionMfa actif={statutMfa?.actif ?? false} />
      </Card>

      <Card
        title="Appareils et sessions"
        description="Sessions actuellement connectées à votre compte, sur cet appareil ou un autre."
      >
        <GestionSessions sessions={sessions ?? []} />
      </Card>
    </div>
  );
}
