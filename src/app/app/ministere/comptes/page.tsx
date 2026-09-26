import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getActionsEnAttente,
  getFicheCompteNational,
  rechercherComptesNationaux,
} from "@/modules/administration/gestion-comptes-nationale";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  FormulaireActionCompte,
  FormulaireInvitationAdmin,
  ListeActionsEnAttente,
} from "./FormulairesComptes";

const LIBELLES_ROLE: Record<string, string> = {
  patient: "Patient",
  medecin: "Médecin",
  infirmier: "Infirmier",
  agent_communautaire: "Agent communautaire",
  pharmacien: "Pharmacien",
  laboratoire: "Laboratoire",
  admin_etablissement: "Administrateur d'établissement",
  admin_national: "Administrateur national",
};

const LIBELLES_STATUT: Record<string, { texte: string; tone: "good" | "critical" | "neutral" }> = {
  actif: { texte: "Actif", tone: "good" },
  suspendu: { texte: "Suspendu", tone: "critical" },
  termine: { texte: "Terminé", tone: "neutral" },
  sans_compte: { texte: "Sans compte", tone: "neutral" },
};

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

function premiereValeur(valeur: string | string[] | undefined): string {
  return (Array.isArray(valeur) ? valeur[0] : valeur) ?? "";
}

/**
 * Ecran "Gestion des comptes" (F-ADM-05 du pack), reserve a l'administration
 * nationale (permission compte_plateforme). Aucune donnee medicale : identite,
 * roles, affiliations, sessions, second facteur. Voir
 * src/modules/administration/gestion-comptes-nationale.ts pour les gardes et
 * le principe des quatre yeux (RG-ADM-30).
 */
export default async function ComptesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; id?: string | string[] }>;
}) {
  const params = await searchParams;
  const critere = premiereValeur(params.q).trim();
  const idFiche = premiereValeur(params.id).trim();

  const [resultats, fiche, enAttente] = await Promise.all([
    critere.length >= 3 ? rechercherComptesNationaux(critere) : Promise.resolve([]),
    idFiche ? getFicheCompteNational(idFiche) : Promise.resolve(null),
    getActionsEnAttente(),
  ]);

  const acces = enAttente !== null;

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
        <h1 className="text-[28px] font-bold text-titre">Gestion des comptes</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Recherchez un compte par téléphone ou e-mail exacts, par numéro d&apos;Ordre ou par nom. Vous ne voyez
          aucune donnée médicale. Toute action sur un compte d&apos;administrateur doit être confirmée par un
          autre administrateur.
        </p>
      </header>

      {!acces ? (
        <Alert level="critical" title="Accès refusé">
          Cet écran est réservé à l&apos;administration nationale.
        </Alert>
      ) : (
        <>
          <Card title="Demandes en attente de confirmation" description="Quatre yeux (RG-ADM-30) : une demande ne peut pas être décidée par son auteur.">
            <ListeActionsEnAttente demandes={enAttente} />
          </Card>

          <Card title="Rechercher un compte">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="flex w-full max-w-md flex-col gap-1.5">
                <label htmlFor="q" className="text-[15px] font-semibold text-encre">
                  Téléphone, e-mail, numéro d&apos;Ordre ou nom (3 caractères minimum)
                </label>
                <input
                  id="q"
                  name="q"
                  defaultValue={critere}
                  minLength={3}
                  required
                  className="h-11 w-full rounded-champ border border-bordure-forte bg-surface px-3 text-[16px] text-encre focus-visible:outline-2 focus-visible:outline-marine focus-visible:outline-offset-2"
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-champ bg-marine px-4 text-[15px] font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-marine focus-visible:outline-offset-2"
              >
                Rechercher
              </button>
            </form>

            {critere.length > 0 && critere.length < 3 ? (
              <p className="mt-3 text-[13px] text-critique">Saisissez au moins 3 caractères.</p>
            ) : null}

            {critere.length >= 3 ? (
              resultats && resultats.length > 0 ? (
                <ul className="mt-4 flex flex-col">
                  {resultats.map((compte) => {
                    const statut = LIBELLES_STATUT[compte.statut] ?? { texte: compte.statut, tone: "neutral" as const };
                    return (
                      <li key={compte.id} className="flex flex-col gap-1 border-b border-bordure py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[15px] font-semibold text-encre">{compte.nomComplet}</p>
                            <Badge tone={statut.tone}>{statut.texte}</Badge>
                            {compte.roles.map((role) => (
                              <Badge key={role} tone="neutral">
                                {LIBELLES_ROLE[role] ?? role}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-[13px] text-encre-secondaire">
                            {compte.email}, {compte.telephone}
                            {compte.etablissementNom ? `, ${compte.etablissementNom}` : ""}
                          </p>
                        </div>
                        <Link
                          href={`/app/ministere/comptes?q=${encodeURIComponent(critere)}&id=${compte.id}`}
                          className="text-[13px] font-semibold text-accent hover:underline"
                        >
                          Ouvrir la fiche
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-4 text-[14px] text-encre-secondaire">Aucun compte ne correspond à cette recherche.</p>
              )
            ) : null}
          </Card>

          {fiche ? (
            <Card title={`Fiche : ${fiche.nomComplet}`} description="Identité, rôles, affiliations et sécurité du compte. Aucune donnée médicale.">
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={(LIBELLES_STATUT[fiche.statut] ?? { tone: "neutral" as const }).tone}>
                    {(LIBELLES_STATUT[fiche.statut] ?? { texte: fiche.statut }).texte}
                  </Badge>
                  <Badge tone={fiche.mfaActif ? "good" : "neutral"}>
                    {fiche.mfaActif ? "Second facteur actif" : "Second facteur non activé"}
                  </Badge>
                  {fiche.actionEnAttente ? <Badge tone="alert">Demande en attente</Badge> : null}
                </div>

                <dl className="grid gap-3 text-[14px] sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-encre-secondaire">E-mail</dt>
                    <dd className="text-encre">{fiche.email}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-encre-secondaire">Téléphone</dt>
                    <dd className="text-encre">{fiche.telephone}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-encre-secondaire">Rôles</dt>
                    <dd className="text-encre">{fiche.roles.map((role) => LIBELLES_ROLE[role] ?? role).join(", ") || "Aucun"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-encre-secondaire">Dernière connexion</dt>
                    <dd className="text-encre">{fiche.derniereConnexion ? formaterDate(fiche.derniereConnexion) : "Jamais"}</dd>
                  </div>
                  {fiche.profession || fiche.numeroOrdre ? (
                    <div>
                      <dt className="font-semibold text-encre-secondaire">Inscription à l&apos;Ordre</dt>
                      <dd className="text-encre">
                        {fiche.profession ?? "Profession non renseignée"}, {fiche.numeroOrdre ?? "numéro non renseigné"}
                        {fiche.statutValidationProfessionnel ? ` (validation : ${fiche.statutValidationProfessionnel})` : ""}
                      </dd>
                    </div>
                  ) : null}
                  {fiche.etablissementNom ? (
                    <div>
                      <dt className="font-semibold text-encre-secondaire">Établissement</dt>
                      <dd className="text-encre">{fiche.etablissementNom}</dd>
                    </div>
                  ) : null}
                </dl>

                {fiche.affiliations.length > 0 ? (
                  <div>
                    <p className="text-[14px] font-semibold text-encre-secondaire">Affiliations</p>
                    <ul className="mt-1 flex flex-col gap-1 text-[14px] text-encre">
                      {fiche.affiliations.map((affiliation, index) => (
                        <li key={`${affiliation.etablissementNom}-${index}`}>
                          {affiliation.etablissementNom} : {LIBELLES_ROLE[affiliation.roleNom] ?? affiliation.roleNom} ({affiliation.statut})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[14px] font-semibold text-encre-secondaire">Sessions actives ({fiche.sessionsActives.length})</p>
                    <ul className="mt-1 flex flex-col gap-1 text-[13px] text-encre">
                      {fiche.sessionsActives.length === 0 ? <li>Aucune session ouverte.</li> : null}
                      {fiche.sessionsActives.map((session, index) => (
                        <li key={index}>
                          {session.appareil}, {session.navigateur}, dernière activité {formaterDate(session.derniereActivite)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-encre-secondaire">Dernières connexions</p>
                    <ul className="mt-1 flex flex-col gap-1 text-[13px] text-encre">
                      {fiche.dernieresConnexions.length === 0 ? <li>Aucune connexion enregistrée.</li> : null}
                      {fiche.dernieresConnexions.map((date) => (
                        <li key={date}>{formaterDate(date)}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-bordure pt-4">
                  {fiche.statut === "actif" ? (
                    <FormulaireActionCompte userId={fiche.id} type="suspension" estAdministrateur={fiche.estAdministrateur} />
                  ) : null}
                  {fiche.statut === "suspendu" ? (
                    <FormulaireActionCompte userId={fiche.id} type="reactivation" estAdministrateur={fiche.estAdministrateur} />
                  ) : null}
                  {fiche.mfaActif ? (
                    <FormulaireActionCompte userId={fiche.id} type="reinitialisation_2fa" estAdministrateur={fiche.estAdministrateur} />
                  ) : null}
                </div>
              </div>
            </Card>
          ) : idFiche ? (
            <Alert level="warning" title="Compte introuvable">
              Ce compte n&apos;existe pas ou vous n&apos;avez pas le droit de le consulter.
            </Alert>
          ) : null}

          <Card title="Inviter un administrateur national" description="Le compte n'est créé qu'après confirmation par un autre administrateur.">
            <FormulaireInvitationAdmin />
          </Card>
        </>
      )}
    </div>
  );
}
