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
    // .kilo/worktrees/** est un worktree Git isole d'un autre outil (pas ce
    // depot principal) : ses fichiers de test importent quand meme le code
    // source de ce depot via l'alias "@" ci-dessous, ce qui les executait en
    // double sans jamais tester quoi que ce soit d'isole. Exclu comme
    // node_modules le serait.
    exclude: ["**/node_modules/**", "**/.kilo/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
