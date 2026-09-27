import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, CalendarClock, ClipboardList, KeyRound, ListChecks, Merge, MessageSquare, Timer, UserCog } from "lucide-react";
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

const LIBELLES_ROLE: Record<string, string> = {
  patient: "Patients",
  medecin: "Médecins",
  infirmier: "Infirmiers",
  agent_communautaire: "Agents communautaires",
  pharmacien: "Pharmaciens",
  laboratoire: "Laboratoires",
  admin_etablissement: "Administrateurs d'établissement",
  admin_national: "Administrateurs nationaux",
};

function formaterDate(date: string | null): string {
  if (!date) return "Jamais executee";
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/**
 * Section "Files d'attente" et etat technique (F-ADM-01 du pack) : voir
 * src/modules/administration/tableau-bord-admin.ts pour la source de chaque
 * compteur et ses limites (le suivi d'erreurs ne couvre que les taches
 * planifiees).
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
          icon={BadgeCheck}
          label="Professionnels à vérifier"
          value={files.professionnelsAVerifier}
          href="/app/ministere/validation-professionnels"
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
        <TuileFile
          icon={UserCog}
          label="Actions de comptes à confirmer"
          value={files.demandesComptesEnAttente}
          href="/app/ministere/comptes"
        />
        <TuileFile
          icon={KeyRound}
          label="Réinitialisations 2FA à confirmer"
          value={files.reinitialisations2faEnAttente}
          href="/app/ministere/comptes"
        />
        <TuileFile
          icon={MessageSquare}
          label="SMS différés en attente"
          value={files.smsDifferesEnAttente}
          href="/app/ministere/sms"
        />
      </div>

      <Card title="État technique" description="Planificateur des agrégats de pilotage (F-PIL-07), tâches planifiées, file SMS.">
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
          <div className="flex items-center gap-2 text-[14px] text-encre">
            <MessageSquare size={16} className="text-accent" aria-hidden="true" />
            SMS déposés sur 24 h : <span className="chiffres font-semibold">{files.smsDeposes24h}</span>
          </div>
          <div className="flex items-center gap-2 text-[14px] text-encre">
            SMS en reprise :
            <Badge tone={files.smsEnAttenteDeReprise > 0 ? "alert" : "good"}>{files.smsEnAttenteDeReprise}</Badge>
          </div>
          <div className="flex items-center gap-2 text-[14px] text-encre">
            SMS en échec sur 24 h :
            <Badge tone={files.smsEnEchec24h > 0 ? "critical" : "good"}>{files.smsEnEchec24h}</Badge>
          </div>
          <div className="flex items-center gap-2 text-[14px] text-encre">
            Erreurs de tâches sur 24 h :
            <Badge tone={files.erreursTaches24h > 0 ? "critical" : "good"}>{files.erreursTaches24h}</Badge>
          </div>
        </div>

        <ul className="mt-4 flex flex-col divide-y divide-bordure">
          {files.executionsTaches.map((execution) => (
            <li key={execution.tache} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[14px] font-semibold text-encre">{execution.libelle}</span>
              <span className="flex flex-wrap items-center gap-2 text-[13px] text-encre-secondaire">
                {execution.dernierStatut ? (
                  <Badge tone={execution.dernierStatut === "ok" ? "good" : "critical"}>
                    {execution.dernierStatut === "ok" ? "OK" : "Erreur"}
                  </Badge>
                ) : null}
                {formaterDate(execution.derniereExecution)}
                {execution.nombreTraite !== null ? `, ${execution.nombreTraite} traité(s)` : ""}
                {execution.dernierMessage ? `, ${execution.dernierMessage}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Comptes actifs par rôle">
        <ul className="flex flex-wrap gap-3">
          {files.comptesParRole.length === 0 ? <li className="text-[14px] text-encre-secondaire">Aucun compte actif.</li> : null}
          {files.comptesParRole.map((ligne) => (
            <li key={ligne.role} className="rounded-champ border border-bordure bg-plan px-3 py-2 text-[14px] text-encre">
              <span className="font-semibold">{LIBELLES_ROLE[ligne.role] ?? ligne.role}</span> : <span className="chiffres">{ligne.nombre}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
