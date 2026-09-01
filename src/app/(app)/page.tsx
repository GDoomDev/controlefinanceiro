import Link from 'next/link';

import { resumoDoMes } from '@/dados/painel';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';

import estilos from './painel.module.css';

const VERDE = '#16a34a';
const AMBAR = '#d97706';
const VERMELHO = '#dc2626';
const CINZA = '#9ca3af';

/** Largura de uma faixa da barra, em porcentagem. Nunca negativa. */
function largura(parte: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.max(0, (parte / total) * 100)}%`;
}

export default async function Painel({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));
  const resumo = await resumoDoMes(competencia);

  const sobra = resumo.sobraProjetada;

  return (
    <>
      <div className={estilos.cabecalho}>
        <div className={estilos.meses}>
          <Link href={`/?mes=${somarMeses(competencia, -1)}`} className={estilos.mesLink}>
            ‹
          </Link>
          <span className={estilos.mesAtual}>{competencia}</span>
          <Link href={`/?mes=${somarMeses(competencia, 1)}`} className={estilos.mesLink}>
            ›
          </Link>
        </div>
        <div className={estilos.realizado}>
          <b>{formatarBRL(resumo.sobraRealizada)}</b>
          <span>realizado até aqui</span>
        </div>
      </div>

      <div className={estilos.heroi}>
        <div className={estilos.heroiRotulo}>
          {resumo.ehMesPassado ? 'Sobrou neste mês' : 'Sobra projetada do fechamento'}
        </div>
        <div
          className={`${estilos.heroiValor} ${sobra >= 0 ? estilos.positivo : estilos.negativo}`}
        >
          {formatarBRL(sobra)}
          <em>de {formatarBRL(resumo.receitaConsiderada)} de receita</em>
        </div>

        <div className={estilos.trilha}>
          <div
            style={{
              width: largura(resumo.faixas.gastoCentavos, resumo.receitaConsiderada),
              background: VERDE,
            }}
          />
          <div
            style={{
              width: largura(
                resumo.faixas.comprometidoCentavos,
                resumo.receitaConsiderada,
              ),
              background: AMBAR,
            }}
          />
        </div>
        <div className={estilos.legenda}>
          <span>{formatarBRL(resumo.faixas.gastoCentavos)} já gastos</span>
          <span>{formatarBRL(resumo.faixas.comprometidoCentavos)} comprometidos</span>
          <span>{formatarBRL(resumo.faixas.livreCentavos)} livres</span>
        </div>
      </div>

      {resumo.cards.length === 0 ? (
        <div className={estilos.vazio}>
          Nenhum orçamento definido. Comece em{' '}
          <Link href="/orcamentos">Orçamentos</Link>.
        </div>
      ) : (
        <div className={estilos.grade}>
          {resumo.cards.map((c) => {
            const cor =
              c.estado === 'ESTOURADO'
                ? VERMELHO
                : c.estado === 'CONCLUIDO'
                  ? CINZA
                  : c.restanteCentavos <= c.orcadoCentavos * 0.1
                    ? AMBAR
                    : VERDE;

            const consumido =
              c.orcadoCentavos > 0
                ? Math.min(100, (c.gastoCentavos / c.orcadoCentavos) * 100)
                : 100;

            return (
              <div
                key={c.categoriaId}
                className={`${estilos.card} ${c.estado === 'CONCLUIDO' ? estilos.cardConcluido : ''}`}
              >
                {c.estado === 'ESTOURADO' ? (
                  <span className={estilos.bandeira}>🔴</span>
                ) : null}
                <div className={estilos.cardNome}>{c.nome}</div>
                <div className={estilos.cardValor} style={{ color: cor }}>
                  {formatarBRL(c.restanteCentavos)}
                </div>
                <div className={estilos.cardSub}>
                  gastou {formatarBRL(c.gastoCentavos)} de{' '}
                  {formatarBRL(c.orcadoCentavos)}
                </div>
                <div className={estilos.cardTrilha}>
                  <div
                    className={estilos.cardPreenchimento}
                    style={{ width: `${consumido}%`, background: cor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
