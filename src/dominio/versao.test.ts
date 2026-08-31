import { describe, expect, it } from 'vitest';
import { VERSAO_DOMINIO } from './versao';

describe('versao', () => {
  it('expõe a versão do domínio', () => {
    expect(VERSAO_DOMINIO).toBe('1.0.0');
  });
});
