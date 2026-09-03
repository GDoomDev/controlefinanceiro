import Link from 'next/link';

import { listarCategorias } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';

import { FormularioLancamento } from '../formulario';

export default async function NovoLancamento() {
  const [categorias, cartoes] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
  ]);

  if (categorias.length === 0) {
    return (
      <>
        <h1>Novo lançamento</h1>
        <p style={{ fontSize: 14, color: 'var(--cor-texto-secundario)' }}>
          Cadastre pelo menos um orçamento com uma subcategoria em{' '}
          <Link href="/orcamentos">Orçamentos</Link> antes de lançar uma despesa.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Novo lançamento</h1>
      <FormularioLancamento
        categorias={categorias.map((c) => ({
          id: c.id,
          nome: c.nome,
          subcategorias: c.subcategorias.map((s) => ({ id: s.id, nome: s.nome })),
        }))}
        cartoes={cartoes.map((c) => ({
          id: c.id,
          nome: c.nome,
          diaFechamento: c.diaFechamento,
          diaVencimento: c.diaVencimento,
        }))}
      />
    </>
  );
}
