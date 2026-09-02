import Link from 'next/link';

import { avisosDoMes } from '@/dados/avisos';
import { resumoDoMes } from '@/dados/painel';
import { materializarRecorrentes } from '@/dados/recorrentes';
import type { Severidade } from '@/dominio/avisos';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { estaProximoDoLimite } from '@/dominio/painel';

import estilos from './painel.module.css';

const VERDE = '#16a34a';
const AMBAR = '#d97706';
const VERMELHO = '#dc2626';
const CINZA = '#9ca3af';

const CLASSE_DA_SEVERIDADE: Record<Severidade, string> = {
  VERMELHO: estilos.avisoVermelho,
  AMARELO: estilos.avisoAmarelo,
  AZUL: estilos.avisoAzul,
  CINZA: estilos.avisoCinza,
};

const ICONE_DA_SEVERIDADE: Record<Severidade, string> = {
  VERMELHO: '⚠',
  AMARELO: '◐',
  AZUL: '↩',
  CINZA: '✎',
};

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

  // Materializa as despesas fixas vigentes neste mês antes de ler o resumo —
  // idempotente, então navegar de novo para o mesmo mês não duplica nada
  // (spec, seção 13).
  await materializarRecorrentes(competencia);

  const [resumo, avisos] = await Promise.all([
    resumoDoMes(competencia),
    avisosDoMes(competencia),
  ]);

  // Mês passado: só o que de fato aconteceu. Mês corrente e futuro: a
  // projeção do fechamento (spec, seção 7 — "Meses passados exibem apenas o
  // realizado; meses futuros, apenas a projeção").
  const sobra = resumo.ehMesPassado ? resumo.sobraRealizada : resumo.sobraProjetada;

  // O bloco "realizado até aqui" só faz sentido no mês corrente: num mês
  // passado ele é redundante com o herói (que já mostra o realizado); num mês
  // futuro ele é só ruído (fica sempre ~R$0).
  const hoje = competenciaDe(dataCivilEm(new Date()));
  const ehMesCorrente = resumo.competencia === hoje;

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
        {ehMesCorrente ? (
          <div className={estilos.realizado}>
            <b>{formatarBRL(resumo.sobraRealizada)}</b>
            <span>realizado até aqui</span>
          </div>
        ) : null}
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

        {/* Num mês passado não há mais "comprometido": o mês fechou, só resta
            o que de fato sobrou — já mostrado acima. A trilha e a legenda de
            três números só fazem sentido enquanto o mês ainda está correndo. */}
        {!resumo.ehMesPassado ? (
          <>
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
          </>
        ) : null}
      </div>

      {avisos.visiveis.length > 0 ? (
        <div className={estilos.avisos}>
          {avisos.visiveis.map((a, i) => (
            <Link
              key={`${a.severidade}-${i}`}
              href={a.href}
              className={`${estilos.aviso} ${CLASSE_DA_SEVERIDADE[a.severidade]}`}
            >
              <span>{ICONE_DA_SEVERIDADE[a.severidade]}</span>
              <span className={estilos.avisoTexto}>{a.texto}</span>
              <span className={estilos.avisoIr}>ver ›</span>
            </Link>
          ))}
          {avisos.ocultos > 0 ? (
            <div className={estilos.avisoMais}>
              + {avisos.ocultos} aviso{avisos.ocultos > 1 ? 's' : ''} de menor
              prioridade
            </div>
          ) : null}
        </div>
      ) : null}

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
                  : estaProximoDoLimite(c)
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
