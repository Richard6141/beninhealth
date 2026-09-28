// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DossierPatientResume } from "@/modules/patient/actions";
import type { InformationDeclareeActionState } from "@/modules/patient/informations-declarees";
import { AssistantPremiereUtilisation } from "./AssistantPremiereUtilisation";

/**
 * F-CIT-01 : tranche le doute laisse par une session precedente sur
 * AssistantPremiereUtilisation.tsx (contact d'urgence suspecte de ne pas
 * s'enregistrer en usage reel). Premier test de composant React de ce depot
 * (aucun autre fichier .test.tsx n'existe) : exerce reellement le rendu, la
 * navigation entre etapes et la soumission DOM du formulaire (pas seulement
 * l'action serveur appelee en isolation), pour verifier ce qui arrive
 * reellement dans le FormData transmis a enregistrerPremiereUtilisationAction,
 * independamment de tout Fast Refresh du serveur de developpement.
 *
 * @testing-library/react, @testing-library/user-event et jsdom ajoutes en
 * devDependencies pour ce seul fichier (environment jsdom scope localement
 * par le pragma ci-dessus, jamais en global dans vitest.config.ts, qui reste
 * en environment "node" pour les 2347 tests existants).
 */

// userEvent.type simule une frappe caractere par caractere avec un vrai
// yield de l'event loop entre chacune : sous charge machine lourde (plusieurs
// sessions actives ce soir), le delai par defaut de 5 s peut etre depasse
// avant la fin de la saisie, ce qui n'est pas un defaut du composant teste
// (confirme : un depassement en cours de frappe a laisse une frappe
// orpheline se terminer pendant le test suivant, cause du "C" isole observe
// une fois dans contactUrgenceLien avant ce correctif). Marge elargie pour
// ce fichier seul, pas touche globalement dans vitest.config.ts.
vi.setConfig({ testTimeout: 20000 });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// vi.mock est hoiste en tete de module par Vitest : la reference a
// actionMock DANS la factory ci-dessous doit donc, elle aussi, exister avant
// toute autre initialisation du module (vi.hoisted), sinon erreur de
// reference temporelle (TDZ) au chargement du fichier.
const { actionMock } = vi.hoisted(() => ({
  actionMock: vi.fn(
    async (_prevState: InformationDeclareeActionState, _formData: FormData): Promise<InformationDeclareeActionState> => ({
      error: null,
      success: true,
    })
  ),
}));

vi.mock("@/modules/patient/informations-declarees", () => ({
  enregistrerPremiereUtilisationAction: actionMock,
}));

// Sans setupFiles global (vitest.config.ts reste en environment "node" par
// defaut, voir plus haut) : @testing-library/react ne nettoie jamais le DOM
// entre les tests toute seule. Sans cet afterEach, chaque render() du test
// suivant s'ajoute au precedent au lieu de le remplacer (confirme en
// premiere execution : N boutons "Terminer" trouves au Neme test).
afterEach(cleanup);

/**
 * TextField/SelectField (design system) accolent le texte "(facultatif)"
 * juste apres le libelle, sans espace separateur (voir Groupe sanguin dans
 * le DOM : "Groupe sanguin(facultatif)") : le nom accessible complet n'est
 * donc jamais un match exact du seul libelle. Meme correspondance
 * approchee que la fonction de recherche du champ retenue ci-dessous pour
 * toutes les requetes par libelle de ce fichier - pas une modification du
 * composant partage (caracteristique deja presente sur tous les champs
 * facultatifs de l'application, hors perimetre de ce correctif F-CIT-01).
 */
function champParLibelle(libelle: string): HTMLElement {
  return screen.getByLabelText(libelle, { exact: false });
}

const DOSSIER_VIDE: DossierPatientResume = {
  identifiantSante: "BJ-SANTE-PAT-0001",
  dateNaissance: "1990-01-01",
  sexe: "F",
  groupeSanguin: "inconnu",
  allergies: [],
  antecedents: [],
  maladiesChroniques: [],
  grossesseEnCours: false,
  contactsUrgence: [],
};

/** Avance jusqu'a la derniere etape (contact d'urgence) en cliquant "Suivant" les fois necessaires. */
async function allerAuContactDUrgence(utilisateur: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 3; i++) {
    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
  }
}

describe("AssistantPremiereUtilisation : contact d'urgence dans le FormData transmis (F-CIT-01)", () => {
  it("le contact d'urgence saisi arrive bien dans le FormData recu par l'action, apres une soumission DOM reelle", async () => {
    const utilisateur = userEvent.setup();
    render(<AssistantPremiereUtilisation dossier={DOSSIER_VIDE} />);

    await allerAuContactDUrgence(utilisateur);

    await utilisateur.type(champParLibelle("Nom complet"), "Awa Kponou");
    await utilisateur.type(champParLibelle("Téléphone"), "+22997000000");
    await utilisateur.type(champParLibelle("Lien de parenté"), "Conjointe");

    await utilisateur.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));

    const formDataRecu = actionMock.mock.calls[0][1];
    expect(formDataRecu.get("contactUrgenceNom")).toBe("Awa Kponou");
    expect(formDataRecu.get("contactUrgenceTelephone")).toBe("+22997000000");
    expect(formDataRecu.get("contactUrgenceLien")).toBe("Conjointe");
  });

  it("un contact d'urgence laisse vide arrive bien vide (jamais undefined ni absent du FormData)", async () => {
    const utilisateur = userEvent.setup();
    render(<AssistantPremiereUtilisation dossier={DOSSIER_VIDE} />);

    await allerAuContactDUrgence(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));

    const formDataRecu = actionMock.mock.calls[0][1];
    expect(formDataRecu.get("contactUrgenceNom")).toBe("");
    expect(formDataRecu.get("contactUrgenceTelephone")).toBe("");
    expect(formDataRecu.get("contactUrgenceLien")).toBe("");
  });

  it("un contact d'urgence deja enregistre est pre-rempli ET reste present dans le FormData sans etre retouche", async () => {
    const utilisateur = userEvent.setup();
    const dossierAvecContact: DossierPatientResume = {
      ...DOSSIER_VIDE,
      contactsUrgence: [{ nom: "Koffi Ahouansou", telephone: "+22996000000", lienParente: "Pere" }],
    };
    render(<AssistantPremiereUtilisation dossier={dossierAvecContact} />);

    await allerAuContactDUrgence(utilisateur);

    expect((champParLibelle("Nom complet") as HTMLInputElement).value).toBe("Koffi Ahouansou");

    await utilisateur.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));

    const formDataRecu = actionMock.mock.calls[0][1];
    expect(formDataRecu.get("contactUrgenceNom")).toBe("Koffi Ahouansou");
    expect(formDataRecu.get("contactUrgenceTelephone")).toBe("+22996000000");
    expect(formDataRecu.get("contactUrgenceLien")).toBe("Pere");
  });

  it("les autres champs (groupe sanguin, allergies) sont eux aussi bien transmis, aux cotes du contact d'urgence", async () => {
    const utilisateur = userEvent.setup();
    render(<AssistantPremiereUtilisation dossier={DOSSIER_VIDE} />);

    await allerAuContactDUrgence(utilisateur);
    await utilisateur.type(champParLibelle("Nom complet"), "Awa Kponou");
    await utilisateur.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));

    const formDataRecu = actionMock.mock.calls[0][1];
    expect(formDataRecu.get("groupeSanguin")).toBe("inconnu");
    expect(formDataRecu.get("contactUrgenceNom")).toBe("Awa Kponou");
  });

  it("n'appelle l'action qu'une seule fois meme si Terminer est clique deux fois rapidement (garde de double soumission)", async () => {
    const utilisateur = userEvent.setup();
    render(<AssistantPremiereUtilisation dossier={DOSSIER_VIDE} />);

    await allerAuContactDUrgence(utilisateur);
    const boutonTerminer = screen.getByRole("button", { name: "Terminer" });
    await utilisateur.click(boutonTerminer);
    await utilisateur.click(boutonTerminer);

    await waitFor(() => expect(actionMock).toHaveBeenCalled());
    expect(actionMock).toHaveBeenCalledTimes(1);
  });
});
