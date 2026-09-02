import type { ReembolsoListado } from '@/dados/reembolsos';
import { listarReembolsos } from '@/dados/reembolsos';
import {
  competenciaDe,
  dataCivilEm,
  formatarDataCivil,
  lerDataCivil,
} from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import type { EstadoReembolso } from '@/dominio/reembolso';

import { acaoRegistrarRecebimento } from './acoes';
import estilos from './reembolsos.module.css';

const CLASSE_DO_ESTADO: Record<EstadoReembolso, string> = {
  PENDENTE: estilos.pendente,
  PARCIAL: estilos.parcial,
  QUITADO: estilos.quitado,
  NAO_REEMBOLSAVEL: estilos.pendente,
};

const TEXTO_DO_ESTADO: Record<EstadoReembolso, string> = {
  PENDENTE: 'pendente',
  PARCIAL: 'parcial',
  QUITADO: 'quitado',
  NAO_REEMBOLSAVEL: 'não reembolsável',
};

/** O aviso azul do Painel dispara neste mesmo limiar (spec, seção 8.1). */
const DIAS_PARA_DESTACAR = 30;

function Historico({ r }: { r: ReembolsoListado }) {
  if (r.recebimentos.length === 0) return null;

  return (
    <div className={estilos.recebimentos}>
      {r.recebimentos.map((rec, i) => (
        <div key={`${rec.recebidoEm}-${i}`} className={estilos.recebimento}>
          <span>{formatarBRL(rec.valorCentavos)}</span>
          <span>recebido em {rec.recebidoEm}</span>
          {/* O mês corrigido: o crédito vale na competência da despesa, não na
              do recebimento (spec, seção 6.1). Mostrar isso é o que torna
              visível que outubro mexeu em setembro. */}
          {rec.competenciaCredito !== competenciaDe(lerDataCivil(rec.recebidoEm)) ? (
            <span className={estilos.corrigido}>
              · corrigiu {rec.competenciaCredito}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default async function Reembolsos() {
  const { pendentes, quitados } = await listarReembolsos();
  const hoje = formatarDataCivil(dataCivilEm(new Date()));
  const totalPendente = pendentes.reduce((a, r) => a + r.pendenteCentavos, 0);

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Reembolsos</h1>
        <div style={{ textAlign: 'right' }}>
          <div className={estilos.totalRotulo}>Total a receber</div>
          <div className={estilos.total}>{formatarBRL(totalPendente)}</div>
        </div>
      </div>

      <p className={estilos.nota}>
        O reembolso não muda a fatura do cartão — aquele dinheiro saiu mesmo.
        Ele abate o orçamento e a sobra do mês da despesa, qualquer que seja a
        data em que você recebeu.
      </p>

      <div className={estilos.titulo}>A receber</div>

      {pendentes.length === 0 ? (
        <div className={estilos.vazio}>
          Ninguém te deve nada. Para marcar uma despesa como reembolsável,
          preencha &ldquo;a reembolsar&rdquo; ao criar o lançamento.
        </div>
      ) : (
        pendentes.map((r) => (
          <div key={r.transactionId} className={estilos.item}>
            <div className={estilos.itemTopo}>
              <div>
                <span className={estilos.descricao}>{r.descricao}</span>
                {r.parcelaTotal > 1 ? (
                  <span className={estilos.meta}>
                    parcela {r.parcelaNum}/{r.parcelaTotal}
                  </span>
                ) : null}
                <span className={estilos.meta}>
                  {r.categoriaNome} › {r.subcategoriaNome}
                </span>
              </div>
              <div>
                <span className={estilos.pendenteValor}>
                  {formatarBRL(r.pendenteCentavos)}
                </span>
                <span className={estilos.pendenteRotulo}>a receber</span>
              </div>
            </div>

            <div className={estilos.numeros}>
              <span className={`${estilos.etiqueta} ${CLASSE_DO_ESTADO[r.estado]}`}>
                {TEXTO_DO_ESTADO[r.estado]}
              </span>
              <span>gasto {formatarBRL(r.valorCentavos)}</span>
              <span>alvo {formatarBRL(r.alvoCentavos)}</span>
              <span>recebido {formatarBRL(r.recebidoCentavos)}</span>
              <span>{r.data}</span>
              <span className={r.diasParado > DIAS_PARA_DESTACAR ? estilos.parado : ''}>
                há {r.diasParado} dia{r.diasParado === 1 ? '' : 's'}
              </span>
            </div>

            <Historico r={r} />

            {/* Preenchido com o valor pendente (spec, seção 6.1): confirmar o
                valor cheio quita; um valor menor registra o parcial e o
                reembolso continua aberto pelo restante. */}
            <form action={acaoRegistrarRecebimento} className={estilos.formulario}>
              <input type="hidden" name="transactionId" value={r.transactionId} />
              <div className={estilos.campo}>
                <label className={estilos.rotulo} htmlFor={`valor-${r.transactionId}`}>
                  Valor recebido
                </label>
                <input
                  id={`valor-${r.transactionId}`}
                  className={estilos.entrada}
                  name="valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(r.pendenteCentavos / 100).toFixed(2)}
                  defaultValue={(r.pendenteCentavos / 100).toFixed(2)}
                  required
                  style={{ width: 110 }}
                />
              </div>
              <div className={estilos.campo}>
                <label className={estilos.rotulo} htmlFor={`data-${r.transactionId}`}>
                  Recebido em
                </label>
                <input
                  id={`data-${r.transactionId}`}
                  className={estilos.entrada}
                  name="recebidoEm"
                  type="date"
                  defaultValue={hoje}
                  required
                />
              </div>
              <button type="submit" className={estilos.receber}>
                Registrar recebimento
              </button>
            </form>
          </div>
        ))
      )}

      {quitados.length > 0 ? (
        <>
          <div className={estilos.titulo}>Já recebidos</div>
          {quitados.map((r) => (
            <div
              key={r.transactionId}
              className={`${estilos.item} ${estilos.itemQuitado}`}
            >
              <div className={estilos.itemTopo}>
                <div>
                  <span className={estilos.descricao}>{r.descricao}</span>
                  <span className={estilos.meta}>
                    {r.categoriaNome} › {r.subcategoriaNome}
                  </span>
                </div>
                <span className={estilos.pendenteValor}>
                  {formatarBRL(r.recebidoCentavos)}
                </span>
              </div>
              <div className={estilos.numeros}>
                <span className={`${estilos.etiqueta} ${estilos.quitado}`}>quitado</span>
                <span>gasto {formatarBRL(r.valorCentavos)}</span>
                <span>{r.data}</span>
              </div>
              <Historico r={r} />
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
