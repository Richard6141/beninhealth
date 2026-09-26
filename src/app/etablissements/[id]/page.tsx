import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import { getEtablissementPublicParId } from "@/modules/facility/annuaire-public";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { libelleTypeEtablissement } from "@/app/app/ministere/lib";

interface FicheEtablissementPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Fiche publique d'un établissement (F-ETA-02 du pack), accessible sans
 * connexion (Rôles: Tous). RG-ETA-10 : jamais de liste nominative du
 * personnel (aucun opt-in "afficher publiquement" n'existe sur
 * ProfessionnelSante dans ce dépôt, donc aucun personnel n'est jamais
 * affiché ici, plutôt que d'en inventer un). "Prendre rendez-vous" redirige
 * vers la connexion : ce dépôt n'a pas de mécanisme de redirection post-
 * connexion vers une page précise, limite assumée documentée ici.
 */
export default async function FicheEtablissementPage({ params }: FicheEtablissementPageProps) {
  const { id } = await params;
  const etablissement = await getEtablissementPublicParId(id);

  if (!etablissement) {
    notFound();
  }

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
      </header>

      <div className="conteneur-page mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Link
          href="/etablissements"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour à l&apos;annuaire
        </Link>

        <Card>
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-[24px] font-bold text-titre">
                  {etablissement.nom}
                  {etablissement.sigle ? ` (${etablissement.sigle})` : ""}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{libelleTypeEtablissement(etablissement.type)}</Badge>
                  {etablissement.secteur ? <Badge tone="info">{etablissement.secteur}</Badge> : null}
                </div>
              </div>
              <Link
                href="/connexion"
                className="inline-flex h-11 items-center justify-center rounded-carte bg-marine px-4 text-[15px] font-semibold text-white transition-colors hover:bg-marine-fonce"
              >
                Prendre rendez-vous
              </Link>
            </div>

            <div className="flex flex-col gap-2 border-t border-bordure pt-4">
              <p className="flex items-start gap-2 text-[14px] text-encre">
                <MapPin size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  {etablissement.adresse ?? etablissement.localisation}
                  {etablissement.communeNom ? `, ${etablissement.communeNom}` : ""}
                  {etablissement.departementNom ? ` (${etablissement.departementNom})` : ""}
                </span>
              </p>
              {etablissement.telephone ? (
                <p className="flex items-center gap-2 text-[14px] text-encre">
                  <Phone size={16} className="shrink-0 text-accent" aria-hidden="true" />
                  {etablissement.telephone}
                </p>
              ) : null}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${etablissement.latitude},${etablissement.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit text-[13px] font-semibold text-accent hover:underline"
              >
                Itinéraire
              </a>
            </div>

            {etablissement.servicesDisponibles.length > 0 ? (
              <div className="flex flex-col gap-2 border-t border-bordure pt-4">
                <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-encre-attenuee">
                  Services proposés
                </p>
                <div className="flex flex-wrap gap-2">
                  {etablissement.servicesDisponibles.map((service) => (
                    <Badge key={service} tone="neutral">
                      {service}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
