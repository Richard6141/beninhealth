import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { getExamensPourLaboratoire, type ExamenResume } from "@/modules/laboratoire/actions";
import { getMonProfil } from "@/modules/identity/actions";
import { getMonQrCode } from "@/modules/verification/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const NOMBRE_MAX_APERCU = 5;
const STATUTS_EN_ATTENTE = new Set(["demande", "en_cours"]);

/** Salutation dependante de l'heure du serveur, meme logique que src/app/app/patient/page.tsx. */
function salutation(): string {
  const heure = new Date().getHours();
  return heure >= 5 && heure < 18 ? "Bonjour" : "Bonsoir";
}

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

function ApercuExamen({ examen }: { examen: ExamenResume }) {
  return (
    <li className="flex flex-col gap-1 border-b border-bordure pb-3 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-encre">
          {examen.patientNomComplet ?? "Patient non précisé"}
        </span>
        <span className="text-[13px] text-encre-secondaire">{formaterDate(examen.date)}</span>
      </div>
      <span className="text-[13px] text-encre-secondaire">{examen.typeExamen}</span>
    </li>
  );
}

/**
 * Tableau de bord dédié au rôle laboratoire : uniquement les examens à
 * traiter, jamais de section "Patients du jour" ou "Rendez-vous" (ce rôle ne
 * détient aucune permission read:rendez_vous ni read:patient dans la matrice
 * RBAC, voir src/security/permissions.ts).
 */
export async function DashboardLaboratoire() {
  const [profil, examens, qrCode] = await Promise.all([
    getMonProfil(),
    getExamensPourLaboratoire(),
    getMonQrCode(),
  ]);
  const enAttente = examens.filter((examen) => STATUTS_EN_ATTENTE.has(examen.statut));
  const apercu = enAttente.slice(0, NOMBRE_MAX_APERCU);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-bold text-titre">
            {salutation()}
            {profil ? `, ${profil.prenom}` : ""}
          </h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Retrouvez ici les examens assignés à votre établissement, en
            attente de résultat.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Laboratoire</Badge>
        </div>
      </header>

      <section aria-labelledby="titre-examens" className="flex flex-col gap-4">
        <h2 id="titre-examens" className="text-[20px] font-bold text-encre">
          Examens en attente
        </h2>

        <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
            <FlaskConical size={20} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
              En attente de résultat
            </span>
            <span className="chiffres text-[22px] font-bold text-encre">{enAttente.length}</span>
          </div>
        </div>

        <Card
          title="Aperçu"
          description="Les demandes les plus anciennes en premier."
          actions={enAttente.length > 0 ? <Badge tone="accent">{enAttente.length}</Badge> : undefined}
        >
          {apercu.length === 0 ? (
            <p className="text-[13px] text-encre-attenuee">
              Aucun examen en attente de résultat pour le moment.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {apercu.map((examen) => (
                <ApercuExamen key={examen.id} examen={examen} />
              ))}
            </ul>
          )}
          <Link
            href="/app/medecin/laboratoire"
            className="mt-4 inline-block w-fit text-[13px] font-semibold text-accent hover:underline"
          >
            Voir tous les examens
          </Link>
          <Link
            href="/app/medecin/laboratoire/validation"
            className="mt-2 block w-fit text-[13px] font-semibold text-accent hover:underline"
          >
            Résultats à valider ({examens.filter((examen) => examen.statut === "resultat_saisi").length})
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
