import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invitationCompte: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/mail", () => ({ envoyerEmail: vi.fn() }));
vi.mock("@/lib/url-base", () => ({ urlDeBase: vi.fn(async () => "https://sante.exemple.bj") }));
vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => ({ NODE_ENV: process.env.NODE_ENV_TEST ?? "test", NEXTAUTH_SECRET: "secret-de-test-32-caracteres-minimum-xxxx" })),
}));

import { prisma } from "@/lib/prisma";
import { envoyerEmail } from "@/lib/mail";
import {
  DUREE_INVITATION_MS,
  consommerInvitation,
  emettreInvitation,
  empreinteJetonInvitation,
  envoyerInvitation,
  lireInvitation,
} from "@/modules/identity/invitations";

const p = prisma as unknown as { invitationCompte: { findUnique: Mock; updateMany: Mock; create: Mock } };
const envoyerEmailMock = envoyerEmail as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NODE_ENV_TEST;
  delete process.env.DEMO_CODE_ECRAN;
});

describe("emettreInvitation (RG-AUTH-40)", () => {
  it("cree une invitation de 7 jours, ne stocke que l'empreinte du jeton et annule les precedentes", async () => {
    const debut = Date.now();

    const { jeton, expireLe } = await emettreInvitation(prisma as never, { userId: "u-1", creeParId: "admin-1" });

    expect(jeton.length).toBeGreaterThanOrEqual(43);
    expect(expireLe.getTime() - debut).toBeGreaterThanOrEqual(DUREE_INVITATION_MS - 5000);
    expect(expireLe.getTime() - debut).toBeLessThanOrEqual(DUREE_INVITATION_MS + 5000);

    expect(p.invitationCompte.updateMany).toHaveBeenCalledWith({
      where: { userId: "u-1", utiliseLe: null, annuleeLe: null },
      data: { annuleeLe: expect.any(Date) },
    });
    const donnees = p.invitationCompte.create.mock.calls[0][0].data;
    expect(donnees.jetonHash).toBe(empreinteJetonInvitation(jeton));
    expect(donnees.jetonHash).not.toContain(jeton);
    expect(JSON.stringify(donnees)).not.toContain(jeton);
    expect(donnees.creeParId).toBe("admin-1");
  });

  it("annule d'abord, cree ensuite : une seule invitation reste utilisable", async () => {
    const ordre: string[] = [];
    p.invitationCompte.updateMany.mockImplementation(async () => ordre.push("annule"));
    p.invitationCompte.create.mockImplementation(async () => ordre.push("cree"));

    await emettreInvitation(prisma as never, { userId: "u-1", creeParId: null });

    expect(ordre).toEqual(["annule", "cree"]);
  });

  it("deux invitations successives ont des jetons differents", async () => {
    const a = await emettreInvitation(prisma as never, { userId: "u-1", creeParId: null });
    const b = await emettreInvitation(prisma as never, { userId: "u-1", creeParId: null });

    expect(a.jeton).not.toBe(b.jeton);
  });
});

describe("lireInvitation", () => {
  const jeton = "a".repeat(43);

  function ligne(surcharges: Record<string, unknown> = {}) {
    return {
      id: "inv-1",
      expireLe: new Date(Date.now() + 3600 * 1000),
      utiliseLe: null,
      annuleeLe: null,
      user: {
        id: "u-1",
        nom: "Sossou",
        prenom: "Awa",
        statut: "invite",
        roles: [{ nom: "medecin" }],
        professionnel: { etablissement: { nom: "CHU de Cotonou" } },
      },
      ...surcharges,
    };
  }

  it("valide : renvoie le contexte a afficher", async () => {
    p.invitationCompte.findUnique.mockResolvedValue(ligne());

    expect(await lireInvitation(jeton)).toMatchObject({
      etat: "valide",
      invitationId: "inv-1",
      userId: "u-1",
      prenom: "Awa",
      role: "medecin",
      etablissementNom: "CHU de Cotonou",
    });
    expect(p.invitationCompte.findUnique.mock.calls[0][0].where).toEqual({ jetonHash: empreinteJetonInvitation(jeton) });
  });

  it.each([
    ["utilisee", { utiliseLe: new Date() }],
    ["annulee", { annuleeLe: new Date() }],
    ["expiree", { expireLe: new Date(Date.now() - 1000) }],
  ] as Array<[string, Record<string, unknown>]>)("etat %s", async (etat, surcharge) => {
    p.invitationCompte.findUnique.mockResolvedValue(ligne(surcharge));

    expect((await lireInvitation(jeton)).etat).toBe(etat);
  });

  it("un compte deja actif rend l'invitation inutilisable", async () => {
    p.invitationCompte.findUnique.mockResolvedValue(ligne({ user: { ...ligne().user, statut: "actif" } }));

    expect((await lireInvitation(jeton)).etat).toBe("utilisee");
  });

  it("jeton inconnu, trop court ou trop long : meme etat, aucune information", async () => {
    p.invitationCompte.findUnique.mockResolvedValue(null);

    expect(await lireInvitation(jeton)).toEqual({ etat: "inconnue" });
    expect(await lireInvitation("court")).toEqual({ etat: "inconnue" });
    expect(await lireInvitation("x".repeat(200))).toEqual({ etat: "inconnue" });
    expect(p.invitationCompte.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe("consommerInvitation", () => {
  it("mise a jour conditionnelle : vrai une seule fois", async () => {
    p.invitationCompte.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    expect(await consommerInvitation(prisma as never, "inv-1")).toBe(true);
    expect(await consommerInvitation(prisma as never, "inv-1")).toBe(false);

    const where = p.invitationCompte.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "inv-1", utiliseLe: null, annuleeLe: null });
    expect(where.expireLe.gt).toBeInstanceOf(Date);
  });
});

describe("envoyerInvitation", () => {
  const params = { email: "awa@exemple.bj", prenom: "Awa", etablissement: "CHU de Cotonou", role: "medecin", jeton: "jeton-secret_123" };

  it("envoie un e-mail avec le lien d'activation et echappe le HTML", async () => {
    await envoyerInvitation({ ...params, prenom: "<script>x</script>", etablissement: "A&B \"C\"" });

    const html = envoyerEmailMock.mock.calls[0][0].html as string;
    expect(html).toContain("https://sante.exemple.bj/activer?jeton=jeton-secret_123");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A&amp;B &quot;C&quot;");
    expect(envoyerEmailMock.mock.calls[0][0].to).toBe("awa@exemple.bj");
  });

  it("hors production : le lien est renvoye pour etre montre a la personne qui invite", async () => {
    const resultat = await envoyerInvitation(params);

    expect(resultat.lienAffichable).toBe("https://sante.exemple.bj/activer?jeton=jeton-secret_123");
  });

  it("hors production, un envoi impossible ne bloque pas (le lien reste affichable)", async () => {
    envoyerEmailMock.mockRejectedValueOnce(new Error("SMTP indisponible"));

    const resultat = await envoyerInvitation(params);

    expect(resultat.lienAffichable).not.toBeNull();
  });

  it("en production : le lien n'est jamais renvoye et un envoi impossible est une erreur", async () => {
    process.env.NODE_ENV_TEST = "production";

    expect((await envoyerInvitation(params)).lienAffichable).toBeNull();

    envoyerEmailMock.mockRejectedValueOnce(new Error("SMTP indisponible"));
    await expect(envoyerInvitation(params)).rejects.toThrow("SMTP indisponible");
  });

  it("en production, un compte de demonstration (serveur de demo) recoit quand meme le lien a l'ecran", async () => {
    process.env.NODE_ENV_TEST = "production";
    process.env.DEMO_CODE_ECRAN = "1";
    envoyerEmailMock.mockRejectedValueOnce(new Error("aucune boite"));

    const resultat = await envoyerInvitation({ ...params, email: "medecin@benin-health.test" });

    expect(resultat.lienAffichable).not.toBeNull();
  });
});
