/**
 * Route de telechargement de la copie de mes donnees au format PDF lisible
 * (F-CIT-13 du pack). Meme garde d'acces que la route JSON soeur
 * (src/app/api/patient/export/json/route.ts) : re-authentification deja
 * faite cote /app/patient/droits, cette route re-verifie uniquement la
 * session et le role.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { collecterMesDonneesPersonnelles } from "@/modules/patient/droits-donnees";

function adresseTechniqueDepuisRequete(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "inconnue";
}

const LARGEUR_PAGE = 595; // A4 portrait, points
const HAUTEUR_PAGE = 842;
const MARGE = 50;

/** Tronque une ligne trop longue pour la largeur utile de la page (pas de retour a la ligne automatique dans ce generateur simple). */
function tronquer(texte: string, maxCaracteres: number): string {
  return texte.length > maxCaracteres ? `${texte.slice(0, maxCaracteres - 1)}…` : texte;
}

function formaterDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("fr-FR");
  } catch {
    return iso;
  }
}

export async function GET(request: Request) {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const donnees = await collecterMesDonneesPersonnelles();

  if (!donnees) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const document = await PDFDocument.create();
  const policeNormale = await document.embedFont(StandardFonts.Helvetica);
  const policeGrasse = await document.embedFont(StandardFonts.HelveticaBold);

  let page = document.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
  let y = HAUTEUR_PAGE - MARGE;

  function nouvellePageSiNecessaire(hauteurRestanteRequise: number) {
    if (y - hauteurRestanteRequise < MARGE) {
      page = document.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
      y = HAUTEUR_PAGE - MARGE;
    }
  }

  function ecrireTitre(texte: string) {
    nouvellePageSiNecessaire(30);
    page.drawText(texte, { x: MARGE, y, size: 16, font: policeGrasse, color: rgb(0.03, 0.22, 0.39) });
    y -= 24;
  }

  function ecrireSousTitre(texte: string) {
    nouvellePageSiNecessaire(24);
    y -= 6;
    page.drawText(texte, { x: MARGE, y, size: 12, font: policeGrasse, color: rgb(0.03, 0.22, 0.39) });
    y -= 16;
  }

  function ecrireLigne(texte: string) {
    nouvellePageSiNecessaire(14);
    page.drawText(tronquer(texte, 100), { x: MARGE, y, size: 10, font: policeNormale, color: rgb(0.1, 0.1, 0.1) });
    y -= 14;
  }

  function ecrireLigneVide() {
    y -= 8;
  }

  ecrireTitre("Copie de mes données personnelles");
  ecrireLigne(`Générée le ${new Date(donnees.genereLe).toLocaleString("fr-FR")}`);
  ecrireLigne(
    "Ce document reprend l'ensemble des données associées à votre compte sur la Plateforme d'Intelligence Sanitaire du Bénin (F-CIT-13)."
  );
  ecrireLigneVide();

  ecrireSousTitre("Identité");
  if (donnees.profil) {
    ecrireLigne(`Nom complet : ${donnees.profil.prenom} ${donnees.profil.nom}`);
    ecrireLigne(`E-mail : ${donnees.profil.email}`);
    ecrireLigne(`Téléphone : ${donnees.profil.telephone}`);
    if (donnees.profil.identifiant) ecrireLigne(`Identifiant santé : ${donnees.profil.identifiant}`);
  } else {
    ecrireLigne("Profil non disponible.");
  }
  ecrireLigneVide();

  ecrireSousTitre("Dossier santé");
  if (donnees.dossier) {
    ecrireLigne(`Né(e) le ${formaterDate(donnees.dossier.dateNaissance)} · Sexe : ${donnees.dossier.sexe}`);
    ecrireLigne(`Groupe sanguin : ${donnees.dossier.groupeSanguin || "inconnu"}`);
    ecrireLigne(`Allergies : ${donnees.dossier.allergies.join(", ") || "aucune déclarée"}`);
    ecrireLigne(`Antécédents : ${donnees.dossier.antecedents.join(", ") || "aucun déclaré"}`);
    ecrireLigne(`Maladies chroniques : ${donnees.dossier.maladiesChroniques.join(", ") || "aucune déclarée"}`);
    donnees.dossier.contactsUrgence.forEach((contact) =>
      ecrireLigne(`Contact d'urgence : ${contact.nom} (${contact.lienParente}) · ${contact.telephone}`)
    );
  } else {
    ecrireLigne("Aucun dossier associé à ce compte.");
  }
  ecrireLigneVide();

  ecrireSousTitre(`Autorisations d'accès (${donnees.consentements.length})`);
  if (donnees.consentements.length === 0) ecrireLigne("Aucune autorisation accordée.");
  donnees.consentements.forEach((c) =>
    ecrireLigne(`${c.acteurNomComplet} · ${c.typeAcces} · statut : ${c.statutEffectif}`)
  );
  ecrireLigneVide();

  ecrireSousTitre(`Rendez-vous (${donnees.rendezVous.length})`);
  if (donnees.rendezVous.length === 0) ecrireLigne("Aucun rendez-vous.");
  donnees.rendezVous.forEach((r) =>
    ecrireLigne(`${formaterDate(r.date)} · ${r.etablissementNom} · ${r.motif} · statut : ${r.statut}`)
  );
  ecrireLigneVide();

  ecrireSousTitre(`Consultations (${donnees.consultations.length})`);
  if (donnees.consultations.length === 0) ecrireLigne("Aucune consultation.");
  donnees.consultations.forEach((c) =>
    ecrireLigne(`${formaterDate(c.date)} · ${c.professionnelNomComplet} · ${c.motif}`)
  );
  ecrireLigneVide();

  ecrireSousTitre(`Prescriptions (${donnees.prescriptions.length})`);
  if (donnees.prescriptions.length === 0) ecrireLigne("Aucune prescription.");
  donnees.prescriptions.forEach((p) => {
    ecrireLigne(`Ordonnance ${p.numero} · ${formaterDate(p.date)}`);
    p.lignes.forEach((ligne) => ecrireLigne(`   - ${ligne.medicamentNom} · ${ligne.posologie}`));
  });
  ecrireLigneVide();

  ecrireSousTitre(`Examens de laboratoire (${donnees.examens.length})`);
  if (donnees.examens.length === 0) ecrireLigne("Aucun examen.");
  donnees.examens.forEach((e) =>
    ecrireLigne(`${formaterDate(e.date)} · ${e.typeExamen} · statut : ${e.statut}`)
  );
  ecrireLigneVide();

  ecrireSousTitre(`Vaccinations (${donnees.vaccinations.length})`);
  if (donnees.vaccinations.length === 0) ecrireLigne("Aucune vaccination enregistrée.");
  donnees.vaccinations.forEach((v) =>
    ecrireLigne(
      `${formaterDate(v.dateAdministration)} · ${v.vaccin} (dose ${v.numeroDose})${v.saisieParErreur ? " · retirée" : ""}`
    )
  );

  const octetsPdf = await document.save();

  await journaliser({
    utilisateurId: session.userId,
    action: "export_donnees_telecharge",
    donneeConcernee: `utilisateur:${session.userId}`,
    adresseTechnique: adresseTechniqueDepuisRequete(request),
    justification: "Copie des donnees personnelles telechargee au format PDF (F-CIT-13)",
  });

  return new NextResponse(new Uint8Array(octetsPdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="mes-donnees.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
