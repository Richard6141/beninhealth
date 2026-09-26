import Link from "next/link";
import { ArrowLeft, ShieldCheck, ShieldX } from "lucide-react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { verifierCarteSanteAction } from "@/modules/patient/carte-sante";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";

interface PageProps {
  searchParams: Promise<{ jeton?: string }>;
}

function formaterDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return iso;
  }
}

/**
 * Verification de la carte sante numerique d'un patient (F-CIT-05 du pack),
 * apres scan du QR temporaire. Reserve a un utilisateur authentifie de la
 * plateforme (verifierCarteSanteAction le revérifie de toute facon, Zero
 * Trust). Le jeton est consomme des ce chargement : un rechargement de la
 * page (F5) avec la meme URL echoue volontairement (CA-1 du pack).
 */
export default async function VerifierCarteSantePage({ searchParams }: PageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  const { jeton } = await searchParams;
  const resultat = jeton
    ? await verifierCarteSanteAction(jeton)
    : ({ statut: "refuse" } as const);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold text-titre">Vérification de présence</h1>
      </header>

      {resultat.statut === "valide" ? (
        <Card>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bon/15 text-bon">
              <ShieldCheck size={28} aria-hidden="true" />
            </span>
            <p className="text-[20px] font-bold text-titre">{resultat.nomComplet}</p>
            <p className="chiffres text-[16px] font-semibold text-accent">{resultat.identifiantSante}</p>
            <p className="text-[13px] text-encre-secondaire">
              Né(e) le {formaterDate(resultat.dateNaissance)} · {resultat.sexe === "F" ? "Féminin" : "Masculin"}
            </p>
          </div>
        </Card>
      ) : (
        <Alert
          level="critical"
          title={resultat.statut === "refuse" ? "Accès refusé" : "Code déjà utilisé ou expiré"}
        >
          {resultat.statut === "refuse" ? (
            "Votre session n'a pas les droits nécessaires."
          ) : (
            <span className="flex items-center gap-2">
              <ShieldX size={16} aria-hidden="true" />
              Demandez au patient d&apos;actualiser sa carte.
            </span>
          )}
        </Alert>
      )}
    </div>
  );
}
