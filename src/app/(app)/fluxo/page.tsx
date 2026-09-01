import Link from 'next/link';

import { fluxoDeMeses } from '@/dados/fluxo';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { alturaDaColuna } from '@/dominio/fluxo';

import estilos from './fluxo.module.css';

/** Paleta divergente do spec, seção 8.3. O meio é neutro, nunca um matiz. */
const AZUL = '#2a78d6';
const VERMELHO = '#dc2626';
const NEUTRO = '#d1d5db';

function corDaSobra(valor: number): string {
  if (valor > 0) return AZUL;
  if (valor < 0) return VERMELHO;
  return NEUTRO;
}

const ROTULO_DO_MOMENTO = {
  PASSADO: 'realizado',
  CORRENTE: 'projeção do fechamento',
  FUTURO: 'projeção',
} as const;

export default async function Fluxo({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));

  const fluxo = await fluxoDeMeses(competencia);

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Fluxo</h1>
        <div className={estilos.meses}>
          <Link
            href={`/fluxo?mes=${somarMeses(competencia, -1)}`}
            className={estilos.mesLink}
          >
            ‹ {somarMeses(competencia, -1)}
          </Link>
          <span className={estilos.mesAtual}>{competencia}</span>
          <Link
            href={`/fluxo?mes=${somarMeses(competencia, 1)}`}
            className={estilos.mesLink}
          >
            {somarMeses(competencia, 1)} ›
          </Link>
        </div>
      </div>

      <p className={estilos.nota}>
        Seis meses para trás e seis para frente. Meses passados mostram o que de
        fato sobrou; o mês corrente e os futuros, a projeção do fechamento —
        listrados, para não se confundirem com o realizado.
      </p>

      <div className={estilos.grafico}>
        {fluxo.pontos.map((p) => {
          const altura = alturaDaColuna(p.sobraCentavos, fluxo.escalaCentavos);
          const cor = corDaSobra(p.sobraCentavos);
          const ehProjecao = p.momento !== 'PASSADO';
          const classeTextura = ehProjecao ? estilos.projetado : '';

          return (
            <div
              key={p.competencia}
              className={`${estilos.coluna} ${p.momento === 'CORRENTE' ? estilos.corrente : ''}`}
              title={`${p.competencia} · ${formatarBRL(p.sobraCentavos)} · ${ROTULO_DO_MOMENTO[p.momento]}`}
            >
              <div className={estilos.acima}>
                {p.sobraCentavos > 0 ? (
                  <div
                    className={`${estilos.barra} ${classeTextura}`}
                    style={{ height: `${altura}%`, backgroundColor: cor }}
                  />
                ) : p.sobraCentavos === 0 ? (
                  <div className={estilos.marcaZero} style={{ backgroundColor: cor }} />
                ) : null}
              </div>

              <div className={estilos.zero} />

              <div className={estilos.abaixo}>
                {p.sobraCentavos < 0 ? (
                  <div
                    className={`${estilos.barraNegativa} ${classeTextura}`}
                    style={{ height: `${altura}%`, backgroundColor: cor }}
                  />
                ) : null}
              </div>

              <div className={estilos.rotulo}>{p.competencia.slice(2)}</div>
            </div>
          );
        })}
      </div>

      <div className={estilos.legenda}>
        <span className={estilos.legendaItem}>
          <span className={estilos.amostra} style={{ backgroundColor: AZUL }} />
          sobra positiva
        </span>
        <span className={estilos.legendaItem}>
          <span className={estilos.amostra} style={{ backgroundColor: VERMELHO }} />
          sobra negativa
        </span>
        <span className={estilos.legendaItem}>
          <span className={estilos.amostra} style={{ backgroundColor: NEUTRO }} />
          sobra zero
        </span>
        <span className={estilos.legendaItem}>
          <span
            className={`${estilos.amostra} ${estilos.projetado}`}
            style={{ backgroundColor: AZUL }}
          />
          projeção (listrado)
        </span>
      </div>

      <table className={estilos.tabela}>
        <thead>
          <tr>
            <th>Mês</th>
            <th className={estilos.numero}>Receita</th>
            <th className={estilos.numero}>Despesa</th>
            <th className={estilos.numero}>Sobra</th>
          </tr>
        </thead>
        <tbody>
          {fluxo.pontos.map((p) => (
            <tr
              key={p.competencia}
              className={p.momento === 'CORRENTE' ? estilos.linhaCorrente : ''}
            >
              <td>
                {p.competencia}
                <span className={estilos.marca}>{ROTULO_DO_MOMENTO[p.momento]}</span>
              </td>
              <td className={estilos.numero}>{formatarBRL(p.receitaCentavos)}</td>
              <td className={estilos.numero}>{formatarBRL(p.despesaCentavos)}</td>
              <td
                className={`${estilos.numero} ${
                  p.sobraCentavos > 0
                    ? estilos.positivo
                    : p.sobraCentavos < 0
                      ? estilos.negativo
                      : estilos.neutro
                }`}
              >
                {formatarBRL(p.sobraCentavos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
