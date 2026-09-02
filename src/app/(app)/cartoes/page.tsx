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
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          Nenhum cartão cadastrado. Crie um em Ajustes.
        </p>
      ) : (
        <>
          {mostrarTodas ? (
            <p style={{ fontSize: 12, marginTop: 0 }}>
              Mostrando todas as faturas.{' '}
              <Link href="/cartoes" style={{ color: '#2a78d6' }}>
                voltar à janela padrão
              </Link>
            </p>
          ) : null}
          {comFaturas.map(({ cartao, faturas, ocultas }) => (
          <section key={cartao.id} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, marginBottom: 4 }}>{cartao.nome}</h2>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
              fecha dia {cartao.diaFechamento} · vence dia {cartao.diaVencimento}
            </div>

            {faturas.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9ca3af' }}>
                Nenhuma fatura ainda — ela nasce quando você lança a primeira
                compra neste cartão.
              </div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Competência', 'Vencimento', 'Status', 'Total', ''].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: h === 'Total' ? 'right' : 'left',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            color: '#9ca3af',
                            fontWeight: 500,
                            padding: '0 8px 8px',
                            borderBottom: '1px solid #e5e7eb',
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
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6' }}>
                          {f.competencia}
                        </td>
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6' }}>
                          {f.dataVencimento}
                        </td>
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6' }}>
                          {f.status}
                          {f.pagaEm ? (
                            <span style={{ color: '#9ca3af', fontSize: 11 }}>
                              {' '}
                              em {f.pagaEm}
                            </span>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: '9px 8px',
                            borderBottom: '1px solid #f3f4f6',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatarBRL(f.total)}
                        </td>
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6' }}>
                          {f.status === 'ABERTA' ? (
                            <form action={acaoFecharFatura}>
                              <input type="hidden" name="id" value={f.id} />
                              <button type="submit" style={{ fontSize: 11, cursor: 'pointer' }}>
                                fechar
                              </button>
                            </form>
                          ) : f.status === 'FECHADA' ? (
                            <form action={acaoPagarFatura}>
                              <input type="hidden" name="id" value={f.id} />
                              <input type="hidden" name="pagaEm" value={hoje} />
                              <button type="submit" style={{ fontSize: 11, cursor: 'pointer' }}>
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
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                    {ocultas} fatura{ocultas > 1 ? 's' : ''} fora da janela em torno de{' '}
                    {mesCorrente}.{' '}
                    <Link href="/cartoes?todas=1" style={{ color: '#2a78d6' }}>
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
