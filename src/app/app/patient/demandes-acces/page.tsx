import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDemandesAccesRecues } from "@/modules/transfert/demandes-patient";
import { EtatVide } from "@/components/ui/EtatVide";
import { ReponseDemandeAcces } from "./ReponseDemandeAcces";

/**
 * Demandes d'acces a mon dossier par un professionnel qui ne me connait pas
 * encore (acces par NPI ou telephone). Le patient lit qui demande, pour quoi
 * et combien de temps, puis autorise ou refuse. Autoriser une demande qu'on ne
 * reconnait pas est le seul risque de cet ecran : chaque carte rappelle
 * de verifier que le professionnel est bien present.
 */
export default async function DemandesAccesPage() {
  const demandes = await getDemandesAccesRecues();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/patient"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <h1 className="text-[28px] font-bold text-titre">Demandes d&apos;accès à mon dossier</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Un professionnel de santé demande à consulter votre dossier. Autorisez uniquement si cette personne est bien
          devant vous. Vous pourrez retirer l&apos;accès à tout moment dans vos consentements.
        </p>
      </header>

      {demandes.length === 0 ? (
        <EtatVide
          titre="Aucune demande en attente"
          description="Quand un professionnel demandera l'accès à votre dossier, vous la verrez ici."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {demandes.map((demande) => (
            <li key={demande.id}>
              <ReponseDemandeAcces demande={demande} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
