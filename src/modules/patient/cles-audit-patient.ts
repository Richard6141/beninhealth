import { prisma } from "@/lib/prisma";

/**
 * Cles `donneeConcernee` du journal d'audit qui se rapportent au dossier d'un
 * patient (RG-CIT-100, F-CIT-12 "Qui a consulte mon dossier").
 *
 * Le journal ne pointe pas toujours `patient:<id>` : chaque module ecrit la
 * cle de SON objet (une consultation, un document, une delivrance...). Une cle
 * absente de cette liste rend l'acces invisible pour le patient : toute
 * nouvelle cle qui designe une donnee de sante d'un patient doit etre ajoutee
 * ici et dans les libelles de src/app/app/patient/acces/ListeAccesDossier.tsx.
 */
export async function clesAuditDuPatient(patientId: string): Promise<string[]> {
  const parPatient = { where: { patientId }, select: { id: true } } as const;

  const [
    consultations,
    prescriptions,
    examens,
    suivis,
    documents,
    vaccinations,
    prisesEnCharge,
    references,
    delivrances,
  ] = await Promise.all([
    prisma.consultation.findMany(parPatient),
    prisma.prescription.findMany(parPatient),
    prisma.examenMedical.findMany(parPatient),
    prisma.suiviCommunautaire.findMany(parPatient),
    prisma.documentMedical.findMany(parPatient),
    prisma.vaccination.findMany(parPatient),
    prisma.priseEnChargeInfirmiere.findMany(parPatient),
    prisma.referencePatient.findMany(parPatient),
    prisma.delivrance.findMany({ where: { prescription: { patientId } }, select: { id: true } }),
  ]);

  return [
    `patient:${patientId}`,
    ...consultations.map((c) => `consultation:${c.id}`),
    ...prescriptions.map((p) => `prescription:${p.id}`),
    ...examens.map((e) => `examen_medical:${e.id}`),
    ...suivis.map((s) => `suivi_communautaire:${s.id}`),
    ...documents.map((d) => `document_medical:${d.id}`),
    ...vaccinations.map((v) => `vaccination:${v.id}`),
    ...prisesEnCharge.map((p) => `prise_en_charge_infirmiere:${p.id}`),
    ...references.map((r) => `reference_patient:${r.id}`),
    ...delivrances.map((d) => `delivrance:${d.id}`),
  ];
}
