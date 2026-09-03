import Link from 'next/link';

import { listarCartoes } from '@/dados/cartoes';
import { listarFaturas, totalDaFatura } from '@/dados/faturas';
import { competenciaDe, dataCivilEm, formatarDataCivil } from '@/dominio/data';
import { janelaDeFaturas } from '@/dominio/fatura';
import { formatarBRL } from '@/dominio/dinheiro';

import { acaoFecharFatura, acaoPagarFatura } from './acoes';

export default async function Cartoes({
  searchParams,
}: {
  searchParams: Promise<{ todas?: string }>;
}) {
  const { todas } = await searchParams;
  const mostrarTodas = todas === '1';

  const cartoes = await listarCartoes();
  const mesCorrente = competenciaDe(dataCivilEm(new Date()));

  const comFaturas = await Promise.all(
    cartoes.map(async (cartao) => {
      const todasAsFaturas = await listarFaturas(cartao.id);
      const { visiveis, ocultas } = mostrarTodas
        ? { visiveis: todasAsFaturas, ocultas: 0 }
        : janelaDeFaturas(todasAsFaturas, mesCorrente);

      const comTotais = await Promise.all(
        visiveis.map(async (f) => ({
          ...f,
          total: await totalDaFatura(f.id),
        })),
      );
      return { cartao, faturas: comTotais, ocultas };
    }),
  );

  const hoje = formatarDataCivil(dataCivilEm(new Date()));

  return (
    <>
      <h1>Cartões</h1>

      {cartoes.length === 0 ? (
        <p style={{ fontSize: 'var(--fonte-tamanho-subtitulo)', color: 'var(--cor-texto-secundario)' }}>
          Nenhum cartão cadastrado. Crie um em Ajustes.
        </p>
      ) : (
        <>
          {mostrarTodas ? (
            <p style={{ fontSize: 12, marginTop: 0 }}>
              Mostrando todas as faturas.{' '}
              <Link href="/cartoes" style={{ color: 'var(--cor-destaque-texto)' }}>
                voltar à janela padrão
              </Link>
            </p>
          ) : null}
          {comFaturas.map(({ cartao, faturas, ocultas }) => (
          <section key={cartao.id} style={{ marginBottom: 'var(--espaco-8)' }}>
            <h2 style={{ fontSize: 'var(--fonte-tamanho-subtitulo)', marginBottom: 'var(--espaco-1)' }}>{cartao.nome}</h2>
            <div style={{ fontSize: 12, color: 'var(--cor-texto-mudo)', marginBottom: 'var(--espaco-3)' }}>
              fecha dia {cartao.diaFechamento} · vence dia {cartao.diaVencimento}
            </div>

            {faturas.length === 0 ? (
              <div style={{ fontSize: 'var(--fonte-tamanho-corpo)', color: 'var(--cor-texto-mudo)' }}>
                Nenhuma fatura ainda — ela nasce quando você lança a primeira
                compra neste cartão.
              </div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fonte-tamanho-corpo)' }}>
                  <thead>
                    <tr>
                      {['Competência', 'Vencimento', 'Status', 'Total', ''].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: h === 'Total' ? 'right' : 'left',
                            fontSize: 'var(--fonte-tamanho-rotulo)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            color: 'var(--cor-texto-mudo)',
                            fontWeight: 500,
                            padding: '0 var(--espaco-2) var(--espaco-2)',
                            borderBottom: '1px solid var(--cor-borda)',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {faturas.map((f) => (
                      <tr key={f.id}>
                        <td style={{ padding: 'var(--espaco-2) var(--espaco-2)', borderBottom: '1px solid var(--cor-superficie-sutil)' }}>
                          {f.competencia}
                        </td>
                        <td style={{ padding: 'var(--espaco-2) var(--espaco-2)', borderBottom: '1px solid var(--cor-superficie-sutil)' }}>
                          {f.dataVencimento}
                        </td>
                        <td style={{ padding: 'var(--espaco-2) var(--espaco-2)', borderBottom: '1px solid var(--cor-superficie-sutil)' }}>
                          {f.status}
                          {f.pagaEm ? (
                            <span style={{ color: 'var(--cor-texto-mudo)', fontSize: 'var(--fonte-tamanho-rotulo)' }}>
                              {' '}
                              em {f.pagaEm}
                            </span>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: 'var(--espaco-2) var(--espaco-2)',
                            borderBottom: '1px solid var(--cor-superficie-sutil)',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatarBRL(f.total)}
                        </td>
                        <td style={{ padding: 'var(--espaco-2) var(--espaco-2)', borderBottom: '1px solid var(--cor-superficie-sutil)' }}>
                          {f.status === 'ABERTA' ? (
                            <form action={acaoFecharFatura}>
                              <input type="hidden" name="id" value={f.id} />
                              <button type="submit" style={{ fontSize: 'var(--fonte-tamanho-rotulo)', cursor: 'pointer' }}>
                                fechar
                              </button>
                            </form>
                          ) : f.status === 'FECHADA' ? (
                            <form action={acaoPagarFatura}>
                              <input type="hidden" name="id" value={f.id} />
                              <input type="hidden" name="pagaEm" value={hoje} />
                              <button type="submit" style={{ fontSize: 'var(--fonte-tamanho-rotulo)', cursor: 'pointer' }}>
                                marcar paga
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ocultas > 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--cor-texto-secundario)', marginTop: 'var(--espaco-2)' }}>
                    {ocultas} fatura{ocultas > 1 ? 's' : ''} fora da janela em torno de{' '}
                    {mesCorrente}.{' '}
                    <Link href="/cartoes?todas=1" style={{ color: 'var(--cor-destaque-texto)' }}>
                      ver todas
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ))}
        </>
      )}
    </>
  );
}
