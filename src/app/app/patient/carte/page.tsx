import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, WifiOff } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getCarteSanteProfilAction } from "@/modules/patient/carte-sante";
import { Card } from "@/components/ui/Card";
import { CarteSanteQr } from "./CarteSanteQr";
import { BoutonImprimerCarteSante } from "./BoutonImprimerCarteSante";

function formaterDateNaissance(dateIso: string): string {
  try {
    return new Date(dateIso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return dateIso;
  }
}

/**
 * Ecran "Ma carte santé" (F-CIT-05 du pack) : identité minimale + QR à
 * validité courte prouvant une présence récente (RG-CIT-40/41). Distinct du
 * QR personnel permanent existant (/app/profil, badge d'identité sans
 * exigence de fraîcheur) : voir la docstring de
 * src/modules/patient/carte-sante.ts pour la justification complète.
 *
 * Étape 3 du pack (RG-CIT-41) : section repliable "Mode hors connexion",
 * QR de secours contenant uniquement l'identifiant santé, avec un
 * avertissement explicite qu'il ne suffit pas seul à prouver une présence.
 * Étape 4 (P1) : bouton d'impression (PDF format carte bancaire).
 */
export default async function CarteSantePage() {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    redirect("/app");
  }

  const profil = await getCarteSanteProfilAction();

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
                {profil ? profil.nomComplet : "Non renseigné"}
              </p>
              {profil ? (
                <p className="text-[13px] text-encre-secondaire">
                  Né(e) le {formaterDateNaissance(profil.dateNaissance)}
                </p>
              ) : null}
              {profil?.identifiantSante ? (
                <p className="chiffres mt-1 text-[20px] font-bold tracking-[0.1em] text-accent">
                  {profil.identifiantSante}
                </p>
              ) : null}
            </div>
            <CarteSanteQr />
            {profil ? <BoutonImprimerCarteSante /> : null}
          </div>
        </Card>
      </div>

      {profil ? (
        <details className="mx-auto w-full max-w-sm rounded-champ border border-bordure bg-plan">
          <summary className="cursor-pointer select-none px-4 py-3 text-[13px] font-semibold text-encre">
            Mode hors connexion (secours)
          </summary>
          <div className="flex flex-col items-center gap-3 border-t border-bordure px-4 py-4">
            <div
              role="note"
              className="flex items-start gap-2 rounded-champ border border-vigilance bg-vigilance-clair px-3 py-2 text-[12px] font-semibold text-vigilance"
            >
              <WifiOff size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                Ce code seul ne prouve pas votre présence : l&apos;accueil doit aussi vérifier par un code
                SMS ou une pièce d&apos;identité avant d&apos;ouvrir votre dossier (RG-CIT-41).
              </span>
            </div>
            <Image
              src={profil.dataUrlQrHorsLigne}
              alt="QR code de secours (identifiant santé seul, pour un scan hors connexion)"
              width={160}
              height={160}
              unoptimized
            />
            <p className="chiffres text-[13px] font-bold tracking-[0.08em] text-encre">
              {profil.identifiantSante}
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
