import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Aceita tanto o cliente normal quanto o cliente de dentro de uma transação.
 * Toda função de escrita da camada de dados recebe isto, para poder participar
 * de uma transação maior (ex.: gravar as 10 parcelas de uma compra de uma vez).
 */
export type ClientePrisma = PrismaClient | Prisma.TransactionClient;
