import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getTableauDeBordPharmacie } from "@/modules/prescription/actions";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { ModuleDesactive } from "@/components/ModuleDesactive";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ListeOrdonnancesPartielles } from "./ListeOrdonnancesPartielles";
import { RechercheOrdonnance } from "./RechercheOrdonnance";

function libelleStatut(statut: string, annulee: boolean): { texte: string; tone: BadgeTone } {
  if (annulee) return { texte: "Délivrance annulée", tone: "neutral" };
  if (statut === "delivree") return { texte: "Délivrée", tone: "good" };
  if (statut === "delivree_partiellement") return { texte: "Délivrée en partie", tone: "warning" };
  if (statut === "validee") return { texte: "À délivrer", tone: "info" };
  if (statut === "arretee") return { texte: "Arrêtée", tone: "critical" };
  if (statut === "annulee") return { texte: "Annulée", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

function formaterHeure(date: string): string {
  try {
    return new Date(date).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Porto-Novo",
    });
  } catch {
    return date;
  }
}

/**
 * Espace pharmacien (F-PHA-01 du pack) : retrouver une ordonnance presentee,
 * delivrances du jour de la pharmacie, ordonnances delivrees en partie et
 * encore valables. Reserve au role "pharmacien" ; getTableauDeBordPharmacie
 * fait de toute facon la meme verification cote Server Action (Zero Trust).
 */
export default async function PharmaciePage() {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien")) {
    redirect("/app/medecin");
  }

  if (!(await estFonctionnaliteActive("pharmacy.module"))) {
    return <ModuleDesactive cle="pharmacy.module" />;
  }

  const tableau = await getTableauDeBordPharmacie();
  const partielles = tableau?.partielles ?? [];
  const delivrancesDuJour = tableau?.delivrancesDuJour ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Pharmacie</p>
        <h1 className="text-[28px] font-bold text-titre">Délivrance des ordonnances</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Une ordonnance s&apos;ouvre quand le patient vous la présente : son numéro et son année de naissance
          suffisent. Vous ne voyez jamais les ordonnances d&apos;autres patients.
        </p>
      </header>

      <RechercheOrdonnance />

      <section aria-labelledby="titre-delivrances-du-jour" className="flex flex-col gap-4">
        <h2 id="titre-delivrances-du-jour" className="text-[20px] font-bold text-encre">
          Délivrances du jour
        </h2>
        <Card>
          {delivrancesDuJour.length === 0 ? (
            <p className="text-[13px] text-encre-attenuee">Aucune délivrance enregistrée aujourd&apos;hui.</p>
          ) : (
            <ul className="flex flex-col">
              {delivrancesDuJour.map((delivrance) => {
                const statut = libelleStatut(delivrance.statutOrdonnance, delivrance.annulee);
                return (
                  <li
                    key={delivrance.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-bordure py-3 last:border-0"
                  >
                    <span className="flex items-center gap-3 text-[14px] text-encre">
                      <span className="chiffres font-semibold">{formaterHeure(delivrance.heureISO)}</span>
                      <span className="chiffres">{delivrance.numeroOrdonnance}</span>
                      <span className="text-[13px] text-encre-secondaire">
                        {delivrance.nombreLignes} ligne{delivrance.nombreLignes > 1 ? "s" : ""}
                      </span>
                    </span>
                    <Badge tone={statut.tone}>{statut.texte}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <section aria-labelledby="titre-partielles" className="flex flex-col gap-4">
        <h2 id="titre-partielles" className="text-[20px] font-bold text-encre">
          Ordonnances à reprendre
        </h2>
        <ListeOrdonnancesPartielles ordonnances={partielles} />
      </section>
    </div>
  );
}
