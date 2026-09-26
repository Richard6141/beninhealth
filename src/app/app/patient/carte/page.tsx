import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMonProfil } from "@/modules/identity/actions";
import { Card } from "@/components/ui/Card";
import { CarteSanteQr } from "./CarteSanteQr";

/**
 * Ecran "Ma carte santé" (F-CIT-05 du pack) : identité minimale + QR à
 * validité courte prouvant une présence récente (RG-CIT-40/41). Distinct du
 * QR personnel permanent existant (/app/profil, badge d'identité sans
 * exigence de fraîcheur) : voir la docstring de
 * src/modules/patient/carte-sante.ts pour la justification complète.
 */
export default async function CarteSantePage() {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    redirect("/app");
  }

  const profil = await getMonProfil();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/patient"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace patient
        </p>
        <h1 className="text-[28px] font-bold text-titre">Ma carte santé</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Présentez ce QR à l&apos;accueil d&apos;un établissement pour prouver votre présence sans avoir à
          épeler votre identifiant santé.
        </p>
      </header>

      <div className="flex justify-center">
        <Card className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <p className="text-[18px] font-bold text-titre">
                {profil ? `${profil.prenom} ${profil.nom}` : "Non renseigné"}
              </p>
              {profil?.identifiant ? (
                <p className="chiffres mt-1 text-[20px] font-bold tracking-[0.1em] text-accent">
                  {profil.identifiant}
                </p>
              ) : null}
            </div>
            <CarteSanteQr />
          </div>
        </Card>
      </div>
    </div>
  );
}
