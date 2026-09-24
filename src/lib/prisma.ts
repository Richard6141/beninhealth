import { PrismaClient } from "@prisma/client";

// Instance unique du client Prisma, reutilisee entre les rechargements a
// chaud en developpement (evite d'epuiser les connexions SQLite).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
