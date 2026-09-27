import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

/**
 * Faux stockage minimal avec un vrai verrou d'exclusion mutuelle derriere
 * `tx.$queryRaw` (ce que fait SELECT ... FOR UPDATE) et un delai a chaque
 * acces pour que deux transactions concurrentes s'entrelacent : sans verrou,
 * les deux lisent "rien delivre" avant que l'une n'ecrive.
 */
const base = {
  totalLivre: 0,
  statut: "validee",
  date: new Date(),
  compteur: 0,
  verrouActif: true,
  mutex: Promise.resolve() as Promise<void>,
  nombreDeVerrous: 0,
  ordre: [] as string[],
  dejaServiIci: false,
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function ordonnance() {
  return {
    id: "presc-1",
    numero: "RX-2026-0001",
    statut: base.statut,
    date: base.date,
    patient: { userId: "user-pat" },
    delivrances: base.dejaServiIci ? [{ id: "deliv-anterieure" }] : [],
    lignes: [
      {
        id: "l1",
        medicamentId: "med-1",
        quantite: 10,
        nonSubstituable: false,
        medicament: { nom: "Amoxicilline", principeActif: "amoxicilline", dosage: "500 mg", forme: "gelule" },
      },
    ],
  };
}

function fabriquerTransaction() {
  let liberer: (() => void) | null = null;

  const tx = {
    $queryRaw: vi.fn(async () => {
      base.nombreDeVerrous += 1;
      base.ordre.push("verrou");
      if (base.verrouActif) {
        const precedent = base.mutex;
        let debloquer!: () => void;
        base.mutex = new Promise<void>((resolve) => {
          debloquer = resolve;
        });
        await precedent;
        liberer = debloquer;
      }
      return [{ id: "presc-1" }];
    }),
    prescription: {
      findUnique: vi.fn(async () => {
        base.ordre.push("lecture");
        await tick();
        return ordonnance();
      }),
      update: vi.fn(async ({ data }: { data: { statut: string } }) => {
        await tick();
        base.statut = data.statut;
        return {};
      }),
    },
    ligneDelivrance: {
      groupBy: vi.fn(async () => {
        await tick();
        return base.totalLivre > 0 ? [{ lignePrescriptionId: "l1", _sum: { quantiteDelivree: base.totalLivre } }] : [];
      }),
    },
    delivrance: {
      create: vi.fn(async ({ data }: { data: { lignes: { create: { quantiteDelivree: number }[] } } }) => {
        await tick();
        base.totalLivre += data.lignes.create[0].quantiteDelivree;
        base.compteur += 1;
        return { id: `deliv-${base.compteur}` };
      }),
    },
    evenementPrescription: { create: vi.fn(async () => ({})) },
    medicament: { findUnique: vi.fn() },
  };

  return { tx, liberer: () => liberer?.() };
}

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test" })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  return { default: { compare }, compare };
});
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("@/modules/administration/parametres", () => ({ estFonctionnaliteActive: vi.fn(async () => true) }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { delivrerPrescriptionAction } from "@/modules/prescription/actions";
import { creerJetonPresentation } from "@/modules/prescription/presentation";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { MESSAGE_MODULE_INACTIF } from "@/modules/administration/modules-actifs";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  etablissementSanitaire: { findUnique: Mock };
  $transaction: Mock;
};
const getSessionMock = getSession as unknown as Mock;
const etatInitial = { error: null, success: false };
const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");
const ilYaJours = (jours: number) => new Date(MAINTENANT.getTime() - jours * 24 * 60 * 60 * 1000);

function delivrance(quantite: number, motif = "", jeton: string | null = creerJetonPresentation("user-ph", "presc-1")): FormData {
  const donnees = new FormData();
  donnees.set("prescriptionId", "presc-1");
  if (jeton !== null) donnees.set("jeton", jeton);
  donnees.set(
    "lignesJSON",
    JSON.stringify([{ lignePrescriptionId: "l1", quantiteDelivree: quantite, motifNonDelivrance: motif }])
  );
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);

  base.totalLivre = 0;
  base.statut = "validee";
  base.date = ilYaJours(1);
  base.compteur = 0;
  base.verrouActif = true;
  base.mutex = Promise.resolve();
  base.nombreDeVerrous = 0;
  base.ordre = [];
  base.dejaServiIci = false;

  getSessionMock.mockResolvedValue({ userId: "user-ph", roles: ["pharmacien"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-ph", etablissementId: "etab-ph" });
  p.etablissementSanitaire.findUnique.mockResolvedValue({ nom: "Pharmacie du Port" });
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const { tx, liberer } = fabriquerTransaction();
    try {
      return await fn(tx);
    } finally {
      liberer();
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("delivrerPrescriptionAction, RG-PHA-11 (CA-1 : deux delivrances totales simultanees)", () => {
  it("une seule des deux reussit et la quantite delivree ne depasse jamais la quantite prescrite", async () => {
    const [premiere, seconde] = await Promise.all([
      delivrerPrescriptionAction(etatInitial, delivrance(10)),
      delivrerPrescriptionAction(etatInitial, delivrance(10)),
    ]);

    expect([premiere.success, seconde.success].filter(Boolean)).toHaveLength(1);
    expect(base.totalLivre).toBe(10);
    expect(base.compteur).toBe(1);
    expect(base.statut).toBe("delivree");
    expect(base.nombreDeVerrous).toBe(2);
  });

  it("garde-fou du test : sans verrou, le meme scenario surdelivre (la course est bien reproduite)", async () => {
    base.verrouActif = false;

    const [premiere, seconde] = await Promise.all([
      delivrerPrescriptionAction(etatInitial, delivrance(10)),
      delivrerPrescriptionAction(etatInitial, delivrance(10)),
    ]);

    expect(premiere.success).toBe(true);
    expect(seconde.success).toBe(true);
    expect(base.totalLivre).toBe(20);
  });

  it("prend le verrou avant toute lecture de l'ordonnance", async () => {
    await delivrerPrescriptionAction(etatInitial, delivrance(10));

    expect(base.ordre.slice(0, 2)).toEqual(["verrou", "lecture"]);
  });
});

describe("delivrerPrescriptionAction, RG-PHA-02 (ordonnance presentee a la pharmacie)", () => {
  it("refuse sans preuve de presentation quand la pharmacie n'a encore rien delivre dessus", async () => {
    const resultat = await delivrerPrescriptionAction(etatInitial, delivrance(10, "", null));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("n'a pas ete presentee");
    expect(base.totalLivre).toBe(0);
  });

  it("refuse la preuve d'un autre pharmacien", async () => {
    const resultat = await delivrerPrescriptionAction(
      etatInitial,
      delivrance(10, "", creerJetonPresentation("user-autre", "presc-1"))
    );

    expect(resultat.success).toBe(false);
    expect(base.totalLivre).toBe(0);
  });

  it("refuse la preuve d'une autre ordonnance", async () => {
    const resultat = await delivrerPrescriptionAction(
      etatInitial,
      delivrance(10, "", creerJetonPresentation("user-ph", "presc-2"))
    );

    expect(resultat.success).toBe(false);
    expect(base.totalLivre).toBe(0);
  });

  it("accepte sans preuve quand la pharmacie a deja delivre sur cette ordonnance", async () => {
    base.dejaServiIci = true;

    const resultat = await delivrerPrescriptionAction(etatInitial, delivrance(4, "rupture_stock", null));

    expect(resultat).toEqual({ error: null, success: true });
  });
});

describe("delivrerPrescriptionAction, RG-PHA-10 (validite)", () => {
  it("refuse une ordonnance de plus de 90 jours, avec sa date d'expiration", async () => {
    base.date = ilYaJours(91);

    const resultat = await delivrerPrescriptionAction(etatInitial, delivrance(10));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("a expire le");
    expect(base.totalLivre).toBe(0);
  });

  it("accepte une ordonnance de 90 jours pile", async () => {
    base.date = ilYaJours(90);

    const resultat = await delivrerPrescriptionAction(etatInitial, delivrance(10));

    expect(resultat).toEqual({ error: null, success: true });
  });
});

describe("delivrerPrescriptionAction, delivrance a zero", () => {
  it("refuse une delivrance dont toutes les quantites sont nulles", async () => {
    const resultat = await delivrerPrescriptionAction(etatInitial, delivrance(0, "rupture_stock"));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Aucune quantite");
    expect(base.compteur).toBe(0);
    expect(base.statut).toBe("validee");
  });

  it("accepte une delivrance partielle avec un motif", async () => {
    const resultat = await delivrerPrescriptionAction(etatInitial, delivrance(4, "rupture_stock"));

    expect(resultat).toEqual({ error: null, success: true });
    expect(base.totalLivre).toBe(4);
    expect(base.statut).toBe("delivree_partiellement");
  });
});

describe("module pharmacie desactive (F-ADM-07)", () => {
  it("refuse la delivrance sans rien lire ni ecrire quand pharmacy.module est inactif", async () => {
    (estFonctionnaliteActive as unknown as Mock).mockResolvedValueOnce(false);

    const resultat = await delivrerPrescriptionAction(etatInitial, delivrance(10));

    expect(resultat).toEqual({ error: MESSAGE_MODULE_INACTIF, success: false });
    expect(estFonctionnaliteActive).toHaveBeenCalledWith("pharmacy.module");
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(base.totalLivre).toBe(0);
  });

  it("le meme module actif laisse passer la delivrance", async () => {
    const resultat = await delivrerPrescriptionAction(etatInitial, delivrance(10));

    expect(resultat.success).toBe(true);
  });
});
