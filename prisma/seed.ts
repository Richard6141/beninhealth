import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { formaterIdentifiant, CODES_IDENTIFIANT_PAR_ROLE, CODE_IDENTIFIANT_ETABLISSEMENT } from "../src/modules/identity/identifiants";
import { seedTerritoire, zoneSanitairePlaceholder } from "../src/modules/pilotage/referentiel-territoire";

// Jeu de donnees de demonstration, contexte beninois, pour le scenario du
// cahier des charges (Partie 9) : citoyen cree son espace, prend rendez-vous,
// medecin consulte et prescrit, ministere consulte les donnees agregees.
// Mot de passe identique pour tous les comptes de demo : uniquement pour
// faciliter les tests locaux, jamais une pratique a reprendre en production.
const MOT_DE_PASSE_DEMO = "Demo1234!";

const prisma = new PrismaClient();

async function main() {
  const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 12);

  // F-PIL-07 du pack : referentiel territoire (departements/communes reels),
  // prealable a la dimension territoire des indicateurs de pilotage.
  const territoire = await seedTerritoire(prisma);
  const communeCotonouId = territoire.communeIdParNom.get("LIT/Cotonou")!;
  const communeParakouId = territoire.communeIdParNom.get("BOR/Parakou")!;
  const departementLittoralId = territoire.departementIdParCode.get("LIT")!;
  const departementBorgouId = territoire.departementIdParCode.get("BOR")!;
  const zoneLittoral = await zoneSanitairePlaceholder(prisma, "LIT", departementLittoralId);
  const zoneBorgou = await zoneSanitairePlaceholder(prisma, "BOR", departementBorgouId);

  const centreCotonou = await prisma.etablissementSanitaire.create({
    data: {
      identifiant: formaterIdentifiant(CODE_IDENTIFIANT_ETABLISSEMENT, 1),
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
      communeId: communeCotonouId,
      zoneSanitaireId: zoneLittoral.id,
    },
  });

  const centreParakou = await prisma.etablissementSanitaire.create({
    data: {
      identifiant: formaterIdentifiant(CODE_IDENTIFIANT_ETABLISSEMENT, 2),
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
      communeId: communeParakouId,
      zoneSanitaireId: zoneBorgou.id,
    },
  });

  const laboCotonou = await prisma.etablissementSanitaire.create({
    data: {
      identifiant: formaterIdentifiant(CODE_IDENTIFIANT_ETABLISSEMENT, 3),
      nom: "Laboratoire National de Reference de Cotonou",
      type: "laboratoire",
      localisation: "Cotonou, Cadjehoun",
      latitude: 6.3576,
      longitude: 2.3912,
      servicesDisponibles: JSON.stringify([
        "analyse_sang",
        "test_paludisme",
        "imagerie",
      ]),
      capacite: 25,
      communeId: communeCotonouId,
      zoneSanitaireId: zoneLittoral.id,
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
          numeroProfessionnel: formaterIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.medecin, 1),
          etablissementId: centreCotonou.id,
          statutValidation: "valide",
          profession: "medecin",
          affiliations: {
            create: { etablissementId: centreCotonou.id, roleNom: "medecin", statut: "active" },
          },
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
          numeroProfessionnel: formaterIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.infirmier, 1),
          etablissementId: centreCotonou.id,
          statutValidation: "valide",
          profession: "infirmier",
          affiliations: {
            create: { etablissementId: centreCotonou.id, roleNom: "infirmier", statut: "active" },
          },
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      nom: "Tchibozo",
      prenom: "Noel",
      email: "communautaire.demo@benin-health.test",
      telephone: "+229 90 00 00 09",
      motDePasseHash,
      statut: "actif",
      roles: { create: [{ nom: "agent_communautaire" }] },
      professionnel: {
        create: {
          specialite: "Sante communautaire",
          numeroProfessionnel: formaterIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.agent_communautaire, 1),
          etablissementId: centreCotonou.id,
          statutValidation: "valide",
          profession: "agent_communautaire",
          affiliations: {
            create: { etablissementId: centreCotonou.id, roleNom: "agent_communautaire", statut: "active" },
          },
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      nom: "Sossou",
      prenom: "Elvire",
      email: "laboratoire.demo@benin-health.test",
      telephone: "+229 90 00 00 07",
      motDePasseHash,
      statut: "actif",
      roles: { create: [{ nom: "laboratoire" }] },
      professionnel: {
        create: {
          specialite: "Biologie medicale",
          numeroProfessionnel: formaterIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.laboratoire, 1),
          etablissementId: laboCotonou.id,
          statutValidation: "valide",
          profession: "laboratoire",
          affiliations: {
            create: { etablissementId: laboCotonou.id, roleNom: "laboratoire", statut: "active" },
          },
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
      // Rattache a un etablissement via ProfessionnelSante (specialite
      // "Administration"), meme mecanisme que les autres roles professionnels :
      // necessaire pour que le tableau de bord etablissement (Phase 6) sache
      // a quel etablissement rattacher les statistiques de ce compte.
      professionnel: {
        create: {
          specialite: "Administration",
          numeroProfessionnel: formaterIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.admin_etablissement, 1),
          etablissementId: centreCotonou.id,
          statutValidation: "valide",
          affiliations: {
            create: { etablissementId: centreCotonou.id, roleNom: "admin_etablissement", statut: "active" },
          },
        },
      },
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
          identifiantSante: formaterIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.patient, 1),
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

    const medecinProfil = await prisma.professionnelSante.findUniqueOrThrow({
      where: { userId: medecin.id },
    });

    const maintenant = new Date();
    const ilYA20Jours = new Date(maintenant);
    ilYA20Jours.setDate(ilYA20Jours.getDate() - 20);
    const dansQuelquesHeures = new Date(maintenant);
    dansQuelquesHeures.setHours(dansQuelquesHeures.getHours() + 4);
    const dansQuatreJours = new Date(maintenant);
    dansQuatreJours.setDate(dansQuatreJours.getDate() + 4);

    // Rendez-vous passe, deja transforme en consultation terminee.
    const rendezVousPasse = await prisma.rendezVous.create({
      data: {
        patientId: patientUser.patient.id,
        etablissementId: centreCotonou.id,
        professionnelId: medecinProfil.id,
        date: ilYA20Jours,
        motif: "Douleurs abdominales",
        statut: "termine",
      },
    });

    const consultationPassee = await prisma.consultation.create({
      data: {
        patientId: patientUser.patient.id,
        professionnelId: medecinProfil.id,
        etablissementId: centreCotonou.id,
        rendezVousId: rendezVousPasse.id,
        date: ilYA20Jours,
        motif: "Douleurs abdominales",
        symptomes: JSON.stringify(["Douleurs abdominales", "Fievre legere"]),
        temperatureCelsius: 37.8,
        tensionSystolique: 120,
        tensionDiastolique: 80,
        observations: "Suspicion de paludisme, test rapide propose.",
        conclusion: "Paludisme simple confirme, traitement prescrit.",
        statut: "terminee",
        // Consultation deja validee (donnee de demo historique) : renseigne
        // dateValidation comme le ferait enregistrerConsultationAction,
        // sinon la fenetre de 12 mois pour addendum/retrait (RG-CLI-70) la
        // rejetterait a tort faute de date de validation.
        dateValidation: ilYA20Jours,
      },
    });

    const arthemeterLumefantrine = await prisma.medicament.create({
      data: {
        nom: "Coartem",
        principeActif: "Arthemeter / Lumefantrine",
        dosage: "20 mg / 120 mg",
        forme: "comprime",
        classeTherapeutique: "antipaludiques",
        informationsComplementaires: "Antipaludique de premiere intention (paludisme simple).",
      },
    });

    const paracetamol = await prisma.medicament.create({
      data: {
        nom: "Doliprane",
        principeActif: "Paracetamol",
        dosage: "500 mg",
        forme: "comprime",
        classeTherapeutique: "antalgiques",
        informationsComplementaires: "Antalgique et antipyretique.",
      },
    });

    // Volontairement en conflit avec l'allergie "Penicilline" du patient de
    // demonstration (voir plus haut) : permet de verifier a l'ecran le
    // controle de securite F-PRE-02 / RG-PRE-10 (alerte bloquante par classe
    // therapeutique) sans donnees de demo supplementaires.
    await prisma.medicament.create({
      data: {
        nom: "Amodex",
        principeActif: "Amoxicilline",
        dosage: "500 mg",
        forme: "gelule",
        classeTherapeutique: "penicillines",
        informationsComplementaires: "Antibiotique a large spectre.",
      },
    });

    const prescriptionPassee = await prisma.prescription.create({
      data: {
        consultationId: consultationPassee.id,
        medecinPrescripteurId: medecinProfil.id,
        patientId: patientUser.patient.id,
        date: ilYA20Jours,
        statut: "validee",
        numero: "RX-2026-0001",
        empreinteContenu: "seed-demo",
        instructions: "Traitement a prendre avec de la nourriture. Bien s'hydrater.",
        lignes: {
          create: [
            {
              medicamentId: arthemeterLumefantrine.id,
              posologie: "2 comprimes matin et soir",
              quantite: 24,
              dureeTraitementJours: 3,
            },
            {
              medicamentId: paracetamol.id,
              posologie: "1 comprime toutes les 6 heures si douleur ou fievre",
              quantite: 12,
              dureeTraitementJours: 3,
            },
          ],
        },
      },
    });

    await prisma.evenementPrescription.create({
      data: {
        prescriptionId: prescriptionPassee.id,
        type: "creation",
        utilisateurId: medecin.id,
        commentaire: "Prescription initiale suite a la consultation.",
      },
    });

    // Rendez-vous confirme le jour meme, pour peupler "Patients du jour".
    await prisma.rendezVous.create({
      data: {
        patientId: patientUser.patient.id,
        etablissementId: centreCotonou.id,
        professionnelId: medecinProfil.id,
        date: dansQuelquesHeures,
        motif: "Suivi de traitement",
        statut: "confirme",
      },
    });

    // Demande de rendez-vous en attente de confirmation.
    await prisma.rendezVous.create({
      data: {
        patientId: patientUser.patient.id,
        etablissementId: centreCotonou.id,
        professionnelId: medecinProfil.id,
        date: dansQuatreJours,
        motif: "Renouvellement ordonnance",
        statut: "demande",
      },
    });
  }

  console.log("Jeu de donnees de demonstration cree.");
  console.log(`Mot de passe pour tous les comptes de demo : ${MOT_DE_PASSE_DEMO}`);
  console.log("- medecin.demo@benin-health.test (medecin)");
  console.log("- infirmier.demo@benin-health.test (infirmier)");
  console.log("- communautaire.demo@benin-health.test (agent_communautaire)");
  console.log("- laboratoire.demo@benin-health.test (laboratoire)");
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
