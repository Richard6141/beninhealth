import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarClock, ClipboardList, ListChecks, Merge, Timer } from "lucide-react";
import Link from "next/link";
import type { FilesAttenteAdmin } from "@/modules/administration/tableau-bord-admin";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

function TuileFile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3 transition-colors hover:border-accent"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
        </span>
        <span className="chiffres text-[20px] font-bold text-encre">{value}</span>
      </div>
    </Link>
  );
}

function formaterDate(date: string | null): string {
  if (!date) return "Jamais executee";
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/**
 * Section "Files d'attente" (F-ADM-01 du pack), perimetre reduit : voir
 * src/modules/administration/tableau-bord-admin.ts pour le detail de ce qui
 * n'a volontairement pas ete construit (validation de professionnels,
 * reinitialisations 2FA, file SMS, erreurs applicatives - tous sans objet
 * dans ce depot).
 */
export function SectionFilesAttente({ files }: { files: FilesAttenteAdmin }) {
  if (!files.acces) {
    return (
      <Alert level="critical" title="Accès refusé">
        Cette section est réservée au ministère.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TuileFile
          icon={Merge}
          label="Doublons patients à revoir"
          value={files.doublonsPatientsEnAttente}
          href="/app/ministere/doublons"
        />
        <TuileFile
          icon={ClipboardList}
          label="Établissements en brouillon"
          value={files.etablissementsEnBrouillon}
          href="/app/ministere/etablissements"
        />
        <TuileFile
          icon={ListChecks}
          label="Demandes des personnes en attente"
          value={files.demandesPersonnesEnAttente}
          href="/app/ministere/audit/demandes"
        />
      </div>

      <Card title="État technique" description="Planificateur des agrégats de pilotage (F-PIL-07).">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-[14px] text-encre">
            <Timer size={16} className="text-accent" aria-hidden="true" />
            Dernière exécution : <span className="font-semibold">{formaterDate(files.derniereExecutionPlanificateur)}</span>
          </div>
          <div className="flex items-center gap-2 text-[14px] text-encre">
            <CalendarClock size={16} className="text-accent" aria-hidden="true" />
            Tâches en attente :
            <Badge tone={files.tachesPilotageEnAttente > 0 ? "alert" : "good"}>
              {files.tachesPilotageEnAttente}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
