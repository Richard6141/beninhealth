import { describe, expect, it } from "vitest";
import { lienItineraire } from "./itineraire";

describe("lienItineraire (F-CIT-02, meme patron que F-ETA-02)", () => {
  it("construit un lien d'itineraire Google Maps vers les coordonnees de l'etablissement", () => {
    expect(lienItineraire(6.3703, 2.3912)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=6.3703,2.3912"
    );
  });

  it("accepte des coordonnees negatives valides", () => {
    expect(lienItineraire(-4.5, -12.25)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-4.5,-12.25"
    );
  });

  it("ne transmet que la destination, jamais de point de depart ni d'autre donnee", () => {
    const url = new URL(lienItineraire(9.3, 2.6) as string);
    expect([...url.searchParams.keys()].sort()).toEqual(["api", "destination"]);
  });

  it.each([
    ["latitude absente", null, 2.4],
    ["longitude absente", 6.4, null],
    ["latitude indefinie", undefined, 2.4],
    ["latitude hors bornes", 91, 2.4],
    ["longitude hors bornes", 6.4, 181],
    ["latitude non finie", Number.NaN, 2.4],
    ["longitude infinie", 6.4, Number.POSITIVE_INFINITY],
    ["point (0, 0), saisie manquante typique", 0, 0],
  ])("renvoie null pour %s", (_cas, latitude, longitude) => {
    expect(lienItineraire(latitude, longitude)).toBeNull();
  });
});
