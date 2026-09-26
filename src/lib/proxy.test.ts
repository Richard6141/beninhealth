import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { config, proxy } from "../../proxy";

const SECRET_DE_TEST = "secret-de-test-uniquement-pour-le-proxy-0123456789";

function requete(cookie?: string): NextRequest {
  return new NextRequest("http://localhost:3000/app/patient", {
    headers: cookie ? { cookie } : {},
  });
}

async function jetonSigne(secret: string): Promise<string> {
  return new SignJWT({ userId: "u1" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

describe("proxy (garde des routes /app/*)", () => {
  const secretInitial = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = SECRET_DE_TEST;
  });

  afterEach(() => {
    if (secretInitial === undefined) {
      delete process.env.NEXTAUTH_SECRET;
    } else {
      process.env.NEXTAUTH_SECRET = secretInitial;
    }
  });

  it("ne s'applique qu'aux routes /app/*", () => {
    expect(config.matcher).toEqual(["/app/:path*"]);
  });

  it("redirige vers /connexion sans cookie de session", async () => {
    const reponse = await proxy(requete());

    expect(reponse.status).toBe(307);
    expect(new URL(reponse.headers.get("location") ?? "").pathname).toBe("/connexion");
  });

  it("redirige vers /connexion avec un cookie qui n'est pas un jeton valide", async () => {
    const reponse = await proxy(requete("session=abc.def.ghi"));

    expect(reponse.status).toBe(307);
    expect(new URL(reponse.headers.get("location") ?? "").pathname).toBe("/connexion");
  });

  it("redirige vers /connexion avec un jeton signe par un autre secret", async () => {
    const jeton = await jetonSigne("un-autre-secret-de-test-0123456789-abcdef");
    const reponse = await proxy(requete(`session=${jeton}`));

    expect(reponse.status).toBe(307);
  });

  it("redirige vers /connexion quand le secret serveur est absent", async () => {
    const jeton = await jetonSigne(SECRET_DE_TEST);
    delete process.env.NEXTAUTH_SECRET;

    const reponse = await proxy(requete(`session=${jeton}`));

    expect(reponse.status).toBe(307);
  });

  it("laisse passer un jeton correctement signe", async () => {
    const jeton = await jetonSigne(SECRET_DE_TEST);
    const reponse = await proxy(requete(`session=${jeton}`));

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("x-middleware-next")).toBe("1");
  });
});
