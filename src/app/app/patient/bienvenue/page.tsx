import { redirect } from "next/navigation";
import { getMonDossierPatient } from "@/modules/patient/actions";
import { AssistantPremiereUtilisation } from "./AssistantPremiereUtilisation";

/**
 * Assistant de premiere utilisation (F-CIT-01 du pack), affiche une seule
 * fois juste apres l'inscription : redirige ici par registerPatientAction
 * (src/modules/identity/actions.ts) plutot que directement vers
 * /app/patient. Accessible aussi par navigation directe a tout moment (le
 * patient peut y revenir), mais jamais impose au-dela de l'inscription.
 */
export default async function BienvenuePage() {
  const dossier = await getMonDossierPatient();

  if (!dossier) {
    redirect("/app/patient");
  }

  return (
    <div className="conteneur-page mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Bienvenue
        </p>
        <h1 className="text-[28px] font-bold text-titre">
          Complétons votre carnet de santé
        </h1>
        <p className="text-[15px] text-encre-secondaire">
          Quelques informations utiles en cas de besoin. Tout est facultatif et modifiable à tout
          moment depuis « Mon dossier ».
        </p>
      </header>

      <AssistantPremiereUtilisation dossier={dossier} />
    </div>
  );
}
