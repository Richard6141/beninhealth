import Image from "next/image";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ShieldCheck, ShieldX } from "lucide-react";
import { getSession } from "@/lib/session";
import { verifierOrdonnancePublique } from "@/modules/prescription/verification-publique";
import { verifierEtIncrementerDebit } from "@/lib/limite-debit";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";

const LIMITE_PAR_MINUTE = 30;
const FENETRE_MS = 60_000;

const LIBELLES_STATUT: Record<string, string> = {
  delivree: "délivrée",
  annulee: "annulée",
  expiree: "expirée",
};

function formaterDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR");
  } catch {
    return iso;
  }
}

async function adresseIpCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for")?.split(",")[0]?.trim() || listeEntetes.get("x-real-ip") || "inconnue";
  } catch {
    return "inconnue";
  }
}

interface PageVerificationOrdonnanceProps {
  params: Promise<{ numero: string }>;
  searchParams: Promise<{ k?: string | string[] }>;
}

/**
 * Page publique de verification d'une ordonnance par QR code (F-PRE-06,
 * chapitre 11 du pack). Aucune connexion requise. RG-PRE-42 : un pharmacien
 * deja connecte est redirige vers F-PHA-02 (recherche d'ordonnance dans son
 * flux normal) plutot que d'utiliser ce lien public.
 *
 * Aucune journalisation JournalAudit ici : ce journal exige un utilisateur
 * identifie (utilisateurId non nul, voir src/modules/audit/journaliser.ts),
 * ce que cette page, publique et anonyme par conception, n'a jamais. Aucune
 * regle du pack (section 11) n'exige de journaliser ces consultations
 * anonymes ; seule RG-PRE-41 (debit) protege cette page, via
 * src/lib/limite-debit.ts.
 */
export default async function PageVerificationOrdonnance({ params, searchParams }: PageVerificationOrdonnanceProps) {
  const session = await getSession();
  if (session?.roles.includes("pharmacien")) {
    redirect("/app/medecin/pharmacie");
  }

  const { numero } = await params;
  const parametresRecherche = await searchParams;
  const cleBrute = parametresRecherche.k;
  const cle = Array.isArray(cleBrute) ? (cleBrute[0] ?? null) : (cleBrute ?? null);

  const adresseIp = await adresseIpCourante();
  const { autorise } = verifierEtIncrementerDebit(`verify-ordonnance:${adresseIp}`, LIMITE_PAR_MINUTE, FENETRE_MS);

  const resultat = autorise ? await verifierOrdonnancePublique(numero, cle) : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-plan px-4 py-10">
      <Image
        src="/image.png"
        alt="Ministère de la Santé, République du Bénin"
        width={225}
        height={64}
        className="h-20 w-auto"
        priority
      />
      <div className="w-full max-w-md">
        {!autorise ? (
          <Alert level="warning" title="Trop de vérifications">
            Trop de vérifications depuis cette adresse. Réessayez dans une minute.
          </Alert>
        ) : resultat === null ? (
          <Card title="Vérification d'ordonnance">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-critique-clair text-critique">
                <ShieldX size={22} aria-hidden="true" />
              </span>
              <p className="text-[16px] font-semibold text-encre">Ordonnance introuvable</p>
              <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
                Ce lien ne correspond à aucune ordonnance vérifiable. Vérifiez que vous avez scanné le QR code
                complet.
              </p>
            </div>
          </Card>
        ) : (
          <Card title="Vérification d'ordonnance">
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bon-clair text-bon">
                  <ShieldCheck size={22} aria-hidden="true" />
                </span>
                <p className="text-[16px] font-semibold text-encre">
                  Ordonnance <span className="chiffres">{resultat.numero}</span> authentique
                </p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[14px]">
                <dt className="text-encre-secondaire">Émise le</dt>
                <dd className="text-encre">{formaterDate(resultat.dateEmission)}</dd>
                <dt className="text-encre-secondaire">Par</dt>
                <dd className="text-encre">
                  Dr {resultat.prescripteurNomComplet} ({resultat.etablissementNom})
                </dd>
                <dt className="text-encre-secondaire">Statut</dt>
                <dd className="font-semibold text-encre">
                  {resultat.statutAffiche === "valable"
                    ? `Valable jusqu'au ${formaterDate(resultat.dateValidite!)}`
                    : LIBELLES_STATUT[resultat.statutAffiche]}
                </dd>
              </dl>
              <p className="text-[12px] text-encre-attenuee">
                Aucune information sur le patient ou les médicaments prescrits n&apos;est communiquée sur cette page
                publique.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
