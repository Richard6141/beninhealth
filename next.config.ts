import type { NextConfig } from "next";
import { enTetesSecurite } from "./src/lib/en-tetes-securite";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: enTetesSecurite(process.env.NODE_ENV === "production"),
      },
    ];
  },
  experimental: {
    serverActions: {
      // Le televersement de photo de profil (FormulaireAvatar.tsx) accepte
      // jusqu'a 3 Mo (TAILLE_MAX_AVATAR_OCTETS, src/modules/identity/actions.ts) ;
      // la limite par defaut de Next.js pour le corps d'une Server Action est
      // 1 Mo, plus basse que ce que l'UI annonce elle-meme.
      bodySizeLimit: "4mb",
    },
  },
  images: {
    // Les avatars sont desormais heberges sur Cloudinary (src/lib/cloudinary.ts) :
    // next/image refuse par defaut toute image dont l'hote n'est pas
    // explicitement autorise ici, meme si l'URL est stockee en base.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
