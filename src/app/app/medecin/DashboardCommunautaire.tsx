import Link from "next/link";
import { MapPin } from "lucide-react";
import {
  getMesSuivisCommunautaires,
  type SuiviCommunautaireResume,
} from "@/modules/communautaire/actions";
import { getMonProfil } from "@/modules/identity/actions";
import { getMonQrCode } from "@/modules/verification/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

/** Salutation dependante de l'heure du serveur, meme logique que src/app/app/patient/page.tsx. */
function salutation(): string {
  const heure = new Date().getHours();
  return heure >= 5 && heure < 18 ? "Bonjour" : "Bonsoir";
}

const NOMBRE_MAX_APERCU = 5;

const libellesTypeVisite: Record<string, string> = {
  vaccination: "Vaccination",
  depistage: "Dépistage",
  suivi_grossesse: "Suivi de grossesse",
  sensibilisation: "Sensibilisation",
  autre: "Autre",
};

function libelleTypeVisite(type: string): string {
  return libellesTypeVisite[type] ?? type;
}

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

function estCeMois(dateIso: string): boolean {
  const date = new Date(dateIso);
  const maintenant = new Date();
  return date.getFullYear() === maintenant.getFullYear() && date.getMonth() === maintenant.getMonth();
}

function ApercuVisite({ visite }: { visite: SuiviCommunautaireResume }) {
  return (
    <li className="flex flex-col gap-1 border-b border-bordure pb-3 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-encre">{visite.beneficiaireNom}</span>
        <span className="text-[13px] text-encre-secondaire">{formaterDate(visite.dateVisite)}</span>
      </div>
      <span className="text-[13px] text-encre-secondaire">{libelleTypeVisite(visite.typeVisite)}</span>
    </li>
  );
}

/**
 * Tableau de bord dédié au rôle agent communautaire : visites de terrain
 * (module suivi communautaire), jamais de section clinique ou de rendez-vous
 * (ce rôle ne détient que read/create/update:suivi_communautaire dans la
 * matrice RBAC, voir src/security/permissions.ts).
 */
export async function DashboardCommunautaire() {
  const [profil, visites, qrCode] = await Promise.all([
    getMonProfil(),
    getMesSuivisCommunautaires(),
    getMonQrCode(),
  ]);
  const visitesCeMois = visites.filter((visite) => estCeMois(visite.dateVisite));
  const apercu = visites.slice(0, NOMBRE_MAX_APERCU);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-bold text-titre">
            {salutation()}
            {profil ? `, ${profil.prenom}` : ""}
          </h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Retrouvez ici vos visites de terrain et enregistrez-en de
            nouvelles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Agent communautaire</Badge>
        </div>
      </header>

      <section aria-labelledby="titre-synthese" className="flex flex-col gap-4">
        <h2 id="titre-synthese" className="text-[20px] font-bold text-encre">
          Vue d&apos;ensemble
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
              <MapPin size={20} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                Visites ce mois-ci
              </span>
              <span className="chiffres text-[22px] font-bold text-encre">
                {visitesCeMois.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
              <MapPin size={20} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                Total des visites
              </span>
              <span className="chiffres text-[22px] font-bold text-encre">{visites.length}</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="titre-visites" className="flex flex-col gap-4">
        <h2 id="titre-visites" className="text-[20px] font-bold text-encre">
          Dernières visites
        </h2>
        <Card>
          {apercu.length === 0 ? (
            <p className="text-[13px] text-encre-attenuee">
              Aucune visite enregistrée pour le moment.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {apercu.map((visite) => (
                <ApercuVisite key={visite.id} visite={visite} />
              ))}
            </ul>
          )}
          <Link
            href="/app/medecin/communautaire"
            className="mt-4 inline-block w-fit text-[13px] font-semibold text-accent hover:underline"
          >
            Enregistrer une visite / voir tout l&apos;historique
          </Link>
        </Card>
      </section>

      {qrCode ? (
        <section aria-labelledby="titre-qr" className="flex flex-col gap-4">
          <h2 id="titre-qr" className="text-[20px] font-bold text-encre">
            Mon compte
          </h2>
          <div className="max-w-xs">
            <Card title="Mon QR code" description="À présenter pour vérification (badge professionnel).">
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL genere localement, pas une image distante */}
                <img
                  src={qrCode.dataUrl}
                  alt="QR code de vérification de mon compte"
                  width={140}
                  height={140}
                  className="rounded-champ border border-bordure"
                />
              </div>
            </Card>
          </div>
        </section>
      ) : null}
    </div>
  );
}
