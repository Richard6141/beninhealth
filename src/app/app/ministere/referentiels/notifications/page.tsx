import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getReferentielNotificationsComplet } from "@/modules/administration/referentiel-notifications";
import { SectionReferentielNotifications } from "./SectionReferentielNotifications";

/**
 * Ecran "Catalogue des notifications" (F-NOT-04 du pack,
 * docs/pack claude/specs/17-fiches-notifications.md ligne ~47), réservé au
 * ministère (admin_national). 4e référentiel administrable concret du pack
 * F-ADM-04, après vaccins, médicaments, examens : voir
 * src/modules/administration/referentiel-notifications.ts pour le détail
 * des limites assumées (seul le texte du modèle SMS et l'état actif/inactif
 * sont réellement administrables ; aucun envoi réel ne lit encore cette
 * table aujourd'hui).
 */
export default async function ReferentielNotificationsPage() {
  const referentiel = await getReferentielNotificationsComplet();

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
        <h1 className="text-[28px] font-bold text-titre">Catalogue des notifications</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Liste des types de notifications utilisés par la plateforme (déclencheur, destinataire, canaux) et
          modification du texte du modèle SMS associé. Déclencheur, destinataire et canaux sont documentaires
          ; seuls le texte et l&apos;état actif/inactif sont modifiables.
        </p>
      </header>

      <SectionReferentielNotifications referentiel={referentiel} />
    </div>
  );
}
