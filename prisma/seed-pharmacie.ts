import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { formaterIdentifiant, CODES_IDENTIFIANT_PAR_ROLE, CODE_IDENTIFIANT_ETABLISSEMENT } from "../src/modules/identity/identifiants";

// Pharmacie et pharmacien de demonstration (aucun compte pharmacien n'existait
// dans le jeu de demonstration, donc la pharmacie ne pouvait pas etre montree).
// IDEMPOTENT : peut etre rejoue sur une base deja alimentee (npm run
// db:seed:pharmacie) comme appele par prisma/seed.ts sur une base neuve.
// Meme mot de passe de demo que les autres comptes fictifs de prisma/seed.ts.

export const EMAIL_PHARMACIEN_DEMO = "pharmacien.demo@benin-health.test";

async function premierIdentifiantLibre(
  code: string,
  depart: number,
  existe: (identifiant: string) => Promise<boolean>
): Promise<string> {
  for (let sequence = depart; sequence < depart + 1000; sequence++) {
    const identifiant = formaterIdentifiant(code, sequence);
    if (!(await existe(identifiant))) {
      return identifiant;
    }
  }

  throw new Error(`Aucun identifiant libre pour le code ${code}`);
}

export async function seedPharmacieDemo(prisma: PrismaClient, motDePasseHash: string): Promise<void> {
  const existant = await prisma.user.findUnique({ where: { email: EMAIL_PHARMACIEN_DEMO } });

  if (existant) {
    return;
  }

  // Meme commune et meme zone sanitaire que le centre de sante de demonstration.
  const voisin = await prisma.etablissementSanitaire.findFirst({
    where: { type: "centre_sante", communeId: { not: null } },
    orderBy: { identifiant: "asc" },
  });

  const identifiantPharmacie = await premierIdentifiantLibre(
    CODE_IDENTIFIANT_ETABLISSEMENT,
    (await prisma.etablissementSanitaire.count()) + 1,
    async (identifiant) => (await prisma.etablissementSanitaire.findUnique({ where: { identifiant } })) !== null
  );

  const pharmacie = await prisma.etablissementSanitaire.create({
    data: {
      identifiant: identifiantPharmacie,
      nom: "Pharmacie du Port",
      type: "pharmacie",
      localisation: "Cotonou, Ganhi",
      latitude: 6.3617,
      longitude: 2.4285,
      servicesDisponibles: JSON.stringify(["delivrance_ordonnances"]),
      capacite: 5,
      communeId: voisin?.communeId ?? null,
      zoneSanitaireId: voisin?.zoneSanitaireId ?? null,
      statut: "actif",
    },
  });

  const numeroProfessionnel = await premierIdentifiantLibre(
    CODES_IDENTIFIANT_PAR_ROLE.pharmacien,
    1,
    async (numero) => (await prisma.professionnelSante.findFirst({ where: { numeroProfessionnel: numero } })) !== null
  );

  await prisma.user.create({
    data: {
      nom: "Dossou",
      prenom: "Pascal",
      email: EMAIL_PHARMACIEN_DEMO,
      telephone: "+229 90 00 00 08",
      motDePasseHash,
      statut: "actif",
      roles: { create: [{ nom: "pharmacien" }] },
      professionnel: {
        create: {
          specialite: "Pharmacie d'officine",
          numeroProfessionnel,
          etablissementId: pharmacie.id,
          statutValidation: "valide",
          profession: "pharmacien",
          affiliations: {
            create: { etablissementId: pharmacie.id, roleNom: "pharmacien", statut: "active" },
          },
        },
      },
    },
  });

  console.log(`Pharmacie de demonstration creee : ${EMAIL_PHARMACIEN_DEMO}`);
}

// Lancement direct : npm run db:seed:pharmacie (n'a pas d'effet quand le module est importe par seed.ts).
if (process.argv[1] && /seed-pharmacie\.[tj]s$/.test(process.argv[1])) {
  const prisma = new PrismaClient();

  bcrypt
    .hash("Demo1234!", 12)
    .then((hash) => seedPharmacieDemo(prisma, hash))
    .catch((erreur) => {
      console.error(erreur);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
