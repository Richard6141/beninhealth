import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { SignJWT } from "jose";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

const magasinCookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => magasinCookies),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sessionActive: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn() },
    fonctionnaliteActivable: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { createSession, getSession, getSessionPourActivationMfa } from "@/lib/session";

const p = prisma as unknown as {
  sessionActive: { findUnique: Mock; update: Mock; create: Mock; delete: Mock };
  user: { findUnique: Mock };
  fonctionnaliteActivable: { findUnique: Mock };
};

async function jeton(charge: Record<string, unknown>): Promise<string> {
  return new SignJWT(charge)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET));
}

function sessionEnBase(statut: string, surcharges: Record<string, unknown> = {}, mfaActif = true) {
  return {
    id: "sess-1",
    userId: "u-1",
    derniereActivite: new Date(),
    dateCreation: new Date(),
    appareilPartage: false,
    user: { statut, mfaActif },
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.sessionActive.update.mockResolvedValue({});
});

describe("getSession : le JWT ne suffit jamais, l'etat du compte compte", () => {
  it("accepte une session valide d'un compte actif", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif"));

    expect(await getSession()).toEqual({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" });
  });

  it.each(["suspendu", "termine", "ferme", "fusionne", "sans_compte"])(
    "refuse immediatement une session dont le compte est %s, meme avec un JWT valide",
    async (statut) => {
      magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" }) });
      p.sessionActive.findUnique.mockResolvedValue(sessionEnBase(statut));

      expect(await getSession()).toBeNull();
    }
  );

  it("refuse une session fermee (ligne supprimee)", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
  });

  it("refuse une session dont la ligne appartient a un autre utilisateur que celui du JWT", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["admin_national"], sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif", { userId: "autre" }));
    expect(await getSession()).toBeNull();
  });

  it("un ancien JWT sans sessionId est aussi soumis a l'etat du compte", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["patient"] }) });

    p.user.findUnique.mockResolvedValue({ statut: "actif", mfaActif: false });
    expect(await getSession()).toEqual({ userId: "u-1", roles: ["patient"], sessionId: "" });

    p.user.findUnique.mockResolvedValue({ statut: "suspendu", mfaActif: false });
    expect(await getSession()).toBeNull();

    p.user.findUnique.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
  });

  it("refuse un cookie absent, un JWT mal signe, ou sans role valide", async () => {
    magasinCookies.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();

    magasinCookies.get.mockReturnValue({ value: "pas-un-jwt" });
    expect(await getSession()).toBeNull();

    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["pirate"], sessionId: "sess-1" }) });
    expect(await getSession()).toBeNull();
  });

  it("met a jour la derniere activite au plus toutes les minutes", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" }) });

    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif"));
    await getSession();
    expect(p.sessionActive.update).not.toHaveBeenCalled();

    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif", { derniereActivite: new Date(Date.now() - 2 * 60 * 1000) }));
    await getSession();
    expect(p.sessionActive.update).toHaveBeenCalledTimes(1);
  });
});

describe("second facteur obligatoire (F-AUTH-06, CA-1)", () => {
  async function ouvrirSession(roles: string[], mfaActif: boolean) {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles, sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif", {}, mfaActif));
  }

  it("un medecin sans second facteur, drapeau actif : getSession refuse, l'activation reste possible", async () => {
    await ouvrirSession(["medecin"], false);
    p.fonctionnaliteActivable.findUnique.mockResolvedValue({ actif: true });

    expect(await getSession()).toBeNull();
    expect(await getSessionPourActivationMfa()).toEqual({
      userId: "u-1",
      roles: ["medecin"],
      sessionId: "sess-1",
      activationMfaRequise: true,
    });
  });

  it("le meme medecin, drapeau inactif ou absent : session normale", async () => {
    await ouvrirSession(["medecin"], false);
    p.fonctionnaliteActivable.findUnique.mockResolvedValue({ actif: false });
    expect(await getSession()).toEqual({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" });

    p.fonctionnaliteActivable.findUnique.mockResolvedValue(null);
    expect(await getSession()).toEqual({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" });
  });

  it("un medecin avec second facteur actif : session normale, le drapeau n'est meme pas lu", async () => {
    await ouvrirSession(["medecin"], true);

    expect(await getSession()).not.toBeNull();
    expect(p.fonctionnaliteActivable.findUnique).not.toHaveBeenCalled();
  });

  it("un patient n'est jamais concerne, drapeau actif ou non", async () => {
    await ouvrirSession(["patient"], false);
    p.fonctionnaliteActivable.findUnique.mockResolvedValue({ actif: true });

    expect(await getSession()).toEqual({ userId: "u-1", roles: ["patient"], sessionId: "sess-1" });
    expect(p.fonctionnaliteActivable.findUnique).not.toHaveBeenCalled();
  });

  it("un compte patient et medecin est concerne (un role non patient suffit)", async () => {
    await ouvrirSession(["patient", "medecin"], false);
    p.fonctionnaliteActivable.findUnique.mockResolvedValue({ actif: true });

    expect(await getSession()).toBeNull();
  });

  it("un compte suspendu reste refuse par les deux lectures", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("suspendu", {}, false));

    expect(await getSession()).toBeNull();
    expect(await getSessionPourActivationMfa()).toBeNull();
  });
});

describe("espace actif (F-AUTH-07, RG-AUTH-60)", () => {
  async function ouvrir(roles: string[], espaceActif: string | null) {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles, sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif", { espaceActif }));
  }

  it("sans choix, tous les roles du compte s'appliquent comme avant", async () => {
    await ouvrir(["patient", "medecin"], null);
    expect((await getSession())?.roles).toEqual(["patient", "medecin"]);
  });

  it("un espace choisi en base devient le seul role de la session", async () => {
    await ouvrir(["patient", "medecin"], "medecin");
    expect((await getSession())?.roles).toEqual(["medecin"]);

    await ouvrir(["patient", "medecin"], "patient");
    expect((await getSession())?.roles).toEqual(["patient"]);
  });

  it("un espace que le jeton signe ne contient pas est ignore : jamais un role de plus qu'a la connexion", async () => {
    await ouvrir(["patient"], "admin_national");
    expect((await getSession())?.roles).toEqual(["patient"]);

    await ouvrir(["patient", "medecin"], "n_importe_quoi");
    expect((await getSession())?.roles).toEqual(["patient", "medecin"]);
  });

  it("le second facteur reste juge sur tous les roles du compte, pas sur l'espace choisi", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["patient", "medecin"], sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif", { espaceActif: "patient" }, false));
    p.fonctionnaliteActivable.findUnique.mockResolvedValue({ actif: true });

    expect(await getSession()).toBeNull();
  });
});

describe("duree de session et inactivite (F-AUTH-02, section 23.3)", () => {
  const minutes = (n: number) => new Date(Date.now() - n * 60 * 1000);
  const heures = (n: number) => new Date(Date.now() - n * 3600 * 1000);

  async function ouvrir(roles: string[], ligne: Record<string, unknown>) {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles, sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif", ligne));
    p.fonctionnaliteActivable.findUnique.mockResolvedValue(null);
  }

  it("un administrateur national inactif depuis plus de 15 minutes est deconnecte et sa session supprimee", async () => {
    await ouvrir(["admin_national"], { derniereActivite: minutes(16) });
    p.sessionActive.delete.mockResolvedValue({});

    expect(await getSession()).toBeNull();
    expect(p.sessionActive.delete).toHaveBeenCalledWith({ where: { id: "sess-1" } });
  });

  it("un administrateur national actif depuis 14 minutes garde sa session", async () => {
    await ouvrir(["admin_national"], { derniereActivite: minutes(14) });

    expect(await getSession()).not.toBeNull();
  });

  it("un medecin est deconnecte apres 12 heures, meme s'il est actif", async () => {
    await ouvrir(["medecin"], { dateCreation: heures(12.1), derniereActivite: minutes(1) });
    p.sessionActive.delete.mockResolvedValue({});

    expect(await getSession()).toBeNull();
  });

  it("un medecin inactif depuis une heure garde sa session (le verrou d'ecran est cote navigateur)", async () => {
    await ouvrir(["medecin"], { dateCreation: heures(3), derniereActivite: minutes(60) });

    expect(await getSession()).not.toBeNull();
  });

  it("un patient garde sa session 29 jours, pas 31", async () => {
    await ouvrir(["patient"], { dateCreation: heures(29 * 24), derniereActivite: heures(24) });
    expect(await getSession()).not.toBeNull();

    p.sessionActive.delete.mockResolvedValue({});
    await ouvrir(["patient"], { dateCreation: heures(31 * 24), derniereActivite: heures(24) });
    expect(await getSession()).toBeNull();
  });

  it("appareil partage : 30 minutes d'inactivite, meme pour un patient", async () => {
    await ouvrir(["patient"], { appareilPartage: true, derniereActivite: minutes(29) });
    expect(await getSession()).not.toBeNull();

    p.sessionActive.delete.mockResolvedValue({});
    await ouvrir(["patient"], { appareilPartage: true, derniereActivite: minutes(31) });
    expect(await getSession()).toBeNull();
  });
});

describe("createSession : cookie et duree selon le profil", () => {
  beforeEach(() => {
    p.sessionActive.create.mockResolvedValue({ id: "sess-9" });
  });

  it("medecin : cookie persistant de 12 heures", async () => {
    await createSession({ userId: "u-1", roles: ["medecin"] });

    const [nom, , options] = magasinCookies.set.mock.calls[0];
    expect(nom).toBe("session");
    expect(options.maxAge).toBe(12 * 3600);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(p.sessionActive.create.mock.calls[0][0].data.appareilPartage).toBe(false);
  });

  it("administrateur national : 8 heures", async () => {
    await createSession({ userId: "u-1", roles: ["admin_national"] });

    expect(magasinCookies.set.mock.calls[0][2].maxAge).toBe(8 * 3600);
  });

  it("patient : 30 jours", async () => {
    await createSession({ userId: "u-1", roles: ["patient"] });

    expect(magasinCookies.set.mock.calls[0][2].maxAge).toBe(30 * 24 * 3600);
  });

  it("appareil partage : cookie de session (aucun maxAge) et indicateur enregistre en base", async () => {
    await createSession({ userId: "u-1", roles: ["patient"], appareilPartage: true });

    expect("maxAge" in magasinCookies.set.mock.calls[0][2]).toBe(false);
    expect(p.sessionActive.create.mock.calls[0][0].data.appareilPartage).toBe(true);
  });

  it("le jeton signe expire avec la duree du profil", async () => {
    await createSession({ userId: "u-1", roles: ["medecin"] });

    const jetonEmis = magasinCookies.set.mock.calls[0][1] as string;
    const charge = JSON.parse(Buffer.from(jetonEmis.split(".")[1], "base64url").toString());
    expect(charge.exp - charge.iat).toBe(12 * 3600);
  });

  it("en production, le cookie porte le prefixe __Host- et est Secure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    vi.stubEnv("SMTP_HOST", "h");
    vi.stubEnv("SMTP_PORT", "1");
    vi.stubEnv("SMTP_USER", "u");
    vi.stubEnv("SMTP_PASSWORD", "p");
    vi.stubEnv("SMTP_FROM", "f");

    await createSession({ userId: "u-1", roles: ["medecin"] });
    vi.unstubAllEnvs();

    const [nom, , options] = magasinCookies.set.mock.calls[0];
    expect(nom).toBe("__Host-session");
    expect(options.secure).toBe(true);
    expect(options.path).toBe("/");
    expect("domain" in options).toBe(false);
  });
});
