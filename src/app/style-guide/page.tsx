"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Download,
  HeartPulse,
  Info,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { NavigationProgressBar } from "@/components/ui/NavigationProgressBar";
import { SelectField } from "@/components/ui/SelectField";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/TextField";
import { Tooltip } from "@/components/ui/Tooltip";

const nuances = [
  { nom: "Fond de page", jeton: "--plan", classe: "bg-plan", bordure: true },
  { nom: "Surface", jeton: "--surface", classe: "bg-surface", bordure: true },
  {
    nom: "Surface d'appui",
    jeton: "--surface-appui",
    classe: "bg-surface-appui",
    bordure: true,
  },
  { nom: "Texte principal", jeton: "--encre", classe: "bg-encre" },
  {
    nom: "Texte secondaire",
    jeton: "--encre-secondaire",
    classe: "bg-encre-secondaire",
  },
  {
    nom: "Texte atténué",
    jeton: "--encre-attenuee",
    classe: "bg-encre-attenuee",
  },
  { nom: "Bordure", jeton: "--bordure", classe: "bg-bordure", bordure: true },
  {
    nom: "Bordure forte",
    jeton: "--bordure-forte",
    classe: "bg-bordure-forte",
  },
];

const accents = [
  { nom: "Accent", jeton: "--accent", classe: "bg-accent" },
  { nom: "Accent foncé", jeton: "--accent-fonce", classe: "bg-accent-fonce" },
  {
    nom: "Accent clair",
    jeton: "--accent-clair",
    classe: "bg-accent-clair",
    bordure: true,
  },
];

const statuts = [
  { nom: "Bon", jeton: "--statut-bon", classe: "bg-bon" },
  { nom: "Bon clair", jeton: "--statut-bon-clair", classe: "bg-bon-clair", bordure: true },
  { nom: "Vigilance", jeton: "--statut-vigilance", classe: "bg-vigilance" },
  {
    nom: "Vigilance clair",
    jeton: "--statut-vigilance-clair",
    classe: "bg-vigilance-clair",
    bordure: true,
  },
  { nom: "Critique", jeton: "--statut-critique", classe: "bg-critique" },
  {
    nom: "Critique clair",
    jeton: "--statut-critique-clair",
    classe: "bg-critique-clair",
    bordure: true,
  },
  { nom: "Information", jeton: "--info", classe: "bg-info" },
  {
    nom: "Information claire",
    jeton: "--info-clair",
    classe: "bg-info-clair",
    bordure: true,
  },
];

const decoratives = [
  {
    nom: "Marque turquoise",
    jeton: "--marque-turquoise",
    classe: "bg-marque-turquoise",
  },
  {
    nom: "Marque turquoise foncée",
    jeton: "--marque-turquoise-fonce",
    classe: "bg-marque-turquoise-fonce",
  },
];

const departements = [
  { value: "atlantique", label: "Atlantique" },
  { value: "littoral", label: "Littoral" },
  { value: "oueme", label: "Ouémé" },
  { value: "borgou", label: "Borgou" },
  { value: "zou", label: "Zou" },
];

const ongletsExemple = [
  {
    id: "resume",
    label: "Résumé",
    content: (
      <p className="text-[15px] text-encre-secondaire">
        Vue d&apos;ensemble des indicateurs clés du district sanitaire,
        actualisée quotidiennement.
      </p>
    ),
  },
  {
    id: "indicateurs",
    label: "Indicateurs",
    content: (
      <dl className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-[12px] uppercase tracking-[0.08em] text-encre-attenuee">
            Centres actifs
          </dt>
          <dd className="chiffres text-[20px] font-bold text-encre">128</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[12px] uppercase tracking-[0.08em] text-encre-attenuee">
            Couverture vaccinale
          </dt>
          <dd className="chiffres text-[20px] font-bold text-encre">86,4 %</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[12px] uppercase tracking-[0.08em] text-encre-attenuee">
            Alertes ouvertes
          </dt>
          <dd className="chiffres text-[20px] font-bold text-critique">7</dd>
        </div>
      </dl>
    ),
  },
  {
    id: "historique",
    label: "Historique",
    content: (
      <p className="text-[15px] text-encre-secondaire">
        Journal des vingt derniers événements enregistrés pour ce district.
      </p>
    ),
  },
];

const iconesStatut = [
  { icon: CheckCircle2, tone: "good" as const, label: "Bon" },
  { icon: AlertTriangle, tone: "warning" as const, label: "Vigilance" },
  { icon: AlertCircle, tone: "critical" as const, label: "Critique" },
  { icon: Info, tone: "info" as const, label: "Information" },
];

const iconeToneClasses: Record<string, string> = {
  good: "bg-bon-clair text-bon",
  warning: "bg-vigilance-clair text-vigilance",
  critical: "bg-critique-clair text-critique",
  info: "bg-info-clair text-info",
};

export default function Home() {
  const modaleConfirmation = useRef<ModalHandle>(null);
  const modaleFormulaire = useRef<ModalHandle>(null);
  const tiroirLateral = useRef<ModalHandle>(null);
  const tiroirBas = useRef<ModalHandle>(null);

  const [avancement, setAvancement] = useState(70);
  const [barreActive, setBarreActive] = useState(true);

  return (
    <div className="min-h-screen bg-plan pb-24">
      <NavigationProgressBar progress={avancement} active={barreActive} />

      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6">
        <header className="sans-impression flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-clair text-accent">
              <HeartPulse size={20} aria-hidden="true" />
            </span>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
              Fondation, phase 1
            </p>
          </div>
          <h1 className="text-[28px] font-black text-encre">
            Guide de style : Bénin Health Intelligence Platform
          </h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Banc de test temporaire des composants du système de design :
            chaque variante est affichée ici pour vérification visuelle. Cet
            écran n&apos;est pas un écran final du produit.
          </p>
        </header>

        <section aria-labelledby="titre-couleurs" className="flex flex-col gap-4">
          <h2 id="titre-couleurs" className="text-[20px] font-bold text-encre">
            Couleurs
          </h2>
          <Card description="Neutres, accent, statuts et couleur décorative, tels que définis dans la base de design.">
            <div className="flex flex-col gap-6">
              <PaletteGroupe titre="Neutres" nuances={nuances} />
              <PaletteGroupe titre="Accent (marine)" nuances={accents} />
              <PaletteGroupe titre="Statuts" nuances={statuts} />
              <PaletteGroupe
                titre="Décorative (usage restreint)"
                nuances={decoratives}
              />
            </div>
          </Card>
        </section>

        <section aria-labelledby="titre-typo" className="flex flex-col gap-4">
          <h2 id="titre-typo" className="text-[20px] font-bold text-encre">
            Typographie
          </h2>
          <Card description="Échelle de tailles Lato et alignement des chiffres (classe .chiffres).">
            <div className="flex flex-col gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
                Kicker, 12px, graisse 600
              </p>
              <p className="text-[12px] text-encre">Légende, 12px</p>
              <p className="text-[13px] text-encre">Texte petit, 13px</p>
              <p className="text-[15px] text-encre">Texte de corps, 15px</p>
              <p className="text-[17px] text-encre">Texte souligné, 17px</p>
              <p className="text-[20px] font-bold text-encre">
                Titre de section, 20px
              </p>
              <p className="text-[28px] font-black text-encre">
                Titre de page, 28px
              </p>
              <div className="mt-2 flex flex-wrap gap-6 border-t border-bordure pt-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] text-encre-attenuee">
                    Sans .chiffres
                  </span>
                  <span className="text-[17px] text-encre">1 234,50 FCFA</span>
                  <span className="text-[17px] text-encre">98,00 FCFA</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] text-encre-attenuee">
                    Avec .chiffres
                  </span>
                  <span className="chiffres text-[17px] text-encre">
                    1 234,50 FCFA
                  </span>
                  <span className="chiffres text-[17px] text-encre">
                    98,00 FCFA
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section aria-labelledby="titre-boutons" className="flex flex-col gap-4">
          <h2 id="titre-boutons" className="text-[20px] font-bold text-encre">
            Boutons
          </h2>
          <Card>
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primaire</Button>
                <Button variant="secondary">Secondaire</Button>
                <Button variant="ghost">Discret</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="primary" disabled>
                  Désactivé
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" size="sm">
                  Petite, 36px
                </Button>
                <Button variant="primary" size="md">
                  Normale, 44px
                </Button>
                <Button variant="primary" size="lg">
                  Grande, 48px
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" iconBefore={Download}>
                  Télécharger
                </Button>
                <Button variant="primary" iconAfter={ArrowRight}>
                  Continuer
                </Button>
              </div>
            </div>
          </Card>
        </section>

        <section aria-labelledby="titre-cartes" className="flex flex-col gap-4">
          <h2 id="titre-cartes" className="text-[20px] font-bold text-encre">
            Cartes
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card
              title="Avec en-tête"
              description="Titre, description courte et actions à droite."
              actions={
                <IconButton icon={Settings} label="Paramètres de la carte" />
              }
            >
              <p className="text-[15px] text-encre-secondaire">
                Corps de la carte, séparé de l&apos;en-tête par un espacement,
                jamais par un filet.
              </p>
            </Card>
            <Card>
              <p className="text-[15px] text-encre-secondaire">
                Carte sans en-tête, posée directement sur le fond de page.
              </p>
            </Card>
          </div>
          <div className="rounded-carte bg-surface-appui p-4 sm:p-6">
            <p className="mb-4 text-[13px] text-encre-secondaire">
              Panneau englobant (fond --surface-appui) avec une carte blanche
              qui flotte dedans.
            </p>
            <Card title="Carte flottante">
              <p className="text-[15px] text-encre-secondaire">
                Le contraste entre le panneau et la carte crée la hiérarchie,
                pas l&apos;ombre.
              </p>
            </Card>
          </div>
        </section>

        <section aria-labelledby="titre-badges" className="flex flex-col gap-4">
          <h2 id="titre-badges" className="text-[20px] font-bold text-encre">
            Pastilles
          </h2>
          <Card>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">Neutre</Badge>
              <Badge tone="accent">Accent</Badge>
              <Badge tone="good">Bon</Badge>
              <Badge tone="warning">Vigilance</Badge>
              <Badge tone="critical">Critique</Badge>
              <Badge tone="info">Information</Badge>
            </div>
          </Card>
        </section>

        <section aria-labelledby="titre-alertes" className="flex flex-col gap-4">
          <h2 id="titre-alertes" className="text-[20px] font-bold text-encre">
            Alertes
          </h2>
          <div className="flex flex-col gap-3">
            <Alert level="critical" title="Rupture de stock de vaccins">
              Trois centres de santé signalent une rupture depuis plus de
              48 heures.
            </Alert>
            <Alert level="warning" title="Délai de saisie dépassé">
              Certains centres n&apos;ont pas transmis leurs données depuis
              cinq jours.
            </Alert>
            <Alert level="info" title="Mise à jour du protocole">
              Une nouvelle version du protocole de vaccination est
              disponible.
            </Alert>
            <Alert level="success" title="Rapport mensuel validé">
              Le rapport du district a été contrôlé et approuvé.
            </Alert>
          </div>
        </section>

        <section aria-labelledby="titre-icones" className="flex flex-col gap-4">
          <h2 id="titre-icones" className="text-[20px] font-bold text-encre">
            Icônes encerclées
          </h2>
          <Card description="Habillage optionnel : icône dans un rond de couleur douce pour donner du poids à un indicateur.">
            <div className="flex flex-wrap gap-6">
              {iconesStatut.map(({ icon: Icone, tone, label }) => (
                <div key={tone} className="flex items-center gap-2">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${iconeToneClasses[tone]}`}
                  >
                    <Icone size={20} aria-hidden="true" />
                  </span>
                  <span className="text-[13px] text-encre-secondaire">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section aria-labelledby="titre-champs" className="flex flex-col gap-4">
          <h2 id="titre-champs" className="text-[20px] font-bold text-encre">
            Champs de formulaire
          </h2>
          <Card>
            <div className="grid gap-6 sm:grid-cols-2">
              <TextField label="Nom du centre de santé" required placeholder="Ex. CSC Akpakpa" />
              <TextField
                label="Contact"
                hint="Numéro joignable pendant les heures ouvrées."
                placeholder="+229 00 00 00 00"
              />
              <TextField
                label="Distance au centre de référence"
                unit="km"
                type="number"
                defaultValue={12}
              />
              <TextField
                label="Identifiant"
                required
                error="Ce champ est obligatoire."
              />
              <SelectField
                label="Département"
                required
                placeholder="Choisir un département"
                options={departements}
              />
              <SelectField
                label="Type d'établissement"
                hint="Sélectionnez la catégorie la plus proche."
                options={[
                  { value: "chd", label: "Centre hospitalier départemental" },
                  { value: "csc", label: "Centre de santé communal" },
                  { value: "dispensaire", label: "Dispensaire" },
                ]}
              />
            </div>
          </Card>
        </section>

        <section aria-labelledby="titre-onglets" className="flex flex-col gap-4">
          <h2 id="titre-onglets" className="text-[20px] font-bold text-encre">
            Onglets
          </h2>
          <Card>
            <Tabs
              items={ongletsExemple}
              label="Vue du district sanitaire"
            />
          </Card>
        </section>

        <section aria-labelledby="titre-divers" className="flex flex-col gap-4">
          <h2 id="titre-divers" className="text-[20px] font-bold text-encre">
            Infobulle, boutons icône, avatars
          </h2>
          <Card>
            <div className="flex flex-wrap items-center gap-8">
              <div className="flex items-center gap-2">
                <span className="text-[15px] text-encre">
                  Taux de rupture
                </span>
                <Tooltip content="Part des centres ayant signalé une rupture de stock au cours des 30 derniers jours." />
              </div>
              <div className="flex items-center gap-2">
                <IconButton icon={Pencil} label="Modifier" />
                <IconButton icon={Bell} label="Notifications" />
                <IconButton icon={Plus} label="Ajouter un élément" />
                <IconButton icon={Trash2} label="Supprimer" danger />
              </div>
              <div className="flex items-center gap-2">
                <Avatar name="Adjoavi Houngbo" />
                <Avatar name="Koffi Amoussou" />
                <Avatar name="Fatima Sanni" />
                <Avatar name="Bio Tchané" />
              </div>
            </div>
          </Card>
        </section>

        <section aria-labelledby="titre-chargement" className="flex flex-col gap-4">
          <h2 id="titre-chargement" className="text-[20px] font-bold text-encre">
            Chargement
          </h2>
          <Card description="Squelettes de contenu (role=status posé sur le conteneur) et barre de progression de navigation.">
            <div role="status" className="flex flex-col gap-3">
              <span className="sr-only">Chargement du contenu en cours</span>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-bordure pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAvancement((valeur) => Math.min(100, valeur + 15))}
              >
                Avancer la barre
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAvancement(20)}
              >
                Réinitialiser
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBarreActive((valeur) => !valeur)}
              >
                {barreActive ? "Masquer la barre" : "Afficher la barre"}
              </Button>
              <span className="chiffres text-[13px] text-encre-attenuee">
                {avancement} %
              </span>
            </div>
          </Card>
        </section>

        <section aria-labelledby="titre-modales" className="sans-impression flex flex-col gap-4">
          <h2 id="titre-modales" className="text-[20px] font-bold text-encre">
            Fenêtres modales
          </h2>
          <Card>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => modaleConfirmation.current?.showModal()}
              >
                Modale de confirmation
              </Button>
              <Button
                variant="secondary"
                onClick={() => modaleFormulaire.current?.showModal()}
              >
                Modale large (formulaire)
              </Button>
              <Button
                variant="secondary"
                onClick={() => tiroirLateral.current?.showModal()}
              >
                Tiroir latéral
              </Button>
              <Button
                variant="secondary"
                onClick={() => tiroirBas.current?.showModal()}
              >
                Tiroir du bas
              </Button>
            </div>
          </Card>

          <Modal
            ref={modaleConfirmation}
            title="Confirmer la suppression"
            description="Cette action est définitive."
            width="narrow"
          >
            <div className="flex flex-col gap-4">
              <p className="text-[15px] text-encre-secondaire">
                Voulez-vous vraiment supprimer cet enregistrement ? Cette
                opération ne peut pas être annulée.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => modaleConfirmation.current?.close()}
                >
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  onClick={() => modaleConfirmation.current?.close()}
                >
                  Supprimer
                </Button>
              </div>
            </div>
          </Modal>

          <Modal
            ref={modaleFormulaire}
            title="Ajouter un centre de santé"
            description="Renseignez les informations de base."
            width="wide"
          >
            <div className="flex flex-col gap-4">
              <TextField label="Nom du centre" required />
              <SelectField
                label="Département"
                required
                placeholder="Choisir un département"
                options={departements}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => modaleFormulaire.current?.close()}
                >
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  onClick={() => modaleFormulaire.current?.close()}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          </Modal>

          <Modal
            ref={tiroirLateral}
            variant="drawer-right"
            title="Filtres"
            description="Affiner la liste des établissements."
          >
            <div className="flex flex-col gap-4">
              <SelectField
                label="Département"
                placeholder="Tous les départements"
                options={departements}
              />
              <TextField label="Recherche" placeholder="Nom du centre" />
            </div>
          </Modal>

          <Modal
            ref={tiroirBas}
            variant="drawer-bottom"
            title="Actions rapides"
            description="Disponible sur mobile comme sur ordinateur."
          >
            <div className="flex flex-col gap-2">
              <Button variant="secondary" className="justify-start">
                Exporter les données
              </Button>
              <Button variant="secondary" className="justify-start">
                Partager le rapport
              </Button>
            </div>
          </Modal>
        </section>

        <section
          aria-labelledby="titre-entete-impression"
          className="seulement-impression"
        >
          <h2 id="titre-entete-impression" className="mb-2 text-[20px] font-bold">
            Bénin Health Intelligence Platform
          </h2>
          <p className="text-[13px]">Document généré pour impression.</p>
        </section>
        <p className="seulement-impression text-[13px] text-encre-attenuee">
          Bénin Health Intelligence Platform, document imprimé le{" "}
          {new Date().toLocaleDateString("fr-FR")}.
        </p>
      </main>
    </div>
  );
}

interface Nuance {
  nom: string;
  jeton: string;
  classe: string;
  bordure?: boolean;
}

function PaletteGroupe({
  titre,
  nuances: valeurs,
}: {
  titre: string;
  nuances: Nuance[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] font-semibold text-encre-secondaire">
        {titre}
      </p>
      <div className="flex flex-wrap gap-4">
        {valeurs.map((nuance) => (
          <div key={nuance.jeton} className="flex flex-col items-start gap-1.5">
            <span
              className={`h-12 w-20 rounded-champ ${nuance.classe} ${
                nuance.bordure ? "border border-bordure" : ""
              }`}
            />
            <span className="text-[13px] text-encre">{nuance.nom}</span>
            <span className="text-[12px] text-encre-attenuee">
              {nuance.jeton}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
