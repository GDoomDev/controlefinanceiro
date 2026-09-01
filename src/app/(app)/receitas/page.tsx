import Link from 'next/link';

import {
  listarReceitas,
  listarReceitasPrevistas,
} from '@/dados/receitas';
import {
  competenciaDe,
  dataCivilEm,
  formatarDataCivil,
  somarMeses,
} from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';

import {
  acaoApagarReceita,
  acaoApagarReceitaPrevista,
  acaoCriarReceita,
  acaoCriarReceitaPrevista,
} from './acoes';
import estilos from './receitas.module.css';

export default async function Receitas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));
  const hoje = formatarDataCivil(dataCivilEm(new Date()));

  const [realizadas, previstas] = await Promise.all([
    listarReceitas(competencia),
    listarReceitasPrevistas(competencia),
  ]);

  const totalRealizado = realizadas.reduce((a, r) => a + r.valorCentavos, 0);
  const totalPrevisto = previstas.reduce((a, r) => a + r.valorCentavos, 0);

  return (
    <>
      <h1>Receitas</h1>

      <div className={estilos.meses}>
        <Link
          href={`/receitas?mes=${somarMeses(competencia, -1)}`}
          className={estilos.mesLink}
        >
          ‹ {somarMeses(competencia, -1)}
        </Link>
        <span className={estilos.mesAtual}>{competencia}</span>
        <Link
          href={`/receitas?mes=${somarMeses(competencia, 1)}`}
          className={estilos.mesLink}
        >
          {somarMeses(competencia, 1)} ›
        </Link>
      </div>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Recebido</div>
        <p className={estilos.explica}>O que de fato entrou neste mês.</p>

        <form action={acaoCriarReceita} className={estilos.form}>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="r-descricao">
              Descrição
            </label>
            <input
              id="r-descricao"
              name="descricao"
              required
              className={estilos.entrada}
              placeholder="Salário"
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="r-valor">
              Valor (R$)
            </label>
            <input
              id="r-valor"
              name="valor"
              required
              inputMode="decimal"
              className={estilos.entrada}
              placeholder="6090,00"
              style={{ width: 110 }}
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="r-data">
              Data
            </label>
            <input
              id="r-data"
              name="data"
              type="date"
              required
              defaultValue={hoje}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="r-metodo">
              Método
            </label>
            <select id="r-metodo" name="metodo" className={estilos.entrada}>
              <option value="PIX">Pix</option>
              <option value="DEBITO">Débito</option>
              <option value="DINHEIRO">Dinheiro</option>
              <option value="BOLETO">Boleto</option>
            </select>
          </div>
          <button type="submit" className={estilos.botao}>
            Registrar
          </button>
        </form>

        <div className={estilos.lista}>
          {realizadas.length === 0 ? (
            <div className={estilos.vazio}>Nenhuma receita registrada em {competencia}.</div>
          ) : (
            realizadas.map((r) => (
              <div key={r.id} className={estilos.item}>
                <span className={estilos.descricao}>
                  {r.descricao}
                  <div className={estilos.meta}>
                    {r.data} · {r.metodo}
                  </div>
                </span>
                <span className={estilos.valor}>{formatarBRL(r.valorCentavos)}</span>
                <form action={acaoApagarReceita}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className={estilos.apagar}>
                    apagar
                  </button>
                </form>
              </div>
            ))
          )}
        </div>

        {realizadas.length > 0 ? (
          <div className={estilos.total}>
            Total recebido: <strong>{formatarBRL(totalRealizado)}</strong>
          </div>
        ) : null}
      </section>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Previsto</div>
        <p className={estilos.explica}>
          Quanto você espera receber neste mês. É daqui que sai a projeção de
          quanto vai sobrar num mês que ainda não aconteceu.
        </p>

        <form action={acaoCriarReceitaPrevista} className={estilos.form}>
          <input type="hidden" name="competencia" value={competencia} />
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="p-descricao">
              Descrição
            </label>
            <input
              id="p-descricao"
              name="descricao"
              required
              className={estilos.entrada}
              placeholder="Salário"
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="p-valor">
              Valor (R$)
            </label>
            <input
              id="p-valor"
              name="valor"
              required
              inputMode="decimal"
              className={estilos.entrada}
              placeholder="6090,00"
              style={{ width: 110 }}
            />
          </div>
          <button type="submit" className={estilos.botao}>
            Prever
          </button>
        </form>

        <div className={estilos.lista}>
          {previstas.length === 0 ? (
            <div className={estilos.vazio}>
              Nenhuma previsão para {competencia}.
            </div>
          ) : (
            previstas.map((r) => (
              <div key={r.id} className={estilos.item}>
                <span className={estilos.descricao}>{r.descricao}</span>
                <span className={estilos.valor}>{formatarBRL(r.valorCentavos)}</span>
                <form action={acaoApagarReceitaPrevista}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className={estilos.apagar}>
                    apagar
                  </button>
                </form>
              </div>
            ))
          )}
        </div>

        {previstas.length > 0 ? (
          <div className={estilos.total}>
            Total previsto: <strong>{formatarBRL(totalPrevisto)}</strong>
          </div>
        ) : null}
      </section>
    </>
  );
}
