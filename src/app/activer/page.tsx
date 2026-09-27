import Image from "next/image";
import Link from "next/link";
import { lireInvitation } from "@/modules/identity/invitations";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { FormulaireActivation } from "./FormulaireActivation";

const LIBELLES_ROLE: Record<string, string> = {
  medecin: "médecin",
  infirmier: "infirmier",
  agent_communautaire: "agent communautaire",
  pharmacien: "pharmacien",
  laboratoire: "laboratoire",
  admin_etablissement: "administrateur d'établissement",
  admin_national: "administrateur national",
};

const MESSAGES_INVALIDES: Record<string, string> = {
  inconnue: "Ce lien d'invitation n'est pas valide.",
  utilisee: "Invitation déjà utilisée. Connectez-vous avec votre mot de passe.",
  expiree: "Cette invitation a expiré. Demandez à votre responsable de vous en envoyer une nouvelle.",
  annulee: "Cette invitation a été remplacée par une plus récente. Utilisez le dernier lien reçu.",
};

/**
 * Ecran d'activation d'un compte sur invitation (F-AUTH-05). Le jeton est lu
 * cote serveur : seule la personne qui detient le lien voit le nom de
 * l'etablissement et le role proposes.
 */
export default async function ActiverPage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  const invitation = await lireInvitation(jeton ?? "");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-plan px-4 py-10">
      <Image
        src="/image.png"
        alt="Ministere de la Sante, Republique du Benin"
        width={169}
        height={48}
        className="h-16 w-auto"
        priority
      />
      <div className="w-full max-w-xl">
        {invitation.etat === "valide" ? (
          <Card
            title={`Bienvenue ${invitation.prenom}`}
            description={`${invitation.etablissementNom ? `${invitation.etablissementNom} vous invite` : "Vous êtes invité"} sur la plateforme en tant que ${LIBELLES_ROLE[invitation.role ?? ""] ?? "professionnel"}. Choisissez votre mot de passe pour activer votre compte.`}
          >
            <FormulaireActivation jeton={jeton ?? ""} />
          </Card>
        ) : (
          <Card title="Invitation" description="Activation de votre compte.">
            <Alert level="warning" title="Activation impossible">
              {MESSAGES_INVALIDES[invitation.etat]}
            </Alert>
            <p className="mt-6 text-center text-[13px] text-encre-secondaire">
              <Link href="/connexion" className="font-semibold text-accent hover:underline">
                Aller à la connexion
              </Link>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
