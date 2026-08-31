import { describe, expect, it } from 'vitest';
import { emailAutorizado } from './auth';

describe('emailAutorizado', () => {
  it('aceita o e-mail configurado', () => {
    expect(emailAutorizado('gabriel@exemplo.com', 'gabriel@exemplo.com')).toBe(true);
  });

  it('ignora diferença de maiúsculas e espaços em volta', () => {
    expect(emailAutorizado(' Gabriel@Exemplo.com ', 'gabriel@exemplo.com')).toBe(true);
  });

  it('recusa qualquer outro e-mail', () => {
    expect(emailAutorizado('estranho@exemplo.com', 'gabriel@exemplo.com')).toBe(false);
  });

  it('recusa quando o e-mail vem vazio ou nulo', () => {
    expect(emailAutorizado(null, 'gabriel@exemplo.com')).toBe(false);
    expect(emailAutorizado(undefined, 'gabriel@exemplo.com')).toBe(false);
    expect(emailAutorizado('', 'gabriel@exemplo.com')).toBe(false);
  });

  it('recusa tudo quando não há e-mail autorizado configurado', () => {
    // Sem essa regra, um deploy sem a variável liberaria o app para qualquer um.
    expect(emailAutorizado('qualquer@exemplo.com', undefined)).toBe(false);
    expect(emailAutorizado('qualquer@exemplo.com', '')).toBe(false);
  });
});
