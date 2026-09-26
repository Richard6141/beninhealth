import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/session";
import { verifierIntegriteJournal } from "@/modules/audit/actions";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";

interface IntegritePageProps {
  searchParams: Promise<{ dateDebut?: string | string[]; dateFin?: string | string[] }>;
}

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

function dateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

const LIBELLES_TYPE_RUPTURE: Record<string, string> = {
  empreinte_incoherente: "Contenu modifié après coup",
  chainon_manquant: "Ligne manquante dans la chaîne (suppression ou insertion hors chaîne)",
};

const styleChampFiltre =
  "h-9 rounded-champ border border-bordure-forte bg-surface px-2.5 text-[13px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

/**
 * Ecran "Vérifier l'intégrité" (RG-AUD-02 du pack) : recalcule la chaîne
 * d'empreintes du journal d'audit sur une période et signale toute rupture.
 * Reserve a admin_national (voir la justification dans
 * src/modules/audit/actions.ts : la chaîne est unique et globale à toute la
 * plateforme, la scoper par établissement n'aurait pas de sens).
 */
export default async function IntegriteJournalPage({ searchParams }: IntegritePageProps) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin_national")) {
    redirect("/app");
  }

  const params = await searchParams;
  const aujourdHui = new Date();
  const ilYA7Jours = new Date(aujourdHui.getTime() - 7 * 24 * 60 * 60 * 1000);

  const dateDebut = premiereValeur(params.dateDebut) || dateISO(ilYA7Jours);
  const dateFin = premiereValeur(params.dateFin) || dateISO(aujourdHui);

  const resultat = await verifierIntegriteJournal(dateDebut, dateFin);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/ministere/audit"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au journal d&apos;audit
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
        <h1 className="text-[28px] font-bold text-titre">Vérifier l&apos;intégrité du journal</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Recalcule la chaîne cryptographique des empreintes du journal d&apos;audit sur la période choisie et
          signale toute rupture (ligne modifiée après coup ou supprimée).
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-champ border border-bordure bg-plan p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-debut" className="text-[12px] font-semibold text-encre-secondaire">
            Depuis le
          </label>
          <input id="filtre-debut" type="date" name="dateDebut" defaultValue={dateDebut} className={styleChampFiltre} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-fin" className="text-[12px] font-semibold text-encre-secondaire">
            Jusqu&apos;au
          </label>
          <input id="filtre-fin" type="date" name="dateFin" defaultValue={dateFin} className={styleChampFiltre} />
        </div>
        <button
          type="submit"
          className="h-9 rounded-champ bg-accent px-4 text-[13px] font-semibold text-surface transition-colors motion-reduce:transition-none hover:opacity-90"
        >
          Vérifier
        </button>
      </form>

      {resultat === null ? (
        <Alert level="critical" title="Vérification impossible">
          La période demandée dépasse 31 jours, ou votre session n&apos;a pas les droits nécessaires.
        </Alert>
      ) : (
        <>
          {resultat.ruptures.length === 0 ? (
            <Alert level="success" title="Chaîne intègre">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={16} aria-hidden="true" />
                {resultat.lignesVerifiees} ligne{resultat.lignesVerifiees > 1 ? "s" : ""} vérifiée
                {resultat.lignesVerifiees > 1 ? "s" : ""} sur la période, aucune rupture détectée.
              </span>
            </Alert>
          ) : (
            <Alert level="critical" title="Rupture(s) détectée(s)">
              {resultat.ruptures.length} rupture{resultat.ruptures.length > 1 ? "s" : ""} sur {resultat.lignesVerifiees}{" "}
              ligne{resultat.lignesVerifiees > 1 ? "s" : ""} vérifiée{resultat.lignesVerifiees > 1 ? "s" : ""}.
            </Alert>
          )}

          {resultat.ruptures.length > 0 ? (
            <Card title="Détail des ruptures">
              <ul className="flex flex-col gap-3">
                {resultat.ruptures.map((rupture, index) => (
                  <li
                    key={`${rupture.journalAuditId}-${rupture.type}-${index}`}
                    className="flex items-start gap-2.5 rounded-champ border border-critique/30 bg-critique-clair px-3 py-2.5"
                  >
                    <ShieldAlert size={16} className="mt-0.5 shrink-0 text-critique" aria-hidden="true" />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[13px] font-semibold text-encre">
                        {LIBELLES_TYPE_RUPTURE[rupture.type] ?? rupture.type}
                      </p>
                      <p className="text-[12px] text-encre-attenuee">
                        Ligne n°{rupture.numeroSequence} · {rupture.action} · {formaterDateHeure(rupture.date)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <p className="text-[12px] text-encre-attenuee">
            Vérification effectuée le {formaterDateHeure(resultat.dateVerification)}. Cette consultation est
            elle-même journalisée (RG-AUD-01).
          </p>
        </>
      )}
    </div>
  );
}
