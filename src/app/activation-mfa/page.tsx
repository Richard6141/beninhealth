import { redirect } from "next/navigation";
import Image from "next/image";
import { getSessionPourActivationMfa } from "@/lib/session";
import { getStatutMfa } from "@/modules/identity/mfa";
import { espaceParDefaut } from "@/lib/espace-par-defaut";
import { logoutAction } from "@/modules/identity/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { GestionMfa } from "@/app/app/securite/GestionMfa";

/**
 * Ecran d'activation obligatoire du second facteur (F-AUTH-06, CA-1) : seule
 * page accessible a un compte non patient qui n'a pas encore active la double
 * authentification, quand le drapeau `securite.mfa_obligatoire` est actif.
 */
export default async function ActivationMfaPage() {
  const session = await getSessionPourActivationMfa();

  if (!session) {
    redirect("/connexion");
  }

  if (!session.activationMfaRequise) {
    redirect(espaceParDefaut(session.roles));
  }

  const statut = await getStatutMfa();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-plan px-4 py-10">
      <Image
        src="/image.png"
        alt="Ministere de la Sante, Republique du Benin"
        width={225}
        height={64}
        className="h-20 w-auto"
        priority
      />
      <div className="w-full max-w-xl">
        <Card
          title="Activez la double authentification"
          description="Votre rôle donne accès à des données de santé : un second facteur est obligatoire avant toute autre action."
        >
          <GestionMfa
            actif={statut?.actif ?? false}
            obligatoire
            codesSecoursRestants={statut?.codesSecoursRestants ?? 0}
            destinationApresActivation={espaceParDefaut(session.roles)}
          />
          <form action={logoutAction} className="mt-6">
            <Button type="submit" variant="secondary">
              Se déconnecter
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
