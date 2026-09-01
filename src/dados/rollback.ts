import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

/** Erro-sentinela: existe só para forçar o rollback, nunca escapa. */
class Rollback extends Error {
  constructor() {
    super('rollback');
    this.name = 'Rollback';
  }
}

/**
 * Roda `corpo` dentro de uma transação e desfaz tudo ao final, mesmo quando o
 * corpo termina bem. Serve para testes escreverem no banco real sem sujá-lo.
 *
 * Se o corpo lançar um erro próprio, esse erro é propagado (e o rollback
 * acontece de qualquer forma).
 */
export async function comRollback(
  corpo: (tx: ClientePrisma) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await corpo(tx);
      throw new Rollback();
    });
  } catch (erro) {
    if (erro instanceof Rollback) return;
    throw erro;
  }
}
