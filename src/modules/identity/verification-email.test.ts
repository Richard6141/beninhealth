import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    codeVerificationEmail: { deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (operations: unknown[]) => Promise.all(operations));
  return { prisma };
});
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NODE_ENV: "test" })) }));
vi.mock("@/lib/mail", () => ({ envoyerEmail: vi.fn() }));
vi.mock("@/modules/administration/parametres-lecture", () => ({ lireParametre: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async (valeur: string) => `hash:${valeur}`) } }));

import { prisma } from "@/lib/prisma";
import { envoyerEmail } from "@/lib/mail";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import { creerEtEnvoyerCodeVerificationEmail } from "@/modules/identity/verification-email";

const p = prisma as unknown as { codeVerificationEmail: { deleteMany: Mock; create: Mock } };
const lireParametreMock = lireParametre as unknown as Mock;
const envoyerEmailMock = envoyerEmail as unknown as Mock;

const MAINTENANT = new Date("2026-09-27T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  lireParametreMock.mockResolvedValue(10);
});

describe("code de verification e-mail : duree administrable (F-ADM-07, RG-ADM-50)", () => {
  it("lit la duree dans le parametre identity.code_verification_duree_minutes a chaque envoi", async () => {
    await creerEtEnvoyerCodeVerificationEmail("user-1", "a@b.bj");
    await creerEtEnvoyerCodeVerificationEmail("user-1", "a@b.bj");

    expect(lireParametreMock).toHaveBeenCalledTimes(2);
    expect(lireParametreMock).toHaveBeenCalledWith("identity.code_verification_duree_minutes");
  });

  it("l'expiration stockee et le texte de l'e-mail suivent la valeur du parametre", async () => {
    lireParametreMock.mockResolvedValue(25);

    await creerEtEnvoyerCodeVerificationEmail("user-1", "a@b.bj");

    const { data } = p.codeVerificationEmail.create.mock.calls[0][0] as { data: { expireLe: Date; codeHash: string } };
    expect(data.expireLe.toISOString()).toBe(new Date(MAINTENANT.getTime() + 25 * 60_000).toISOString());
    expect(envoyerEmailMock.mock.calls[0][0].html).toContain("expire dans 25 minutes");
  });

  it("la duree par defaut reste de 10 minutes", async () => {
    await creerEtEnvoyerCodeVerificationEmail("user-1", "a@b.bj");

    const { data } = p.codeVerificationEmail.create.mock.calls[0][0] as { data: { expireLe: Date } };
    expect(data.expireLe.toISOString()).toBe(new Date(MAINTENANT.getTime() + 10 * 60_000).toISOString());
  });

  it("ne stocke que l'empreinte du code et invalide les codes non consommes precedents", async () => {
    const code = await creerEtEnvoyerCodeVerificationEmail("user-1", "a@b.bj");

    expect(p.codeVerificationEmail.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1", consommeLe: null } });
    const { data } = p.codeVerificationEmail.create.mock.calls[0][0] as { data: { codeHash: string } };
    expect(data.codeHash).toBe(`hash:${code}`);
    expect(code).toMatch(/^\d{6}$/);
  });
});
