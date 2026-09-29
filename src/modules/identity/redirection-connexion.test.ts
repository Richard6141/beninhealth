import { describe, expect, it } from "vitest";
import { cheminRedirectionValide } from "@/modules/identity/redirection-connexion";

/**
 * F-ETA-02 : validation du parametre `next` de /connexion (redirection
 * post-connexion vers "Prendre rendez-vous" depuis la fiche publique d'un
 * etablissement). Couvre le cas valide, l'open redirect classique et
 * l'absence du parametre, comme demande pour cette fiche.
 */
describe("cheminRedirectionValide", () => {
  it("accepte un chemin interne attendu, avec sa requete", () => {
    expect(cheminRedirectionValide("/app/patient/rendez-vous?etablissementId=abc123")).toBe(
      "/app/patient/rendez-vous?etablissementId=abc123"
    );
  });

  it("accepte le chemin exact sans requete", () => {
    expect(cheminRedirectionValide("/app/patient/rendez-vous")).toBe("/app/patient/rendez-vous");
  });

  it("refuse une URL absolue vers un autre domaine (open redirect)", () => {
    expect(cheminRedirectionValide("https://site-pirate.example/app/patient/rendez-vous")).toBeNull();
    expect(cheminRedirectionValide("http://site-pirate.example")).toBeNull();
  });

  it("refuse une URL protocol relative (//... resolue vers un autre domaine)", () => {
    expect(cheminRedirectionValide("//site-pirate.example/app/patient/rendez-vous")).toBeNull();
  });

  it("refuse un schema non http, comme javascript:", () => {
    expect(cheminRedirectionValide("javascript:alert(1)")).toBeNull();
  });

  it("refuse un chemin qui contourne les controles via un antislash", () => {
    expect(cheminRedirectionValide("/\\site-pirate.example")).toBeNull();
  });

  it("refuse un chemin interne hors de la liste autorisee", () => {
    expect(cheminRedirectionValide("/app/ministere")).toBeNull();
  });

  it("refuse une route voisine qui ne fait que commencer pareil", () => {
    expect(cheminRedirectionValide("/app/patient/rendez-vous-autre-chose")).toBeNull();
  });

  it("refuse une valeur absente ou vide", () => {
    expect(cheminRedirectionValide(undefined)).toBeNull();
    expect(cheminRedirectionValide(null)).toBeNull();
    expect(cheminRedirectionValide("")).toBeNull();
  });

  it("refuse un type inattendu (ex. un File deposé dans le meme champ de formulaire)", () => {
    expect(cheminRedirectionValide(new Blob(["x"]))).toBeNull();
  });
});
