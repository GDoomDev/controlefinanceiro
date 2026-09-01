'use client';

import { useMemo, useState } from 'react';

import { dataCivilEm, formatarDataCivil, lerDataCivil } from '@/dominio/data';
import { emCentavos, formatarBRL } from '@/dominio/dinheiro';
import { type MetodoPagamento, planejarLancamento } from '@/dominio/lancamento';

import { acaoCriarLancamento } from './acoes';
import estilos from './formulario.module.css';

export interface CategoriaOpcao {
  id: string;
  nome: string;
  subcategorias: Array<{ id: string; nome: string }>;
}

export interface CartaoOpcao {
  id: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
}

const METODOS: MetodoPagamento[] = [
  'CREDITO',
  'PIX',
  'DEBITO',
  'DINHEIRO',
  'BOLETO',
];

const ROTULO_METODO: Record<MetodoPagamento, string> = {
  CREDITO: 'Crédito',
  PIX: 'Pix',
  DEBITO: 'Débito',
  DINHEIRO: 'Dinheiro',
  BOLETO: 'Boleto',
};

/** Hoje em São Paulo, via domínio — não reimplemente o fuso aqui. */
function hojeEmTexto(): string {
  return formatarDataCivil(dataCivilEm(new Date()));
}

export function FormularioLancamento({
  categorias,
  cartoes,
}: {
  categorias: CategoriaOpcao[];
  cartoes: CartaoOpcao[];
}) {
  const [valorTexto, setValorTexto] = useState('');
  const [data, setData] = useState(hojeEmTexto());
  const [metodo, setMetodo] = useState<MetodoPagamento>('CREDITO');
  const [cardId, setCardId] = useState(cartoes[0]?.id ?? '');
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? '');
  const [parcelas, setParcelas] = useState(1);

  const categoria = categorias.find((c) => c.id === categoriaId);
  const cartao = cartoes.find((c) => c.id === cardId);

  const valorCentavos = useMemo(() => {
    const numero = Number(valorTexto.replace(',', '.'));
    return Number.isFinite(numero) && numero > 0 ? emCentavos(numero) : 0;
  }, [valorTexto]);

  // A MESMA função pura que o servidor usa para gravar. É por isso que a
  // prévia nunca diverge do que é persistido.
  const previa = useMemo(() => {
    if (valorCentavos <= 0) return null;
    try {
      const regra = cartao
        ? { diaFechamento: cartao.diaFechamento, diaVencimento: cartao.diaVencimento }
        : null;
      return {
        plano: planejarLancamento(
          {
            valorCentavos,
            data: lerDataCivil(data),
            metodo,
            parcelas: metodo === 'CREDITO' ? parcelas : 1,
          },
          regra,
        ),
        erro: null as string | null,
      };
    } catch (e) {
      return { plano: null, erro: e instanceof Error ? e.message : 'Erro' };
    }
  }, [valorCentavos, data, metodo, parcelas, cartao]);

  const podeEnviar =
    valorCentavos > 0 &&
    categoria !== undefined &&
    previa?.plano != null &&
    (metodo !== 'CREDITO' || cartao !== undefined);

  return (
    <form action={acaoCriarLancamento} className={estilos.form}>
      <input type="hidden" name="valorCentavos" value={valorCentavos} />
      <input type="hidden" name="metodo" value={metodo} />
      <input type="hidden" name="cardId" value={metodo === 'CREDITO' ? cardId : ''} />
      <input
        type="hidden"
        name="parcelas"
        value={metodo === 'CREDITO' ? parcelas : 1}
      />

      <div className={estilos.dupla}>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="valor">
            Valor (R$)
          </label>
          <input
            id="valor"
            className={estilos.entrada}
            inputMode="decimal"
            placeholder="20,00"
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
          />
        </div>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="data">
            Data
          </label>
          <input
            id="data"
            name="data"
            type="date"
            className={estilos.entrada}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="descricao">
          Descrição
        </label>
        <input
          id="descricao"
          name="descricao"
          required
          className={estilos.entrada}
          placeholder="iFood"
        />
      </div>

      <div className={estilos.dupla}>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="categoria">
            Orçamento
          </label>
          <select
            id="categoria"
            name="budgetCategoryId"
            className={estilos.entrada}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="subcategoria">
            Subcategoria
          </label>
          <select
            id="subcategoria"
            name="subcategoryId"
            className={estilos.entrada}
          >
            {(categoria?.subcategorias ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={estilos.campo}>
        <span className={estilos.rotulo}>Método</span>
        <div className={estilos.chips}>
          {METODOS.map((m) => (
            <button
              key={m}
              type="button"
              className={`${estilos.chip} ${m === metodo ? estilos.chipAtivo : ''}`}
              onClick={() => {
                setMetodo(m);
                if (m !== 'CREDITO') setParcelas(1);
              }}
            >
              {ROTULO_METODO[m]}
            </button>
          ))}
        </div>
      </div>

      {metodo === 'CREDITO' && (
        <div className={estilos.dupla}>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cartao">
              Cartão
            </label>
            <select
              id="cartao"
              className={estilos.entrada}
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
            >
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="parcelas">
              Parcelas
            </label>
            <input
              id="parcelas"
              type="number"
              min={1}
              max={24}
              className={estilos.entrada}
              value={parcelas}
              onChange={(e) => setParcelas(Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>
      )}

      <label className={estilos.linhaCheck}>
        <input type="checkbox" name="reembolsavel" value="1" />
        A reembolsar (alguém vai me pagar de volta)
      </label>

      {previa?.erro ? (
        <div className={estilos.erro}>{previa.erro}</div>
      ) : previa?.plano ? (
        <div className={estilos.rodape}>
          <Previa plano={previa.plano} cartaoNome={cartao?.nome ?? null} />
        </div>
      ) : (
        <div className={`${estilos.rodape} ${estilos.rodapeVazio}`}>
          Informe o valor para ver em que mês este lançamento cai.
        </div>
      )}

      <button type="submit" className={estilos.enviar} disabled={!podeEnviar}>
        Salvar lançamento
      </button>
    </form>
  );
}

function Previa({
  plano,
  cartaoNome,
}: {
  plano: ReturnType<typeof planejarLancamento>;
  cartaoNome: string | null;
}) {
  const primeira = plano[0];
  const ultima = plano[plano.length - 1];

  if (plano.length === 1) {
    return (
      <>
        Cai em <strong>{primeira.competencia}</strong>
        {primeira.fatura && cartaoNome ? (
          <>
            {' '}
            · fatura {cartaoNome}, fecha{' '}
            {formatarDataCivil(primeira.fatura.fechamento)} e vence{' '}
            {formatarDataCivil(primeira.fatura.vencimento)}
          </>
        ) : null}
      </>
    );
  }

  return (
    <>
      <strong>
        {plano.length}x de {formatarBRL(plano[1].valorCentavos)}
      </strong>
      {plano[0].valorCentavos !== plano[1].valorCentavos ? (
        <> (a primeira de {formatarBRL(plano[0].valorCentavos)})</>
      ) : null}
      , de <strong>{primeira.competencia}</strong> a{' '}
      <strong>{ultima.competencia}</strong>
      {cartaoNome ? <> · fatura {cartaoNome}</> : null}
    </>
  );
}
