import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { apagarGrupo, apagarLancamento, listarLancamentos } from '@/dados/lancamentos';

import estilos from './lista.module.css';

export default async function Lancamentos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));

  const lancamentos = await listarLancamentos(competencia);
  const total = lancamentos.reduce((a, l) => a + l.valorCentavos, 0);

  async function acaoApagar(dadosForm: FormData) {
    'use server';
    const grupo = String(dadosForm.get('grupo') ?? '');
    const id = String(dadosForm.get('id') ?? '');
    if (grupo) {
      await apagarGrupo(grupo);
    } else {
      await apagarLancamento(id);
    }
    revalidatePath('/lancamentos');
  }

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0 }}>Lançamentos</h1>
        <Link href="/lancamentos/novo" className={estilos.novo}>
          + Novo lançamento
        </Link>
      </div>

      <div className={estilos.meses}>
        <Link
          href={`/lancamentos?mes=${somarMeses(competencia, -1)}`}
          className={estilos.mesLink}
        >
          ‹ {somarMeses(competencia, -1)}
        </Link>
        <span className={estilos.mesAtual}>{competencia}</span>
        <Link
          href={`/lancamentos?mes=${somarMeses(competencia, 1)}`}
          className={estilos.mesLink}
        >
          {somarMeses(competencia, 1)} ›
        </Link>
      </div>

      {lancamentos.length === 0 ? (
        <div className={estilos.vazio}>
          Nenhum lançamento em {competencia}.
        </div>
      ) : (
        <>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Orçamento</th>
                <th>Método</th>
                <th className={estilos.valor}>Valor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.descricao}
                    {l.parcelaTotal > 1 ? (
                      <span className={estilos.meta}>
                        {' '}
                        {l.parcelaNum}/{l.parcelaTotal}
                      </span>
                    ) : null}
                    <div className={estilos.meta}>{l.data}</div>
                  </td>
                  <td>
                    {l.categoriaNome}
                    <div className={estilos.meta}>{l.subcategoriaNome}</div>
                  </td>
                  <td>
                    {l.metodo}
                    {l.cartaoNome ? (
                      <div className={estilos.meta}>{l.cartaoNome}</div>
                    ) : null}
                  </td>
                  <td className={estilos.valor}>{formatarBRL(l.valorCentavos)}</td>
                  <td>
                    <form action={acaoApagar}>
                      <input type="hidden" name="id" value={l.id} />
                      <input
                        type="hidden"
                        name="grupo"
                        value={l.grupoParcelamentoId ?? ''}
                      />
                      <button type="submit" className={estilos.apagar}>
                        {l.parcelaTotal > 1 ? 'apagar compra' : 'apagar'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={estilos.total}>
            Total do mês: <strong>{formatarBRL(total)}</strong>
          </div>
        </>
      )}
    </>
  );
}
