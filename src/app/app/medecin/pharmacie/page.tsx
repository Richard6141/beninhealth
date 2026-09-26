import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPrescriptionsADelivrer } from "@/modules/prescription/actions";
import { ListePrescriptionsADelivrer } from "./ListePrescriptionsADelivrer";
import { RechercheOrdonnance } from "./RechercheOrdonnance";

/**
 * Espace pharmacien (Phase 9) : delivrance des prescriptions en officine.
 * Reserve au role "pharmacien" (les autres roles professionnels sont
 * renvoyes vers le tableau de bord generique) ; getPrescriptionsADelivrer
 * fait de toute facon la meme verification cote Server Action (Zero Trust,
 * pas de confiance dans le seul routage cote ecran).
 */
export default async function PharmaciePage() {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien")) {
    redirect("/app/medecin");
  }

  const prescriptions = await getPrescriptionsADelivrer();

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Pharmacie
        </p>
        <h1 className="text-[28px] font-black text-encre">Prescriptions à délivrer</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Toutes les prescriptions validées en attente de délivrance, tous
          patients confondus.
        </p>
      </header>

      <RechercheOrdonnance />

      <ListePrescriptionsADelivrer prescriptions={prescriptions} />
    </div>
  );
}
