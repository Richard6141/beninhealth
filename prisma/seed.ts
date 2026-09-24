import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Jeu de donnees de demonstration, contexte beninois, pour le scenario du
// cahier des charges (Partie 9) : citoyen cree son espace, prend rendez-vous,
// medecin consulte et prescrit, ministere consulte les donnees agregees.
// Mot de passe identique pour tous les comptes de demo : uniquement pour
// faciliter les tests locaux, jamais une pratique a reprendre en production.
const MOT_DE_PASSE_DEMO = "Demo1234!";

const prisma = new PrismaClient();

async function main() {
  const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 12);

  const centreCotonou = await prisma.etablissementSanitaire.create({
    data: {
      nom: "Centre de Sante Akpakpa",
      type: "centre_sante",
      localisation: "Cotonou, Akpakpa",
      latitude: 6.3654,
      longitude: 2.4183,
      servicesDisponibles: JSON.stringify([
        "consultation_generale",
        "vaccination",
        "sante_maternelle",
      ]),
      capacite: 40,
    },
  });

  const centreParakou = await prisma.etablissementSanitaire.create({
    data: {
      nom: "Hopital de Zone de Parakou",
      type: "hopital",
      localisation: "Parakou",
      latitude: 9.3372,
      longitude: 2.6303,
      servicesDisponibles: JSON.stringify([
        "consultation_generale",
        "pediatrie",
        "chirurgie",
      ]),
      capacite: 120,
    },
  });

  const medecin = await prisma.user.create({
    data: {
      nom: "Ahouansou",
      prenom: "Julien",
      email: "medecin.demo@benin-health.test",
      telephone: "+229 90 00 00 01",
      motDePasseHash,
      statut: "actif",
      roles: { create: [{ nom: "medecin" }] },
      professionnel: {
        create: {
          specialite: "Medecine generale",
          numeroProfessionnel: "BJ-MED-0001",
          etablissementId: centreCotonou.id,
          statutValidation: "valide",
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      nom: "Dossou",
      prenom: "Fabienne",
      email: "infirmier.demo@benin-health.test",
      telephone: "+229 90 00 00 02",
      motDePasseHash,
      statut: "actif",
      roles: { create: [{ nom: "infirmier" }] },
      professionnel: {
        create: {
          specialite: "Soins generaux",
          numeroProfessionnel: "BJ-INF-0001",
          etablissementId: centreCotonou.id,
          statutValidation: "valide",
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      nom: "Houngbo",
      prenom: "Serge",
      email: "admin.etablissement.demo@benin-health.test",
      telephone: "+229 90 00 00 03",
      motDePasseHash,
      statut: "actif",
      roles: { create: [{ nom: "admin_etablissement" }] },
    },
  });

  await prisma.user.create({
    data: {
      nom: "Zinsou",
      prenom: "Carelle",
      email: "ministere.demo@benin-health.test",
      telephone: "+229 90 00 00 04",
      motDePasseHash,
      statut: "actif",
      roles: { create: [{ nom: "admin_national" }] },
    },
  });

  const patientUser = await prisma.user.create({
    data: {
      nom: "Agossou",
      prenom: "Beatrice",
      email: "patient.demo@benin-health.test",
      telephone: "+229 90 00 00 05",
      motDePasseHash,
      statut: "actif",
      roles: { create: [{ nom: "patient" }] },
      patient: {
        create: {
          identifiantSante: "BJ-SANTE-0001",
          dateNaissance: new Date("1994-03-12"),
          sexe: "F",
          groupeSanguin: "O+",
          contactsUrgence: JSON.stringify([
            {
              nom: "Agossou Marcel",
              telephone: "+229 90 00 00 06",
              lienParente: "Pere",
            },
          ]),
          allergies: JSON.stringify(["Penicilline", "Arachide"]),
          antecedents: JSON.stringify(["Paludisme (2022)", "Appendicectomie (2015)"]),
          maladiesChroniques: JSON.stringify(["Asthme leger"]),
        },
      },
    },
    include: { patient: true },
  });

  if (patientUser.patient) {
    await prisma.consentement.create({
      data: {
        patientId: patientUser.patient.id,
        acteurAutoriseId: medecin.id,
        typeAcces: "dossier_complet",
        statut: "actif",
      },
    });
  }

  console.log("Jeu de donnees de demonstration cree.");
  console.log(`Mot de passe pour tous les comptes de demo : ${MOT_DE_PASSE_DEMO}`);
  console.log("- medecin.demo@benin-health.test (medecin)");
  console.log("- infirmier.demo@benin-health.test (infirmier)");
  console.log("- admin.etablissement.demo@benin-health.test (admin_etablissement)");
  console.log("- ministere.demo@benin-health.test (admin_national)");
  console.log("- patient.demo@benin-health.test (patient)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
