import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Building2, Pill, Stethoscope, Syringe, Users } from "lucide-react";
import { getSession } from "@/lib/session";
import { getVueNationalePilotage, listerDepartementsFiltrables, type PeriodeTableauBord } from "@/modules/pilotage/lecture";
import { lireFiltresDepuisParametres } from "@/modules/pilotage/filtres-pilotage";
import { getAlertesEpidemiologiques } from "@/modules/pilotage/alertes";
import { getCarteSanitaire } from "@/modules/pilotage/carte";
import { INDICATEURS_COMPARABLES } from "@/modules/pilotage/tendances-constantes";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CarteIndicateurNational, texteValeurMasquee } from "./CarteIndicateurNational";
import { CarteSanitaire } from "./CarteSanitaire";
import { SectionFiltresPilotage } from "./SectionFiltresPilotage";
import { GraphiqueEvolutionHebdomadaire } from "./GraphiqueEvolutionHebdomadaire";
import { SectionExportPilotage } from "./SectionExportPilotage";
import { verifierExportPilotageNationalAction } from "@/modules/pilotage/exports";

const PERIODES: { id: PeriodeTableauBord; label: string }[] = [
  { id: "aujourdhui", label: "Aujourd'hui" },
  { id: "7j", label: "7 jours" },
  { id: "30j", label: "30 jours" },
  { id: "mois", label: "Ce mois-ci" },
];

const PERIODES_VALIDES: PeriodeTableauBord[] = ["aujourdhui", "7j", "30j", "mois"];

function periodeDepuisParametre(valeur: string | string[] | undefined): PeriodeTableauBord {
  const brute = Array.isArray(valeur) ? valeur[0] : valeur;
  return (PERIODES_VALIDES as string[]).includes(brute ?? "") ? (brute as PeriodeTableauBord) : "7j";
}

const INDICATEUR_CARTE_PAR_DEFAUT = "IND-01";

function indicateurCarteDepuisParametre(valeur: string | string[] | undefined): string {
  const brute = Array.isArray(valeur) ? valeur[0] : valeur;
  return INDICATEURS_COMPARABLES.some((indicateur) => indicateur.code === brute) ? (brute as string) : INDICATEUR_CARTE_PAR_DEFAUT;
}

interface PilotagePageProps {
  searchParams: Promise<{
    periode?: string | string[];
    indicateur?: string | string[];
    couche?: string | string[];
    territoire?: string | string[];
    type?: string | string[];
    sexe?: string | string[];
    age?: string | string[];
  }>;
}

/**
 * Ecran F-PIL-02 du pack (chapitre 14) : centre national de pilotage, role
 * admin_national. Meme defense en profondeur que src/app/app/ministere/page.tsx
 * (verification du role ici en plus de celle deja faite par
 * getVueNationalePilotage, Zero Trust).
 *
 * Limite assumee documentee dans src/modules/pilotage/lecture.ts : ce depot
 * n'a qu'un seul role d'autorite sanitaire (admin_national, portee toujours
 * nationale), donc RG-PIL-20 (restriction de portee departement/zone) est
 * sans objet ici, pas silencieusement ignoree.
 *
 * Barre de filtres (territoire, type d'etablissement, sexe, tranche d'age,
 * en plus de la periode) : verifiee cote serveur dans lecture.ts
 * (Zero Trust), jamais un filtre invalide ne change silencieusement le
 * resultat. Un filtre qui ne peut pas s'appliquer a un indicateur (ex. sexe
 * sur IND-04, IND-05, IND-08, IND-10, qui n'ont pas cette dimension) fait
 * afficher "Non disponible avec ces filtres" sur sa carte plutot qu'un
 * chiffre trompeur. RG-PIL-05 : le top des diagnostics n'affiche les groupes
 * sensibles que sans filtre, ou avec un seul departement filtre.
 *
 * F-PIL-03 (carte sanitaire) : carte choroplethe des 12 departements a
 * l'emplacement impose par le pack (filtres, indicateurs cles, carte +
 * diagnostics, evolution, alertes) ; indicateur et couche des etablissements
 * choisis dans l'URL (la carte n'applique pas le filtre territoire, deja une
 * repartition par departement ; elle applique l'indicateur choisi et la
 * meme periode). F-PIL-06 (alertes
 * epidemiologiques) est livree (src/modules/pilotage/alertes.ts) : ce bloc
 * n'affiche qu'un resume (nombre de nouvelles alertes), le detail et le
 * traitement se font sur /app/pilotage/alertes.
 */
export default async function PilotagePage({ searchParams }: PilotagePageProps) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin_national")) {
    redirect("/app");
  }

  const params = await searchParams;
  const periode = periodeDepuisParametre(params.periode);
  const indicateurCarte = indicateurCarteDepuisParametre(params.indicateur);
  const coucheEtablissements = (Array.isArray(params.couche) ? params.couche[0] : params.couche) === "etablissements";
  const filtresDemandes = lireFiltresDepuisParametres(params);
  const [vue, alertes, carte, departements] = await Promise.all([
    getVueNationalePilotage(periode, filtresDemandes),
    getAlertesEpidemiologiques(),
    getCarteSanitaire(indicateurCarte, periode, coucheEtablissements),
    listerDepartementsFiltrables(),
  ]);
  const nouvellesAlertes = alertes?.filter((alerte) => alerte.statut === "nouvelle").length ?? 0;
  const NON_DISPONIBLE = "Non disponible avec ces filtres";
  const nonDisponible = (cle: (typeof vue extends null ? never : NonNullable<typeof vue>["nonFiltrables"][number])) =>
    vue !== null && vue.nonFiltrables.includes(cle);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:px-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère de la Santé</p>
        <h1 className="text-[28px] font-bold text-titre">Centre national de pilotage</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Indicateurs agrégés et anonymisés de l&apos;ensemble du réseau sanitaire.
        </p>
      </header>

      {vue === null ? (
        <Card title="Accès refusé">
          <p className="text-[13px] text-encre-secondaire">
            Votre session ne dispose pas des droits nécessaires pour consulter cet écran.
          </p>
        </Card>
      ) : (
        <>
          {/* 1. Barre de filtres (RG-PIL-02/pack : toujours visible, reflete dans l'URL) */}
          <div
            role="group"
            aria-label="Choisir la période"
            className="flex w-fit flex-wrap gap-1 rounded-champ border border-bordure bg-plan p-1"
          >
            {PERIODES.map((item) => {
              const selectionnee = item.id === periode;
              return (
                <Link
                  key={item.id}
                  href={`/app/pilotage?periode=${item.id}&indicateur=${indicateurCarte}${coucheEtablissements ? "&couche=etablissements" : ""}`}
                  aria-current={selectionnee ? "true" : undefined}
                  className={
                    selectionnee
                      ? "rounded-champ bg-accent px-3 py-1.5 text-[13px] font-semibold text-surface"
                      : "rounded-champ px-3 py-1.5 text-[13px] font-semibold text-encre-secondaire hover:text-encre"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <SectionFiltresPilotage
            filtres={vue.filtres}
            departements={departements ?? []}
            periode={periode}
            indicateurCarte={indicateurCarte}
            coucheEtablissements={coucheEtablissements}
          />

          {/* 2. Indicateurs cles (6 cartes) */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <CarteIndicateurNational
              icon={Stethoscope}
              label="Consultations (IND-01)"
              value={nonDisponible("consultations") ? NON_DISPONIBLE : texteValeurMasquee(vue.consultations.valeur)}
              info="Nombre de consultations validées sur la période, tout le réseau."
              variationPourcent={vue.consultations.variationPourcent}
              sansVariation={nonDisponible("consultations")}
            />
            <CarteIndicateurNational
              icon={Users}
              label="Patients vus (IND-02)"
              value={nonDisponible("patientsVus") ? NON_DISPONIBLE : texteValeurMasquee(vue.patientsVus.valeur)}
              info="Patients distincts vus sur la période. Somme des comptes quotidiens (un patient vu deux jours différents peut être compté deux fois)."
              variationPourcent={vue.patientsVus.variationPourcent}
              sansVariation={nonDisponible("patientsVus")}
            />
            <CarteIndicateurNational
              icon={Building2}
              label="Établissements actifs (IND-05)"
              value={
                nonDisponible("etablissementsActifs")
                  ? NON_DISPONIBLE
                  : `${texteValeurMasquee(vue.etablissementsActifs.actifs)} / ${vue.etablissementsActifs.total}`
              }
              info="Établissements avec au moins 1 consultation validée dans les 7 derniers jours, sur le total du référentiel (le filtre sexe et le filtre tranche d'âge ne s'y appliquent pas, cet indicateur n'a pas cette dimension)."
              sansVariation
            />
            <CarteIndicateurNational
              icon={AlertTriangle}
              label="Cas de paludisme (IND-04)"
              value={nonDisponible("casPaludisme") ? NON_DISPONIBLE : texteValeurMasquee(vue.casPaludisme.valeur)}
              info="Consultations dont le diagnostic principal est classé « Paludisme » sur la période (le filtre sexe et le filtre tranche d'âge ne s'y appliquent pas, cet indicateur n'a pas cette dimension)."
              variationPourcent={vue.casPaludisme.variationPourcent}
              sansVariation={nonDisponible("casPaludisme")}
            />
            <CarteIndicateurNational
              icon={Pill}
              label="Taux de délivrance (IND-08)"
              value={nonDisponible("tauxDelivrance") ? NON_DISPONIBLE : vue.tauxDelivranceOrdonnances}
              info="Ordonnances délivrées (totalement ou partiellement) sous 30 jours, sur les ordonnances signées de la période (le filtre sexe et le filtre tranche d'âge ne s'y appliquent pas, cet indicateur n'a pas cette dimension)."
              sansVariation
            />
            <CarteIndicateurNational
              icon={Syringe}
              label="Vaccinations (IND-10)"
              value={nonDisponible("vaccinations") ? NON_DISPONIBLE : texteValeurMasquee(vue.vaccinations.valeur)}
              info="Doses de vaccination administrées en établissement sur la période (hors vaccination de terrain, non structurée dans ce dépôt ; le filtre sexe ne s'y applique pas, cet indicateur n'a pas cette dimension)."
              variationPourcent={vue.vaccinations.variationPourcent}
              sansVariation={nonDisponible("vaccinations")}
            />
          </div>

          {/* 3. Carte a gauche, top des diagnostics a droite */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Carte sanitaire (F-PIL-03)" description="Carte choroplèthe par département, sur la période choisie.">
              {carte === null ? (
                <p className="text-[13px] text-encre-attenuee">La carte n&apos;est pas disponible pour cette session.</p>
              ) : (
                <CarteSanitaire carte={carte} couche={coucheEtablissements} />
              )}
            </Card>

            <Card
              title="Top des diagnostics (IND-03)"
              description={
                vue.groupesSensiblesExclus
                  ? "Consultations par groupe de maladies (mots-clés). Les groupes sensibles (RG-PIL-05) sont exclus tant que le territoire n'est pas limité à un seul département sans autre filtre."
                  : "Consultations par groupe de maladies, classification par mots-clés (pas de codage CIM-10 dans ce dépôt)."
              }
            >
              {vue.topDiagnostics.length === 0 ? (
                <p className="text-[13px] text-encre-attenuee">Aucun diagnostic classifiable sur cette période.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {vue.topDiagnostics.map((diagnostic, index) => (
                    <li key={diagnostic.code} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-encre">
                        <span className="chiffres text-encre-attenuee">{index + 1}.</span> {diagnostic.libelle}
                      </span>
                      <span className="chiffres font-semibold text-encre">{texteValeurMasquee(diagnostic.valeur)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          {/* 4. Evolution hebdomadaire (12 dernieres semaines) */}
          <Card
            title="Évolution (12 dernières semaines)"
            description={
              nonDisponible("evolutionPaludisme")
                ? "Consultations et cas de paludisme, indépendamment de la période sélectionnée ci-dessus. Les semaines de 1 à 4 cas sont affichées « < 5 ». Le paludisme n'a pas de dimension sexe ni tranche d'âge : la courbe reste vide tant qu'un de ces filtres est actif."
                : "Consultations et cas de paludisme, indépendamment de la période sélectionnée ci-dessus. Les semaines de 1 à 4 cas sont affichées « < 5 »."
            }
            actions={
              <Link href="/app/pilotage/tendances" className="text-[13px] font-semibold text-accent hover:underline">
                Tendances par territoire (F-PIL-04)
              </Link>
            }
          >
            <GraphiqueEvolutionHebdomadaire donnees={vue.evolutionHebdomadaire} />
          </Card>

          {/* 5. Alertes (F-PIL-06) */}
          <Card
            title="Alertes épidémiologiques (F-PIL-06)"
            description="Cas d'un groupe de maladies dépassant un seuil par défaut, sur une semaine et une zone sanitaire."
            actions={
              alertes !== null ? (
                <Badge tone={nouvellesAlertes > 0 ? "warning" : "neutral"}>
                  {nouvellesAlertes > 0 ? `${nouvellesAlertes} nouvelle(s)` : "Aucune nouvelle"}
                </Badge>
              ) : undefined
            }
          >
            <div className="flex flex-col items-center gap-2 rounded-champ border border-bordure bg-plan px-4 py-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
                <AlertTriangle size={20} aria-hidden="true" />
              </span>
              <p className="text-[14px] font-semibold text-encre">
                {alertes === null
                  ? "Accès refusé"
                  : nouvellesAlertes > 0
                    ? `${nouvellesAlertes} alerte(s) à traiter`
                    : "Aucune alerte à traiter"}
              </p>
              <Link
                href="/app/pilotage/alertes"
                className="text-[13px] font-semibold text-accent hover:underline"
              >
                Voir toutes les alertes
              </Link>
            </div>
          </Card>

          {/* 6. Export (F-PIL-05) */}
          <SectionExportPilotage portee="national" periode={periode} action={verifierExportPilotageNationalAction} />

          {/* 7. Mention permanente */}
          <p className="text-center text-[12px] text-encre-attenuee">
            Données agrégées et anonymisées (valeurs inférieures à 5 masquées), mise à jour :{" "}
            {vue.dateCalculPlusRecente ? vue.dateCalculPlusRecente.toLocaleString("fr-FR") : "aucun agrégat calculé"}.
          </p>
        </>
      )}
    </div>
  );
}
