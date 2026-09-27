import { describe, expect, it } from "vitest";
import {
  MAX_DEPLACEMENTS,
  MESSAGE_TROP_LOIN,
  MESSAGE_TROP_PROCHE,
  annulationPatientPossible,
  bornesJourLocalBenin,
  dateExpirationDemande,
  demandeExpiree,
  deplacementPossible,
  messageAnnulationTardive,
  verifierFenetreReservation,
} from "./regles-rendez-vous";

const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");
const dans = (ms: number) => new Date(MAINTENANT.getTime() + ms);
const HEURE = 3600_000;
const JOUR = 24 * HEURE;

describe("RG-RDV-01 : fenetre de reservation", () => {
  it("refuse le passe, le present et moins d'1 heure", () => {
    expect(verifierFenetreReservation(dans(-1000), MAINTENANT)).toContain("futur");
    expect(verifierFenetreReservation(MAINTENANT, MAINTENANT)).toContain("futur");
    expect(verifierFenetreReservation(dans(HEURE - 1), MAINTENANT)).toBe(MESSAGE_TROP_PROCHE);
  });

  it("accepte des 1 heure exactement, jusqu'a 30 jours exactement", () => {
    expect(verifierFenetreReservation(dans(HEURE), MAINTENANT)).toBeNull();
    expect(verifierFenetreReservation(dans(30 * JOUR), MAINTENANT)).toBeNull();
  });

  it("refuse au-dela de 30 jours", () => {
    expect(verifierFenetreReservation(dans(30 * JOUR + 1), MAINTENANT)).toBe(MESSAGE_TROP_LOIN);
  });

  it("guichet : aucun delai minimum, horizon de 90 jours", () => {
    expect(verifierFenetreReservation(dans(60_000), MAINTENANT, true)).toBeNull();
    expect(verifierFenetreReservation(dans(90 * JOUR), MAINTENANT, true)).toBeNull();
    expect(verifierFenetreReservation(dans(90 * JOUR + 1), MAINTENANT, true)).toContain("90 jours");
    expect(verifierFenetreReservation(dans(-1), MAINTENANT, true)).toContain("futur");
  });
});

describe("RG-RDV-10 : annulation par le patient", () => {
  it("possible jusqu'a 2 heures avant, plus apres", () => {
    expect(annulationPatientPossible(dans(2 * HEURE), MAINTENANT)).toBe(true);
    expect(annulationPatientPossible(dans(2 * HEURE - 1), MAINTENANT)).toBe(false);
    expect(annulationPatientPossible(dans(-HEURE), MAINTENANT)).toBe(false);
  });

  it("le message donne le telephone de l'etablissement quand il existe", () => {
    expect(messageAnnulationTardive("+229 21 30 00 00")).toContain("+229 21 30 00 00");
    expect(messageAnnulationTardive(null)).toContain("Appelez l'établissement.");
  });
});

describe("RG-RDV-11 : deplacements", () => {
  it("deux deplacements au plus", () => {
    expect(MAX_DEPLACEMENTS).toBe(2);
    expect(deplacementPossible(0)).toBe(true);
    expect(deplacementPossible(1)).toBe(true);
    expect(deplacementPossible(2)).toBe(false);
  });
});

describe("RG-RDV-20 : expiration d'une demande", () => {
  it("expire 24 heures apres la creation quand le rendez-vous est lointain", () => {
    const creation = MAINTENANT;
    const rendezVous = dans(10 * JOUR);
    expect(dateExpirationDemande(creation, rendezVous).getTime()).toBe(creation.getTime() + JOUR);
    expect(demandeExpiree(creation, rendezVous, dans(JOUR - 1))).toBe(false);
    expect(demandeExpiree(creation, rendezVous, dans(JOUR))).toBe(true);
  });

  it("expire 1 heure avant le creneau quand celui-ci arrive avant les 24 heures", () => {
    const creation = MAINTENANT;
    const rendezVous = dans(5 * HEURE);
    expect(dateExpirationDemande(creation, rendezVous).getTime()).toBe(rendezVous.getTime() - HEURE);
    expect(demandeExpiree(creation, rendezVous, dans(4 * HEURE - 1))).toBe(false);
    expect(demandeExpiree(creation, rendezVous, dans(4 * HEURE))).toBe(true);
  });
});

describe("jour civil local de Porto-Novo", () => {
  it("un instant tard le soir UTC appartient deja au jour suivant a Porto-Novo", () => {
    // 23:30 UTC le 26 = 00:30 le 27 a Porto-Novo.
    const { debut, fin } = bornesJourLocalBenin(new Date("2026-09-26T23:30:00.000Z"));
    expect(debut.toISOString()).toBe("2026-09-26T23:00:00.000Z");
    expect(fin.toISOString()).toBe("2026-09-27T23:00:00.000Z");
  });

  it("deux instants du meme jour local ont les memes bornes, pas le lendemain local", () => {
    const a = bornesJourLocalBenin(new Date("2026-09-26T08:00:00.000Z"));
    const b = bornesJourLocalBenin(new Date("2026-09-26T21:00:00.000Z"));
    const lendemain = bornesJourLocalBenin(new Date("2026-09-26T23:00:00.000Z"));
    expect(a).toEqual(b);
    expect(lendemain.debut.getTime()).toBe(a.fin.getTime());
  });
});
