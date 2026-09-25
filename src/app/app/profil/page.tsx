import { redirect } from "next/navigation";
import { getMonProfil } from "@/modules/identity/actions";
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
  const profil = await getMonProfil();

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
