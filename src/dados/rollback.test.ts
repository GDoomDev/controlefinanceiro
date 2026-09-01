import { describe, expect, it } from 'vitest';
import { prisma } from './prisma';
import { comRollback } from './rollback';

describe('comRollback', () => {
  it('desfaz o que foi escrito dentro do corpo', async () => {
    const nome = `teste-rollback-${Date.now()}`;

    await comRollback(async (tx) => {
      await tx.budgetCategory.create({
        data: { nome, ordem: 999, corSlot: 1 },
      });
      // Dentro da transação, a linha existe.
      const dentro = await tx.budgetCategory.findUnique({ where: { nome } });
      expect(dentro).not.toBeNull();
    });

    // Depois do rollback, não existe mais.
    const depois = await prisma.budgetCategory.findUnique({ where: { nome } });
    expect(depois).toBeNull();
  });

  it('propaga o erro quando o corpo falha, e ainda assim desfaz', async () => {
    const nome = `teste-rollback-erro-${Date.now()}`;

    await expect(
      comRollback(async (tx) => {
        await tx.budgetCategory.create({
          data: { nome, ordem: 998, corSlot: 1 },
        });
        throw new Error('falha proposital');
      }),
    ).rejects.toThrow('falha proposital');

    const depois = await prisma.budgetCategory.findUnique({ where: { nome } });
    expect(depois).toBeNull();
  });
});
