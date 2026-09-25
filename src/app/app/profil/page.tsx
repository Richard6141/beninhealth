import { redirect } from "next/navigation";
import { getMonProfil } from "@/modules/identity/actions";
import { getMonQrCode } from "@/modules/verification/actions";
import type { NomRole } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormulaireAvatar } from "./FormulaireAvatar";
import { FormulaireInformations } from "./FormulaireInformations";
import { FormulaireMotDePasse } from "./FormulaireMotDePasse";

/**
 * Repris de src/app/app/layout.tsx (non exporte depuis ce fichier) pour
 * rester coherent avec les badges de role affiches ailleurs sans y toucher.
 */
const libellesRole: Record<NomRole, string> = {
  patient: "Patient",
  medecin: "Médecin",
  infirmier: "Infirmier",
  agent_communautaire: "Agent communautaire",
  pharmacien: "Pharmacien",
  laboratoire: "Laboratoire",
  admin_etablissement: "Administrateur d'établissement",
  admin_national: "Administrateur national",
};

export default async function ProfilPage() {
  const [profil, qrCode] = await Promise.all([getMonProfil(), getMonQrCode()]);

  if (!profil) {
    redirect("/connexion");
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Mon compte
        </p>
        <h1 className="text-[28px] font-black text-encre">Mon profil</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Gérez vos informations personnelles, votre photo de profil et votre
          mot de passe.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {profil.roles.map((role) => (
            <Badge key={role} tone="accent">
              {libellesRole[role]}
            </Badge>
          ))}
        </div>
      </header>

      {qrCode ? (
        <Card
          title="Mon QR code"
          description="À présenter pour vérification : le contenu affiché après scan dépend du type de compte (dossier médical pour un patient si vous y avez consenti, badge professionnel pour un soignant)."
        >
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL genere localement, pas une image distante */}
            <img
              src={qrCode.dataUrl}
              alt="QR code de vérification de mon compte"
              width={180}
              height={180}
              className="rounded-champ border border-bordure"
            />
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-encre-secondaire">
                Ce code encode un lien vers votre fiche de vérification.
                Quiconque le scanne doit être connecté à la plateforme pour la
                consulter.
              </p>
              {profil.identifiant ? (
                <p className="text-[13px] text-encre-attenuee">
                  Identifiant : <span className="chiffres font-semibold text-encre">{profil.identifiant}</span>
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <Card
        title="Photo de profil"
        description="Visible dans le menu du compte, en haut de l'espace applicatif."
      >
        <FormulaireAvatar avatarUrl={profil.avatarUrl} />
      </Card>

      <Card
        title="Informations personnelles"
        description="Nom, prénom et téléphone affichés dans votre espace."
      >
        <FormulaireInformations profil={profil} />
      </Card>

      <Card title="Sécurité" description="Changez votre mot de passe régulièrement.">
        <FormulaireMotDePasse />
      </Card>
    </div>
  );
}
