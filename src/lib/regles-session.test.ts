import { describe, expect, it } from "vitest";
import { reglesDeSession, sessionExpiree } from "@/lib/regles-session";

const HEURE = 3600;
const JOUR = 24 * HEURE;

describe("reglesDeSession (section 23.3)", () => {
  it("patient : 30 jours, aucune inactivite serveur, cookie persistant", () => {
    expect(reglesDeSession(["patient"], false)).toEqual({ dureeMaxSecondes: 30 * JOUR, inactiviteMaxSecondes: null, cookiePersistant: true });
  });

  it.each(["medecin", "infirmier", "agent_communautaire", "pharmacien", "laboratoire"] as const)(
    "professionnel de soins (%s) : 12 heures, pas de limite d'inactivite serveur",
    (role) => {
      expect(reglesDeSession([role], false)).toEqual({ dureeMaxSecondes: 12 * HEURE, inactiviteMaxSecondes: null, cookiePersistant: true });
    }
  );

  it("administrateur d'etablissement : 12 heures et 15 minutes d'inactivite", () => {
    expect(reglesDeSession(["admin_etablissement"], false)).toEqual({ dureeMaxSecondes: 12 * HEURE, inactiviteMaxSecondes: 15 * 60, cookiePersistant: true });
  });

  it("administrateur national : 8 heures et 15 minutes d'inactivite", () => {
    expect(reglesDeSession(["admin_national"], false)).toEqual({ dureeMaxSecondes: 8 * HEURE, inactiviteMaxSecondes: 15 * 60, cookiePersistant: true });
  });

  it("appareil partage : cookie de session et 30 minutes d'inactivite, meme pour un patient", () => {
    expect(reglesDeSession(["patient"], true)).toEqual({ dureeMaxSecondes: 30 * JOUR, inactiviteMaxSecondes: 30 * 60, cookiePersistant: false });
  });

  it("appareil partage et administrateur : la limite la plus stricte l'emporte (15 minutes)", () => {
    expect(reglesDeSession(["admin_national"], true).inactiviteMaxSecondes).toBe(15 * 60);
  });

  it("un compte a plusieurs roles suit le role le plus strict", () => {
    expect(reglesDeSession(["patient", "medecin"], false).dureeMaxSecondes).toBe(12 * HEURE);
    expect(reglesDeSession(["medecin", "admin_national"], false)).toMatchObject({ dureeMaxSecondes: 8 * HEURE, inactiviteMaxSecondes: 15 * 60 });
  });

  it("sans role connu : traite comme un patient (jamais plus laxiste que le pire cas connu)", () => {
    expect(reglesDeSession([], false).dureeMaxSecondes).toBe(30 * JOUR);
  });
});

describe("sessionExpiree", () => {
  const maintenant = new Date("2026-09-27T12:00:00Z");
  const avant = (secondes: number) => new Date(maintenant.getTime() - secondes * 1000);

  it("expire au-dela de la duree maximale, meme si la session est active", () => {
    expect(sessionExpiree({ creeeLe: avant(12 * HEURE + 1), derniereActivite: avant(1), roles: ["medecin"], appareilPartage: false }, maintenant)).toBe(true);
    expect(sessionExpiree({ creeeLe: avant(12 * HEURE - 60), derniereActivite: avant(1), roles: ["medecin"], appareilPartage: false }, maintenant)).toBe(false);
  });

  it("un administrateur inactif plus de 15 minutes est deconnecte", () => {
    expect(sessionExpiree({ creeeLe: avant(3600), derniereActivite: avant(15 * 60 + 1), roles: ["admin_national"], appareilPartage: false }, maintenant)).toBe(true);
    expect(sessionExpiree({ creeeLe: avant(3600), derniereActivite: avant(14 * 60), roles: ["admin_national"], appareilPartage: false }, maintenant)).toBe(false);
  });

  it("un medecin peut rester inactif (le verrou d'ecran est cote navigateur)", () => {
    expect(sessionExpiree({ creeeLe: avant(3600), derniereActivite: avant(3000), roles: ["medecin"], appareilPartage: false }, maintenant)).toBe(false);
  });

  it("appareil partage : 30 minutes d'inactivite", () => {
    expect(sessionExpiree({ creeeLe: avant(3600), derniereActivite: avant(31 * 60), roles: ["patient"], appareilPartage: true }, maintenant)).toBe(true);
    expect(sessionExpiree({ creeeLe: avant(3600), derniereActivite: avant(29 * 60), roles: ["patient"], appareilPartage: true }, maintenant)).toBe(false);
  });
});
