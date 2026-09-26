import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { GestionDroitsDonnees } from "./GestionDroitsDonnees";

/**
 * Ecran "Mes droits sur mes données" (F-CIT-13 du pack) : copie de mes
 * données, demande de rectification, fermeture de compte. Le signalement
 * d'un accès suspect (F-CIT-13, type 4) reste sur /app/patient/acces, où il
 * est déjà construit (F-CIT-12).
 */
export default async function DroitsDonneesPage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Vie privée
        </p>
        <h1 className="text-[28px] font-bold text-titre">Mes droits sur mes données</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Obtenez une copie de vos données, signalez une information incorrecte, ou fermez votre
          compte tout en conservant votre dossier médical.
        </p>
      </header>

      <GestionDroitsDonnees />
    </div>
  );
}
