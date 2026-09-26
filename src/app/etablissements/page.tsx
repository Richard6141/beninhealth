import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { getAnnuairePublicEtablissements } from "@/modules/facility/annuaire-public";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { libelleTypeEtablissement } from "@/app/app/ministere/lib";

interface AnnuaireEtablissementsPageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

/**
 * Annuaire public des etablissements (F-ETA-01 du pack), accessible sans
 * connexion (Rôles: Tous). Recherche par nom ou localisation (parametre
 * d'URL "q", GET simple : pas de useState/formulaire controle necessaire
 * pour un cas d'usage aussi simple, la page se recharge avec le resultat).
 */
export default async function AnnuaireEtablissementsPage({
  searchParams,
}: AnnuaireEtablissementsPageProps) {
  const params = await searchParams;
  const recherche = premiereValeur(params.q).trim();
  const etablissements = await getAnnuairePublicEtablissements(recherche);

  return (
    <div className="flex min-h-screen flex-col bg-plan">
      <header className="flex flex-col items-center gap-4 border-b border-bordure bg-surface px-4 py-8">
        <Image
          src="/image.png"
          alt="Ministère de la Santé, République du Bénin"
          width={225}
          height={64}
          className="h-16 w-auto"
          priority
        />
        <h1 className="text-[26px] font-bold text-titre">Annuaire des établissements de santé</h1>
        <p className="max-w-xl text-center text-[15px] text-encre-secondaire">
          Recherchez un établissement par nom ou par localisation. La prise de rendez-vous en ligne
          nécessite un compte citoyen.
        </p>
        <Link href="/connexion" className="text-[13px] font-semibold text-accent hover:underline">
          Se connecter
        </Link>
      </header>

      <div className="conteneur-page mx-auto flex w-full flex-col gap-6 px-4 py-8 sm:px-6">
        <form method="GET" className="flex max-w-md flex-col gap-3">
          <TextField
            label="Rechercher"
            name="q"
            defaultValue={recherche}
            placeholder="Nom ou localisation (ex. Cotonou)"
            hint={`${etablissements.length} établissement${etablissements.length > 1 ? "s" : ""} trouvé${etablissements.length > 1 ? "s" : ""}.`}
          />
          <Button type="submit" variant="primary" size="sm" className="w-fit">
            Rechercher
          </Button>
        </form>

        {etablissements.length === 0 ? (
          <EtatVide
            titre="Aucun établissement trouvé"
            description="Essayez un autre nom ou une autre localisation."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {etablissements.map((etablissement) => (
              <Link key={etablissement.id} href={`/etablissements/${etablissement.id}`}>
                <Card className="h-full transition-colors hover:border-accent">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[16px] font-semibold text-encre">
                        {etablissement.nom}
                        {etablissement.sigle ? ` (${etablissement.sigle})` : ""}
                      </p>
                      <Badge tone="neutral">{libelleTypeEtablissement(etablissement.type)}</Badge>
                    </div>
                    <p className="flex items-center gap-1.5 text-[13px] text-encre-secondaire">
                      <MapPin size={14} className="shrink-0 text-accent" aria-hidden="true" />
                      {etablissement.localisation}
                      {etablissement.communeNom ? ` · ${etablissement.communeNom}` : ""}
                      {etablissement.departementNom ? ` (${etablissement.departementNom})` : ""}
                    </p>
                    <p className="mt-2 text-[13px] font-semibold text-accent">Voir la fiche →</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
