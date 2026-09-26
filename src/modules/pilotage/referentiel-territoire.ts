import type { PrismaClient } from "@prisma/client";

/**
 * Referentiel geographique du Benin (12 departements, 77 communes reelles),
 * pour la dimension territoire des indicateurs de pilotage (F-PIL, chapitre
 * 14 du pack). Donnees administratives stables, correctes a la connaissance
 * de cette implementation.
 *
 * Limite assumee, documentee aussi dans prisma/schema.prisma : les zones
 * sanitaires (34 regroupements officiels de communes) ne sont PAS seedees
 * ici de facon exhaustive et precise (liste sensible a confirmer aupres du
 * ministere, contrairement aux departements/communes qui sont stables et
 * publics). Seule une zone "a affiner" par departement concerne par un
 * etablissement existant est creee, pour que le modele de donnees reste
 * complet sans pretendre a une precision qu'on n'a pas. A remplacer par la
 * liste officielle des 34 zones avant tout usage reel (meme limite deja
 * assumee pour les referentiels allergies/vaccins de ce depot).
 */

export interface DepartementReferentiel {
  code: string;
  nom: string;
  communes: string[];
}

export const DEPARTEMENTS_BENIN: DepartementReferentiel[] = [
  { code: "AL", nom: "Alibori", communes: ["Banikoara", "Gogounou", "Kandi", "Karimama", "Malanville", "Segbana"] },
  {
    code: "AT",
    nom: "Atacora",
    communes: [
      "Boukoumbe",
      "Cobly",
      "Kerou",
      "Kouande",
      "Materi",
      "Natitingou",
      "Pehunco",
      "Tanguieta",
      "Toucountouna",
    ],
  },
  {
    code: "ATL",
    nom: "Atlantique",
    communes: ["Abomey-Calavi", "Allada", "Kpomasse", "Ouidah", "So-Ava", "Toffo", "Tori-Bossito", "Ze"],
  },
  {
    code: "BOR",
    nom: "Borgou",
    communes: ["Bembereke", "Kalale", "N'Dali", "Nikki", "Parakou", "Perere", "Sinende", "Tchaourou"],
  },
  { code: "COL", nom: "Collines", communes: ["Bante", "Dassa-Zoume", "Glazoue", "Ouesse", "Savalou", "Save"] },
  { code: "COU", nom: "Couffo", communes: ["Aplahoue", "Djakotomey", "Dogbo", "Klouekanme", "Lalo", "Toviklin"] },
  { code: "DON", nom: "Donga", communes: ["Bassila", "Copargo", "Djougou", "Ouake"] },
  { code: "LIT", nom: "Littoral", communes: ["Cotonou"] },
  { code: "MON", nom: "Mono", communes: ["Athieme", "Bopa", "Come", "Grand-Popo", "Houeyogbe", "Lokossa"] },
  {
    code: "OUE",
    nom: "Oueme",
    communes: [
      "Adjarra",
      "Adjohoun",
      "Agueegues",
      "Akpro-Misserete",
      "Avrankou",
      "Bonou",
      "Dangbo",
      "Porto-Novo",
      "Seme-Kpodji",
    ],
  },
  { code: "PLA", nom: "Plateau", communes: ["Adja-Ouere", "Ifangni", "Ketou", "Pobe", "Sakete"] },
  {
    code: "ZOU",
    nom: "Zou",
    communes: ["Abomey", "Agbangnizoun", "Bohicon", "Cove", "Djidja", "Ouinhi", "Za-Kpota", "Zagnanado", "Zogbodomey"],
  },
];

export interface RepertoireTerritoire {
  departementIdParCode: Map<string, string>;
  communeIdParNom: Map<string, string>; // cle "Departement/Commune" pour eviter les collisions de nom
}

/**
 * Insere (ou reutilise si deja present) les 12 departements et 77 communes
 * du Benin. Idempotent : peut etre appele a chaque execution du seed sans
 * dupliquer les lignes (upsert sur le code departement / le couple
 * departement+nom pour une commune). Retourne un repertoire pour retrouver
 * facilement l'id d'une commune lors de la creation d'un etablissement.
 */
export async function seedTerritoire(prisma: PrismaClient): Promise<RepertoireTerritoire> {
  const departementIdParCode = new Map<string, string>();
  const communeIdParNom = new Map<string, string>();

  for (const departementRef of DEPARTEMENTS_BENIN) {
    const departement = await prisma.departement.upsert({
      where: { code: departementRef.code },
      create: { code: departementRef.code, nom: departementRef.nom },
      update: { nom: departementRef.nom },
    });
    departementIdParCode.set(departementRef.code, departement.id);

    for (const nomCommune of departementRef.communes) {
      const commune = await prisma.commune.upsert({
        where: { departementId_nom: { departementId: departement.id, nom: nomCommune } },
        create: { departementId: departement.id, nom: nomCommune },
        update: {},
      });
      communeIdParNom.set(`${departementRef.code}/${nomCommune}`, commune.id);
    }
  }

  return { departementIdParCode, communeIdParNom };
}

/**
 * Cree (si absente) une zone sanitaire "a affiner" pour un departement donne,
 * seule facon honnete de peupler EtablissementSanitaire.zoneSanitaireId sans
 * pretendre connaitre le decoupage officiel des 34 zones (voir la limite
 * documentee en tete de ce fichier).
 */
export async function zoneSanitairePlaceholder(prisma: PrismaClient, codeDepartement: string, departementId: string) {
  return prisma.zoneSanitaire.upsert({
    where: { code: `${codeDepartement}-A-AFFINER` },
    create: {
      code: `${codeDepartement}-A-AFFINER`,
      nom: `Zone sanitaire a affiner (${codeDepartement})`,
      departementId,
    },
    update: {},
  });
}
