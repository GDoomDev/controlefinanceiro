import Link from 'next/link';

import { areasDoMes } from '@/dados/areas';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { corDaCategoria } from '@/dominio/paleta';

import estilos from './areas.module.css';

/** Abaixo disso o rótulo não cabe no segmento e vira só cor + legenda. */
const LARGURA_MINIMA_PARA_ROTULO = 12;

function porcentagem(valor: number): string {
  return `${valor.toFixed(1).replace('.', ',')}%`;
}

function comFiltro(mes: string, categoriaId: string | null): string {
  const busca = new URLSearchParams({ mes });
  if (categoriaId) busca.set('orcamento', categoriaId);
  return `/areas?${busca.toString()}`;
}

export default async function Areas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; orcamento?: string }>;
}) {
  const { mes, orcamento } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));
  const filtroPedido = orcamento ?? null;

  const areas = await areasDoMes(competencia, filtroPedido);

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Áreas</h1>
        <div className={estilos.meses}>
          <Link
            href={comFiltro(somarMeses(competencia, -1), filtroPedido)}
            className={estilos.mesLink}
          >
            ‹ {somarMeses(competencia, -1)}
          </Link>
          <span className={estilos.mesAtual}>{competencia}</span>
          <Link
            href={comFiltro(somarMeses(competencia, 1), filtroPedido)}
            className={estilos.mesLink}
          >
            {somarMeses(competencia, 1)} ›
          </Link>
        </div>
      </div>

      {areas.composicao.segmentos.length === 0 ? (
        <div className={estilos.vazio}>
          Nenhum gasto em {competencia}. Registre um em{' '}
          <Link href="/lancamentos/novo">Lançamentos</Link>.
        </div>
      ) : (
        <>
          <div className={estilos.totalRotulo}>Total gasto no mês</div>
          <div className={estilos.total}>{formatarBRL(areas.totalCentavos)}</div>

          <div className={estilos.barra}>
            {areas.composicao.segmentos.map((s) => {
              const destino = s.categoriaId
                ? comFiltro(competencia, s.categoriaId)
                : comFiltro(competencia, null);
              const ativo = Boolean(s.categoriaId) && s.categoriaId === areas.filtro?.categoriaId;

              return (
                <Link
                  key={s.categoriaId || 'outras'}
                  href={destino}
                  title={`${s.nome} — ${formatarBRL(s.gastoCentavos)}`}
                  className={`${estilos.segmento} ${ativo ? estilos.segmentoAtivo : ''}`}
                  style={{
                    width: `${s.percentual}%`,
                    background: corDaCategoria(s),
                  }}
                >
                  {s.percentual >= LARGURA_MINIMA_PARA_ROTULO ? s.nome : ''}
                </Link>
              );
            })}
          </div>

          {/* A legenda carrega os valores absolutos por escrito: três slots da
              paleta clara não têm contraste suficiente para a cor sozinha
              identificar o segmento (spec, seção 9). */}
          <div className={estilos.legenda}>
            {areas.composicao.segmentos.map((s) => (
              <Link
                key={s.categoriaId || 'outras'}
                href={
                  s.categoriaId
                    ? comFiltro(competencia, s.categoriaId)
                    : comFiltro(competencia, null)
                }
                className={estilos.legendaItem}
              >
                <span
                  className={estilos.ponto}
                  style={{ background: corDaCategoria(s) }}
                />
                {s.nome}
                <span className={estilos.legendaValor}>
                  {formatarBRL(s.gastoCentavos)} · {porcentagem(s.percentual)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {areas.composicao.creditados.length > 0 ? (
        <div className={estilos.creditados}>
          Fora da barra, por terem saldo de crédito no mês:{' '}
          {areas.composicao.creditados
            .map((c) => `${c.nome} (${formatarBRL(c.gastoCentavos)})`)
            .join(' · ')}
        </div>
      ) : null}

      {areas.filtro ? (
        <div className={estilos.filtro}>
          <span>
            Mostrando só as subcategorias de <b>{areas.filtro.nome}</b>
          </span>
          <Link href={comFiltro(competencia, null)} className={estilos.limpar}>
            limpar filtro
          </Link>
        </div>
      ) : null}

      <div className={estilos.titulo}>Subcategorias</div>

      {areas.ranking.linhas.length === 0 ? (
        <div className={estilos.vazio}>Nada a listar neste mês.</div>
      ) : (
        <div>
          {areas.ranking.linhas.map((l) => (
            <div key={l.subcategoriaId} className={estilos.linha} tabIndex={0}>
              <div className={estilos.linhaTopo}>
                <span>
                  <span className={estilos.linhaNome}>{l.nome}</span>
                  <span className={estilos.linhaOrcamento}>{l.nomeDoOrcamento}</span>
                </span>
                <span className={estilos.linhaValor}>
                  {formatarBRL(l.gastoCentavos)}
                  <span className={estilos.linhaPercentual}>
                    {porcentagem(l.percentualDoMes)}
                  </span>
                </span>
              </div>
              <div className={estilos.linhaTrilha}>
                <div
                  className={estilos.linhaPreenchimento}
                  style={{
                    width: `${Math.max(0, l.percentualDoMes)}%`,
                    background: corDaCategoria(l),
                  }}
                />
              </div>
              <div className={estilos.detalhe}>
                <span>{porcentagem(l.percentualDoMes)} do mês</span>
                <span>{porcentagem(l.percentualDoOrcamento)} de {l.nomeDoOrcamento}</span>
                <span>
                  {l.quantidade} lançamento{l.quantidade === 1 ? '' : 's'}
                </span>
                <span>maior: {formatarBRL(l.maiorLancamentoCentavos)}</span>
              </div>
            </div>
          ))}

          {areas.ranking.outras ? (
            <div className={estilos.outras}>
              Outras {areas.ranking.outras.quantidade} subcategorias ·{' '}
              {formatarBRL(areas.ranking.outras.gastoCentavos)} ·{' '}
              {porcentagem(areas.ranking.outras.percentualDoMes)} do mês
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
