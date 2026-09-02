'use client';

import { useMemo, useState } from 'react';

import type { AlvoDoEstorno } from '@/dados/estorno';
import { formatarBRL } from '@/dominio/dinheiro';
import {
  type ModoCredito,
  planejarEstorno,
  resumirPlanoEstorno,
} from '@/dominio/reembolso';

import { acaoEstornar } from './acoes';
import estilos from './estorno.module.css';

function faixa(competencias: string[]): string {
  if (competencias.length === 0) return '';
  if (competencias.length === 1) return competencias[0];
  return `${competencias[0]} a ${competencias[competencias.length - 1]}`;
}

export function FormularioEstorno({
  alvo,
  competenciaPadrao,
  hoje,
}: {
  alvo: AlvoDoEstorno;
  competenciaPadrao: string;
  hoje: string;
}) {
  const [parcial, setParcial] = useState(false);
  const [modo, setModo] = useState<ModoCredito>('UNICO');
  const [competencia, setCompetencia] = useState(competenciaPadrao);
  const [valor, setValor] = useState(
    (alvo.valorTotalCentavos / 100).toFixed(2),
  );

  // A mesma função que o servidor roda na gravação — por isso a prévia nunca
  // diverge do que acontece de fato (spec, seção 8.5).
  const resumo = useMemo(
    () => resumirPlanoEstorno(planejarEstorno(alvo.parcelas, modo, competencia), alvo.parcelas),
    [alvo.parcelas, modo, competencia],
  );

  const valorParcial = Math.round(Number(valor || 0) * 100);

  return (
    <form action={acaoEstornar}>
      <input type="hidden" name="transactionId" value={alvo.transactionId} />
      <input type="hidden" name="parcial" value={parcial ? 'sim' : 'nao'} />
      <input type="hidden" name="modo" value={modo} />

      <div className={estilos.secao}>
        <span className={estilos.rotulo}>O que foi devolvido</span>
        <div className={estilos.chips}>
          <button
            type="button"
            onClick={() => setParcial(false)}
            className={`${estilos.chip} ${!parcial ? estilos.chipAtivo : ''}`}
          >
            A compra inteira
          </button>
          <button
            type="button"
            onClick={() => setParcial(true)}
            className={`${estilos.chip} ${parcial ? estilos.chipAtivo : ''}`}
          >
            Só uma parte
          </button>
        </div>
      </div>

      {parcial ? (
        <div className={estilos.secao}>
          <span className={estilos.rotulo}>Valor devolvido</span>
          <input
            className={estilos.entrada}
            name="valor"
            type="number"
            step="0.01"
            min="0.01"
            max={(alvo.valorTotalCentavos / 100).toFixed(2)}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
            style={{ width: 130 }}
          />
        </div>
      ) : (
        <div className={estilos.secao}>
          <span className={estilos.rotulo}>Como a operadora devolveu</span>
          <div className={estilos.chips}>
            <button
              type="button"
              onClick={() => setModo('UNICO')}
              className={`${estilos.chip} ${modo === 'UNICO' ? estilos.chipAtivo : ''}`}
            >
              Crédito único
            </button>
            <button
              type="button"
              onClick={() => setModo('POR_FATURA')}
              className={`${estilos.chip} ${modo === 'POR_FATURA' ? estilos.chipAtivo : ''}`}
            >
              Por fatura
            </button>
          </div>
        </div>
      )}

      <div className={estilos.linha} style={{ marginBottom: 18 }}>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="competenciaCredito">
            Competência do crédito
          </label>
          <input
            id="competenciaCredito"
            className={estilos.entrada}
            name="competenciaCredito"
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            required
          />
        </div>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="recebidoEm">
            Data do estorno
          </label>
          <input
            id="recebidoEm"
            className={estilos.entrada}
            name="recebidoEm"
            type="date"
            defaultValue={hoje}
            required
          />
        </div>
      </div>

      <div className={estilos.previa}>
        <div className={estilos.previaTitulo}>O que vai acontecer</div>

        {parcial ? (
          <div>
            <b>{formatarBRL(valorParcial)}</b> viram crédito em{' '}
            <b>{competencia}</b>. Nenhuma parcela é cancelada — a compra segue
            sendo cobrada normalmente.
          </div>
        ) : (
          <>
            {resumo.creditadas.quantidade > 0 ? (
              <div className={estilos.creditadas}>
                <b>
                  {resumo.creditadas.quantidade} parcela
                  {resumo.creditadas.quantidade > 1 ? 's' : ''} já cobrada
                  {resumo.creditadas.quantidade > 1 ? 's' : ''}
                </b>{' '}
                ({faixa(resumo.creditadas.competencias)}) vira
                {resumo.creditadas.quantidade > 1 ? 'm' : ''} crédito de{' '}
                <b>{formatarBRL(resumo.creditadas.valorCentavos)}</b> em{' '}
                <b>{faixa(resumo.competenciasDeCredito)}</b>
              </div>
            ) : null}

            {resumo.canceladas.quantidade > 0 ? (
              <div className={estilos.canceladas}>
                <b>
                  {resumo.canceladas.quantidade} parcela
                  {resumo.canceladas.quantidade > 1 ? 's' : ''} ainda não cobrada
                  {resumo.canceladas.quantidade > 1 ? 's' : ''}
                </b>{' '}
                ({faixa(resumo.canceladas.competencias)}){' '}
                {resumo.canceladas.quantidade > 1 ? 'são canceladas' : 'é cancelada'} —
                libera<b> {formatarBRL(resumo.canceladas.valorCentavos)}</b> da
                projeção
              </div>
            ) : null}
          </>
        )}
      </div>

      <button type="submit" className={estilos.confirmar}>
        Confirmar estorno
      </button>

      <p className={estilos.aviso}>
        As parcelas canceladas continuam no banco, marcadas como canceladas — o
        histórico segue explicando por que a compra saiu da projeção.
      </p>
    </form>
  );
}
