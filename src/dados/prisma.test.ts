import { describe, expect, it } from 'vitest';
import { prisma } from './prisma';

describe('conexão com o banco', () => {
  it('responde a uma consulta trivial', async () => {
    const resultado = await prisma.$queryRaw`SELECT 1 AS um`;
    expect(resultado).toEqual([{ um: 1 }]);
  });

  it('tem as tabelas do domínio criadas', async () => {
    // Asserta que a tabela existe e responde — não que está vazia, senão o
    // teste passa a depender da ordem de execução.
    await expect(prisma.budgetCategory.count()).resolves.toBeTypeOf('number');
    await expect(prisma.transaction.count()).resolves.toBeTypeOf('number');
    await expect(prisma.credito.count()).resolves.toBeTypeOf('number');
  });
});
