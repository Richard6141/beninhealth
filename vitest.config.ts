import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Configuration Vitest (Phase 7 : tests automatises).
 *
 * Environnement "node" : les tests couverts ici (permissions RBAC, Server
 * Actions des modules identity et patient) sont des fonctions pures ou des
 * fonctions mockant Prisma et la session, aucun DOM n'est necessaire.
 *
 * L'alias "@/*" reprend celui de tsconfig.json (paths."@/*" -> "./src/*"),
 * configure ici manuellement via resolve.alias pour eviter une dependance
 * supplementaire (ex : vite-tsconfig-paths).
 */
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
