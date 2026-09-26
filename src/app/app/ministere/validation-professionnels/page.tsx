import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getFileValidationProfessionnels } from "@/modules/administration/validation-professionnels";
import { Alert } from "@/components/ui/Alert";
import { SectionValidationProfessionnels } from "./SectionValidationProfessionnels";

/**
 * Ecran "Valider un professionnel" (F-ADM-03 du pack), reserve au validateur
 * du ministere (admin_national, permission validation_professionnel). Ne
 * montre que des donnees d'identite et d'inscription, jamais de donnee
 * clinique (RG-ROL-06). Voir src/modules/administration/validation-professionnels.ts
 * pour le perimetre reduit et l'effet reel du refus.
 */
export default async function ValidationProfessionnelsPage() {
  const file = await getFileValidationProfessionnels();

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
        <h1 className="text-[28px] font-bold text-titre">Validation des professionnels de santé</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Vérifiez le numéro d&apos;inscription de chaque professionnel auprès de l&apos;Ordre concerné (procédure
          manuelle, hors plateforme), puis approuvez, refusez avec un motif ou demandez un complément. Délai
          cible : 72 heures ouvrées.
        </p>
      </header>

      {file === null ? (
        <Alert level="critical" title="Accès refusé">
          Cet écran est réservé au validateur du ministère.
        </Alert>
      ) : (
        <>
          <Alert level="info" title="Comment cette liste fonctionne">
            Les comptes créés par un établissement sont actifs dès leur création : cette liste sert à vérifier
            leur numéro d&apos;inscription. Un refus suspend immédiatement le compte et ferme ses sessions ; seule
            une approbation ultérieure le rétablit. Vous ne voyez aucune donnée médicale.
          </Alert>
          <SectionValidationProfessionnels professionnels={file} />
        </>
      )}
    </div>
  );
}
