import { v2 as cloudinary } from "cloudinary";
import { getEnv } from "@/lib/env";

// Configuration Cloudinary appliquee une seule fois par processus, meme
// principe que le transporteur SMTP unique de src/lib/mail.ts (evite de
// reconfigurer le SDK a chaque appel et de perdre l'etat entre rechargements
// a chaud en developpement).
const globalPourCloudinary = globalThis as unknown as {
  cloudinaryConfigure: boolean | undefined;
};

function configurerCloudinarySiNecessaire(): void {
  if (globalPourCloudinary.cloudinaryConfigure) {
    return;
  }

  const env = getEnv();

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  globalPourCloudinary.cloudinaryConfigure = true;
}

export interface ResultatTeleversementImage {
  url: string;
  publicId: string;
}

/**
 * Televerse une image vers Cloudinary et renvoie son URL securisee (https)
 * ainsi que son identifiant public, pour un eventuel remplacement ulterieur
 * (voir remplacerImageCloudinary). Point d'entree unique de televersement
 * d'image de cette plateforme (toutes les images doivent passer par
 * Cloudinary, jamais par un stockage local sous public/) : src/lib/mail.ts
 * joue le meme role pour l'envoi d'e-mail, un seul point a auditer plutot
 * qu'un appel ad hoc par module.
 *
 * dossierComplement est ajoute sous le dossier racine CLOUDINARY_FOLDER (ex.
 * "avatars"), pour ranger les images par type d'usage cote Cloudinary.
 */
export async function televerserImageCloudinary(
  octets: Buffer,
  options: { dossierComplement: string; identifiantPublic: string }
): Promise<ResultatTeleversementImage> {
  configurerCloudinarySiNecessaire();

  const env = getEnv();
  const dossier = `${env.CLOUDINARY_FOLDER}/${options.dossierComplement}`;

  const resultat = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const flux = cloudinary.uploader.upload_stream(
        {
          folder: dossier,
          public_id: options.identifiantPublic,
          overwrite: true,
          resource_type: "image",
        },
        (erreur, resultatTeleversement) => {
          if (erreur || !resultatTeleversement) {
            reject(erreur ?? new Error("Televersement Cloudinary sans reponse."));
            return;
          }
          resolve(resultatTeleversement);
        }
      );
      flux.end(octets);
    }
  );

  return { url: resultat.secure_url, publicId: resultat.public_id };
}

/**
 * Televerse un fichier prive vers Cloudinary (type "authenticated") : jamais
 * accessible par une URL publique statique, seulement via une URL signee a
 * duree de vie courte (voir genererUrlSigneeCloudinary), generee a la
 * demande apres re-verification Zero Trust de l'appelant. Utilise pour les
 * documents medicaux (RG-CLI-112 du pack : jamais servi par une URL
 * statique/publique). "image" comme resource_type couvre aussi bien les PDF
 * que les JPEG/PNG cote Cloudinary (memes formats que
 * detecterTypeReelFichier, src/modules/document/stockage-fichiers.ts).
 *
 * RG-CLI-110 : flags: "force_strip" (transformation appliquee au
 * televersement, donc persistee sur la ressource stockee elle-meme, pas
 * seulement sur une URL de livraison a la demande) retire les metadonnees
 * EXIF/XMP/ICC embarquees (dont la localisation GPS) d'une image avant
 * stockage. Verifie manuellement (pas seulement documente) : upload d'une
 * image de test contenant un vrai segment EXIF, telechargement immediat
 * derriere une URL signee neuve sans aucune transformation demandee a la
 * volee, absence confirmee du segment EXIF dans les octets recus. Verifie
 * aussi que ce flag n'altere ni ne rasterise un PDF (upload/telechargement
 * d'un PDF de test, octets et format inchanges).
 */
export async function televerserFichierPriveCloudinary(
  octets: Buffer,
  options: { dossierComplement: string; identifiantPublic: string }
): Promise<ResultatTeleversementImage> {
  configurerCloudinarySiNecessaire();

  const env = getEnv();
  const dossier = `${env.CLOUDINARY_FOLDER}/${options.dossierComplement}`;

  const resultat = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const flux = cloudinary.uploader.upload_stream(
        {
          folder: dossier,
          public_id: options.identifiantPublic,
          type: "authenticated",
          resource_type: "image",
          flags: "force_strip",
        },
        (erreur, resultatTeleversement) => {
          if (erreur || !resultatTeleversement) {
            reject(erreur ?? new Error("Televersement Cloudinary sans reponse."));
            return;
          }
          resolve(resultatTeleversement);
        }
      );
      flux.end(octets);
    }
  );

  return { url: resultat.secure_url, publicId: resultat.public_id };
}

/**
 * Genere une URL de telechargement Cloudinary signee, valide 60 secondes,
 * pour un fichier prive televerse via televerserFichierPriveCloudinary. A
 * appeler seulement apres re-verification Zero Trust de l'appelant (jamais
 * renvoyee telle quelle au client : voir src/app/api/documents/[id]/route.ts,
 * qui recupere les octets serveur a serveur via cette URL puis les renvoie
 * lui-meme, sans jamais exposer l'URL Cloudinary elle-meme au navigateur).
 *
 * Utilise volontairement l'API de telechargement prive de Cloudinary
 * (cloudinary.utils.private_download_url, domaine api.cloudinary.com) plutot
 * que l'URL de livraison CDN signee (cloudinary.url({sign_url: true, ...}),
 * domaine res.cloudinary.com) : cette derniere renvoie systematiquement
 * 401 "deny or ACL failure" sur ce compte pour les ressources de type
 * "authenticated", quels que soient le format/la version/la duree de
 * validite passes (verifie manuellement, memes parametres, seul le domaine
 * d'appel change). L'API de telechargement prive est le mecanisme documente
 * par Cloudinary specifiquement pour ce cas (ressource jamais publique,
 * acces demande a la demande) et fonctionne de bout en bout.
 *
 * format est obligatoire ici (voir extensionDepuisTypeMime,
 * src/modules/document/stockage-fichiers.ts) : sans extension explicite,
 * Cloudinary ne peut pas retrouver la ressource pour la signer.
 */
export function genererUrlSigneeCloudinary(publicId: string, format: string): string {
  configurerCloudinarySiNecessaire();

  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: "image",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 60,
  });
}

/**
 * Supprime un fichier prive Cloudinary : utilise uniquement pour annuler un
 * televersement dont l'ecriture en base a echoue juste apres (evite un
 * fichier orphelin cote Cloudinary), jamais pour un retrait "ajoute par
 * erreur" (RG-CLI-113 : un document une fois enregistre n'est jamais
 * supprime, seulement marque retire).
 */
export async function supprimerFichierPriveCloudinary(publicId: string): Promise<void> {
  configurerCloudinarySiNecessaire();

  await cloudinary.uploader.destroy(publicId, {
    type: "authenticated",
    resource_type: "image",
  });
}
