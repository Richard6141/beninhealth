import { describe, expect, it } from "vitest";
import {
  ErreurDechiffrement,
  chiffrer,
  dechiffrer,
  deriverClePin,
  genererSel,
} from "./crypto-client";

describe("crypto-client (RG-OFF-01) : chiffrement AES-GCM derive du PIN via PBKDF2", () => {
  it("chiffrer puis dechiffrer avec le bon PIN restitue les donnees exactes", async () => {
    const sel = genererSel();
    const cle = await deriverClePin("482913", sel);
    const donnees = { nom: "Dossou", prenom: "Akpédjé", age: 34, liste: [1, 2, 3] };

    const enveloppe = await chiffrer(cle, sel, donnees);
    const restitue = await dechiffrer<typeof donnees>(cle, enveloppe);

    expect(restitue).toEqual(donnees);
  });

  it("un mauvais PIN echoue proprement (jamais un resultat corrompu silencieux)", async () => {
    const sel = genererSel();
    const cleCorrecte = await deriverClePin("482913", sel);
    const enveloppe = await chiffrer(cleCorrecte, sel, { secret: "donnee sensible" });

    const cleIncorrecte = await deriverClePin("111111", sel);

    await expect(dechiffrer(cleIncorrecte, enveloppe)).rejects.toBeInstanceOf(ErreurDechiffrement);
  });

  it("une enveloppe alteree (donnees modifiees) echoue au dechiffrement, meme avec le bon PIN", async () => {
    const sel = genererSel();
    const cle = await deriverClePin("482913", sel);
    const enveloppe = await chiffrer(cle, sel, { secret: "donnee sensible" });

    const octetsAlteres = enveloppe.donneesBase64.slice(0, -4) + (enveloppe.donneesBase64.endsWith("A") ? "B" : "A") + enveloppe.donneesBase64.slice(-3);
    const enveloppeAlteree = { ...enveloppe, donneesBase64: octetsAlteres };

    await expect(dechiffrer(cle, enveloppeAlteree)).rejects.toBeInstanceOf(ErreurDechiffrement);
  });

  it("deux chiffrements successifs de la meme donnee produisent des IV differents", async () => {
    const sel = genererSel();
    const cle = await deriverClePin("482913", sel);

    const enveloppe1 = await chiffrer(cle, sel, { valeur: "identique" });
    const enveloppe2 = await chiffrer(cle, sel, { valeur: "identique" });

    expect(enveloppe1.ivBase64).not.toEqual(enveloppe2.ivBase64);
    expect(enveloppe1.donneesBase64).not.toEqual(enveloppe2.donneesBase64);
  });

  it("deriverClePin est deterministe : meme PIN + meme sel => meme cle utilisable pour dechiffrer", async () => {
    const sel = genererSel();
    const cle1 = await deriverClePin("482913", sel);
    const enveloppe = await chiffrer(cle1, sel, { valeur: 42 });

    const cle2 = await deriverClePin("482913", sel);
    const restitue = await dechiffrer<{ valeur: number }>(cle2, enveloppe);

    expect(restitue.valeur).toBe(42);
  });

  it("la cle derivee n'est jamais exportable (extractable: false)", async () => {
    const sel = genererSel();
    const cle = await deriverClePin("482913", sel);

    expect(cle.extractable).toBe(false);
  });
});
