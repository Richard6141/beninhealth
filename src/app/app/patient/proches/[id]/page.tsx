import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getProcheParId,
  getRendezVousDuProche,
} from "@/modules/proches/actions";
import {
  listEtablissements,
  listProfessionnelsParEtablissement,
} from "@/modules/facility/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { BoutonRendezVousProche } from "./FormulaireRendezVousProche";
import { BoutonRetirerProche } from "./BoutonRetirerProche";

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "Demande envoyée", tone: "info" };
  if (cle === "confirme") return { texte: "Confirmé", tone: "good" };
  if (cle === "termine") return { texte: "Terminé", tone: "neutral" };
  if (cle === "annule") return { texte: "Annulé", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

function formaterDateTimeLocal(date: Date): string {
  const pad = (valeur: number) => String(valeur).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Dossier de base d'une personne à charge (F-CIT-08 du pack, périmètre
 * réduit : voir src/modules/proches/actions.ts pour les limites assumées).
 * Contrairement au pack (bascule de tout l'espace citoyen avec bandeau
 * permanent), cet écran dédié montre l'identité, l'historique des
 * rendez-vous et permet d'en prendre un nouveau au nom de la personne à
 * charge. Zero Trust revérifié à chaque appel (getProcheParId,
 * getRendezVousDuProche) : jamais supposé depuis le seul id dans l'URL.
 */
export default async function ProcheDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const proche = await getProcheParId(id);

  if (!proche) {
    notFound();
  }

  const [rendezVous, etablissements] = await Promise.all([
    getRendezVousDuProche(id),
    listEtablissements(),
  ]);

  const professionnelsParEtablissement = await Promise.all(
    etablissements.map((etablissement) => listProfessionnelsParEtablissement(etablissement.id))
  );
  const professionnels = professionnelsParEtablissement.flat();
  const dateMinimum = formaterDateTimeLocal(new Date());

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/patient/proches"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour à mes proches
        </Link>
        <h1 className="text-[28px] font-bold text-titre">
          {proche.prenom} {proche.nom}
        </h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Vous agissez pour cette personne à charge. Chaque action est
          journalisée en votre nom.
        </p>
      </header>

      <section aria-labelledby="titre-identite" className="flex flex-col gap-4">
        <h2 id="titre-identite" className="text-[20px] font-bold text-encre">
          Identité
        </h2>
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[12px] text-encre-attenuee">Identifiant santé</p>
              <p className="text-[15px] font-semibold text-encre">{proche.identifiantSante}</p>
            </div>
            <div>
              <p className="text-[12px] text-encre-attenuee">Date de naissance</p>
              <p className="text-[15px] font-semibold text-encre">
                {new Date(proche.dateNaissance).toLocaleDateString("fr-FR")}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-encre-attenuee">Sexe</p>
              <p className="text-[15px] font-semibold text-encre">
                {proche.sexe === "M" ? "Masculin" : "Féminin"}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <BoutonRetirerProche procheId={proche.id} prenom={proche.prenom} />
          </div>
        </Card>
      </section>

      <section aria-labelledby="titre-rdv-proche" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titre-rdv-proche" className="text-[20px] font-bold text-encre">
            Rendez-vous
          </h2>
          {etablissements.length > 0 ? (
            <BoutonRendezVousProche
              procheId={proche.id}
              etablissements={etablissements}
              professionnels={professionnels}
              dateMinimum={dateMinimum}
            />
          ) : null}
        </div>

        {rendezVous.length === 0 ? (
          <Card>
            <p className="text-[13px] text-encre-attenuee">
              Aucun rendez-vous pour le moment.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {rendezVous.map((rdv) => {
              const statut = libelleStatut(rdv.statut);
              return (
                <Card key={rdv.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold text-encre">
                        {new Date(rdv.date).toLocaleString("fr-FR", {
                          dateStyle: "long",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="text-[13px] text-encre-secondaire">
                        {rdv.etablissementNom}
                        {rdv.professionnelNomComplet ? ` — ${rdv.professionnelNomComplet}` : ""}
                      </p>
                      <p className="text-[13px] text-encre-attenuee">{rdv.motif}</p>
                    </div>
                    <Badge tone={statut.tone}>{statut.texte}</Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Alert level="info" title="Périmètre de cette version">
        Cet écran montre l&apos;identité et les rendez-vous. Le carnet de
        vaccination, les consultations et les documents de cette personne ne
        sont pas encore consultables depuis cet écran.
      </Alert>
    </div>
  );
}
