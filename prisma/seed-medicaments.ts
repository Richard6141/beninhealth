import { PrismaClient } from "@prisma/client";
import { MEDICAMENTS_DEPART, memePresentation } from "../src/modules/administration/medicaments-depart";

// Catalogue de depart des medicaments (F-PRE-03, section 18.4 du pack), voir
// src/modules/administration/medicaments-depart.ts pour son contenu et sa
// reserve de validation. IDEMPOTENT : rejouable sur une base deja alimentee
// (npm run db:seed:medicaments), appele aussi par prisma/seed.ts.
//
// - Une presentation absente (DCI, dosage, forme) est creee.
// - Une presentation deja presente n'est JAMAIS ecrasee : seuls ses champs de
//   recherche encore vides (code ATC, noms commerciaux, essentiel) sont
//   completes, pour que les medicaments de demonstration deja utilises par des
//   ordonnances rejoignent la recherche sans doublon.
// - Une modification faite depuis l'ecran d'administration est donc conservee.

export async function seedMedicamentsDepart(prisma: PrismaClient): Promise<{ crees: number; completes: number }> {
  const existants = await prisma.medicament.findMany({
    select: { id: true, nom: true, principeActif: true, dosage: true, forme: true, codeAtc: true, nomsCommerciaux: true },
  });

  const aCreer: (typeof MEDICAMENTS_DEPART)[number][] = [];
  let completes = 0;

  for (const entree of MEDICAMENTS_DEPART) {
    const existant = existants.find((candidat) => memePresentation(candidat, entree));

    if (!existant) {
      aCreer.push(entree);
      continue;
    }

    const jamaisEnrichi = existant.codeAtc === "";
    const sansNomsCommerciaux = existant.nomsCommerciaux.length === 0 && entree.nomsCommerciaux.length > 0;

    if (jamaisEnrichi || sansNomsCommerciaux) {
      await prisma.medicament.update({
        where: { id: existant.id },
        data: {
          ...(jamaisEnrichi ? { codeAtc: entree.codeAtc, essentiel: entree.essentiel } : {}),
          ...(sansNomsCommerciaux ? { nomsCommerciaux: entree.nomsCommerciaux } : {}),
        },
      });
      completes += 1;
    }
  }

  if (aCreer.length > 0) {
    await prisma.medicament.createMany({
      data: aCreer.map((entree) => ({
        nom: entree.nom,
        principeActif: entree.principeActif,
        dosage: entree.dosage,
        forme: entree.forme,
        classeTherapeutique: entree.classeTherapeutique,
        codeAtc: entree.codeAtc,
        essentiel: entree.essentiel,
        nomsCommerciaux: entree.nomsCommerciaux,
        ageMinimumMois: entree.ageMinimumMois,
        contreIndiqueGrossesse: entree.contreIndiqueGrossesse,
        informationsComplementaires: entree.informationsComplementaires,
        actif: true,
      })),
    });
  }

  console.log(`Catalogue de medicaments : ${aCreer.length} cree(s), ${completes} complete(s).`);
  return { crees: aCreer.length, completes };
}

// Lancement direct : npm run db:seed:medicaments (sans effet quand le module est importe par seed.ts).
if (process.argv[1] && /seed-medicaments\.[tj]s$/.test(process.argv[1])) {
  const prisma = new PrismaClient();

  seedMedicamentsDepart(prisma)
    .catch((erreur) => {
      console.error(erreur);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
