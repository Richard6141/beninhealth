import { describe, expect, it } from "vitest";
import { executerJeuEvaluation, JEU_EVALUATION } from "@/modules/ai/jeu-evaluation";
import { creerFournisseurFactice, FournisseurReglesLocales } from "@/modules/ai/provider";

/**
 * Jeu d'evaluation de l'IA (F-IA-05, RG-IA-20) : rejoue les 20 dossiers
 * fictifs avec le fournisseur actuel. Un changement de fournisseur ou de
 * consigne qui fait echouer ce test ne doit pas etre deploye.
 */
describe("jeu d'evaluation de 20 dossiers fictifs (F-IA-05)", () => {
  it("contient 20 dossiers a identites distinctes", () => {
    expect(JEU_EVALUATION).toHaveLength(20);
    expect(new Set(JEU_EVALUATION.map((dossier) => dossier.identite.identifiantSante)).size).toBe(20);
    expect(new Set(JEU_EVALUATION.map((dossier) => dossier.identite.nom)).size).toBe(20);
  });

  it("le fournisseur actuel (regles locales) passe les 20 dossiers : CA-1, CA-2, CA-3, faits attendus, 8 puces au plus", async () => {
    const resultat = await executerJeuEvaluation(FournisseurReglesLocales);

    expect(resultat.echecs).toEqual([]);
    expect(resultat.conformes).toBe(20);
    expect(resultat.total).toBe(20);
  });

  it("le jeu est deterministe : deux rejeux donnent le meme resultat", async () => {
    expect(await executerJeuEvaluation(FournisseurReglesLocales)).toEqual(await executerJeuEvaluation(FournisseurReglesLocales));
  });

  it("RG-IA-20 : un fournisseur qui invente une affirmation sans source fait echouer le jeu", async () => {
    const menteur = creerFournisseurFactice("- Le patient présente un diabète sévère\n- Le patient a une allergie inconnue [S1]\n- Autre puce sans source");

    const resultat = await executerJeuEvaluation(menteur);

    expect(resultat.conformes).toBeLessThan(20);
    expect(resultat.echecs.length).toBeGreaterThan(0);
  });

  it("RG-IA-20 : un fournisseur qui recopie une donnee sensible ou une identite dans sa reponse fait echouer le jeu", async () => {
    const fuyard = {
      nom: "fuyard",
      generate: async ({ input }: { input: string }) => ({
        texte: input
          .split("\n")
          .filter((ligne) => ligne.startsWith("[S"))
          .map((ligne) => `- ${ligne.replace(/^\[(S\d+)\]\s+[^:]+:\s*/, "")} [${ligne.slice(1, ligne.indexOf("]"))}]`)
          .concat(["- Kossi Agbodjan est suivi [S1]"])
          .join("\n"),
        modele: "fuyard-v1",
      }),
    };

    const resultat = await executerJeuEvaluation(fuyard);

    expect(resultat.echecs.some((echec) => echec.regle === "CA-3" || echec.regle === "CA-1")).toBe(true);
  });

  it("les elements sensibles du jeu (VIH, sante mentale, IVG, violences, addictions) n'atteignent jamais le modele", async () => {
    let entrees = "";
    const espion = {
      nom: "espion",
      generate: async ({ input }: { input: string }) => {
        entrees += `${input}\n`;
        return FournisseurReglesLocales.generate({ system: "", input, maxTokens: 100 });
      },
    };

    await executerJeuEvaluation(espion);

    expect(entrees.toLowerCase()).not.toMatch(/vih|depress|dépress|anxi|interruption|violence|coups et blessures|alcool|addiction/);
  });

  it("aucun texte envoye au modele ne contient un nom, un telephone, un identifiant sante ni un NPI du jeu (CA-2)", async () => {
    let entrees = "";
    const espion = {
      nom: "espion",
      generate: async ({ input }: { input: string }) => {
        entrees += `${input}\n`;
        return { texte: "", modele: "espion" };
      },
    };

    await executerJeuEvaluation(espion);

    for (const dossier of JEU_EVALUATION) {
      for (const interdit of dossier.interdits.filter((valeur) => !["VIH", "Sérologie", "dépression", "depression", "anxiété", "interruption", "violences", "coups et blessures", "alcool", "addiction", "bilan ancien"].includes(valeur))) {
        expect(entrees).not.toContain(interdit);
      }
    }
  });
});
