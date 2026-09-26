import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getEnvoisSms } from "@/modules/notification/sms/dev";
import { Alert } from "@/components/ui/Alert";
import { FormulaireSmsTest } from "./FormulaireSmsTest";
import { ListeEnvoisSms } from "./ListeEnvoisSms";

/**
 * Boite d'envoi SMS simulee (F-NOT-02 du pack, "/dev/sms" adapte en
 * "/app/ministere/sms" : pas de role developpeur dans ce depot). Reserve a
 * admin_national. Aucun SMS reel n'est jamais envoye (OutboxSmsProvider,
 * seule implementation de ce depot) : cet ecran verifie la chaine complete
 * (formatage RG-NOT-02, differe RG-NOT-04) sans jamais atteindre un
 * telephone.
 */
export default async function SmsPage() {
  const envois = await getEnvoisSms();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/ministere"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
        <h1 className="text-[28px] font-bold text-titre">Boîte d&apos;envoi SMS (simulée)</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Aucun fournisseur SMS réel n&apos;est branché à cette plateforme : chaque envoi est
          réellement enregistré ici, mais n&apos;atteint jamais un téléphone.
        </p>
      </header>

      {envois === null ? (
        <Alert level="critical" title="Accès refusé">
          Votre session n&apos;a pas les droits nécessaires pour consulter cet écran.
        </Alert>
      ) : (
        <>
          <FormulaireSmsTest />
          <ListeEnvoisSms envois={envois} />
        </>
      )}
    </div>
  );
}
