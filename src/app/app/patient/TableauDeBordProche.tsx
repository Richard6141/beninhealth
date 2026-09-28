import Link from "next/link";
import { CalendarClock, ChevronRight, Circle, Users } from "lucide-react";
import type { ProcheDetail, RendezVousProcheResume } from "@/modules/proches/actions";
import { rendezVousAVenir } from "@/modules/patient/tableau-de-bord-regles";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LienItineraire } from "./LienItineraire";

const NOMBRE_RENDEZ_VOUS_AFFICHES = 3;

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return date;
  }
}

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return date;
  }
}

/**
 * Tableau de bord d'une personne a charge (F-CIT-02, selecteur de personne).
 *
 * Perimetre strictement egal a ce que l'ecran dedie F-CIT-08
 * (/app/patient/proches/[id]) expose deja : identite et rendez-vous, lus par
 * getProcheParId et getRendezVousDuProche (Zero Trust, reverifies a chaque
 * appel par la page appelante). Aucune nouvelle lecture ni permission : les
 * traitements, examens et documents d'une personne a charge ne sont pas
 * accessibles au tuteur dans ce depot (limite deja documentee dans
 * proches/actions.ts), ils ne sont donc pas affiches ici non plus, et la page
 * le dit explicitement plutot que de montrer des sections vides trompeuses.
 */
export function TableauDeBordProche({
  proche,
  rendezVous,
}: {
  proche: ProcheDetail;
  rendezVous: RendezVousProcheResume[];
}) {
  const aVenir = rendezVousAVenir(rendezVous).slice(0, NOMBRE_RENDEZ_VOUS_AFFICHES);
  const lienDossier = `/app/patient/proches/${encodeURIComponent(proche.id)}`;

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chiffres rounded-badge border border-bordure-forte bg-surface-appui px-2.5 py-0.5 text-[12px] font-semibold text-encre-secondaire">
            {proche.identifiantSante}
          </span>
          <Badge tone="info">Personne à charge</Badge>
        </div>
        <h1 className="text-[28px] font-bold text-titre">
          {proche.prenom} {proche.nom}
        </h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Né(e) le {formaterDate(proche.dateNaissance)}. Vous consultez le tableau
          de bord d&apos;une personne à votre charge ; les actions faites en son
          nom sont journalisées au vôtre.
        </p>
      </header>

      <Card
        title={
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white">
              <CalendarClock size={15} aria-hidden="true" />
            </span>
            <span className="text-[16px]">Prochains rendez-vous</span>
          </div>
        }
        actions={aVenir.length > 0 ? <Badge tone="accent">{aVenir.length} à venir</Badge> : undefined}
      >
        {aVenir.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {aVenir.map((rdv) => {
              const estConfirme = rdv.statut === "confirme";
              return (
                <li key={rdv.id} className="flex items-start gap-2.5 rounded-champ px-1.5 py-2.5">
                  <Circle
                    size={9}
                    className={cn("mt-1.5 shrink-0 fill-current", estConfirme ? "text-bon" : "text-info")}
                    aria-hidden="true"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[14px] font-semibold text-encre">{rdv.motif}</span>
                    <span className="truncate text-[12.5px] text-encre-attenuee">
                      {formaterDateHeure(rdv.date)} · {rdv.etablissementNom}
                      {rdv.professionnelNomComplet ? `, ${rdv.professionnelNomComplet}` : ""}
                    </span>
                    <LienItineraire
                      latitude={rdv.etablissementLatitude}
                      longitude={rdv.etablissementLongitude}
                      etablissementNom={rdv.etablissementNom}
                    />
                  </div>
                  <Badge tone={estConfirme ? "good" : "info"} className="shrink-0">
                    {estConfirme ? "Confirmé" : "Demande"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-encre-attenuee">Aucun rendez-vous à venir.</p>
        )}
        <Link
          href={lienDossier}
          className="mt-3 inline-flex items-center gap-1 border-t border-bordure pt-3 text-[13px] font-semibold text-accent hover:underline"
        >
          Voir son dossier et prendre rendez-vous
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </Card>

      <Alert level="info" title="Périmètre de cette version">
        Pour une personne à charge, seuls l&apos;identité et les rendez-vous sont
        consultables. Ses traitements, examens et documents ne sont pas encore
        accessibles depuis votre compte.{" "}
        <Link href="/app/patient/proches" className="font-semibold underline">
          <Users size={13} className="mr-1 inline" aria-hidden="true" />
          Gérer mes proches
        </Link>
      </Alert>
    </>
  );
}
