import { listarCategorias } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';

import { acaoCriarCartao, acaoCriarCategoria, acaoCriarSubcategoria } from './acoes';
import estilos from './ajustes.module.css';

/** Paleta do spec, seção 9 — validada para daltonismo nos dois temas. */
const CORES = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
];

export default async function Ajustes() {
  const [categorias, cartoes] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
  ]);

  return (
    <>
      <h1>Ajustes</h1>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Orçamentos</div>

        <form action={acaoCriarCategoria} className={estilos.linha}>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cat-nome">
              Nome
            </label>
            <input
              id="cat-nome"
              name="nome"
              required
              className={estilos.entrada}
              placeholder="Alimentação"
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cat-cor">
              Cor
            </label>
            <select id="cat-cor" name="corSlot" className={estilos.entrada}>
              {CORES.map((cor, i) => (
                <option key={cor} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={estilos.botao}>
            Criar orçamento
          </button>
        </form>

        <div className={estilos.lista}>
          {categorias.length === 0 ? (
            <div className={estilos.vazio}>Nenhum orçamento cadastrado ainda.</div>
          ) : (
            categorias.map((c) => (
              <div key={c.id} className={estilos.item}>
                <span
                  className={estilos.cor}
                  style={{ background: CORES[c.corSlot - 1] }}
                />
                <strong>{c.nome}</strong>
                <span className={estilos.subs}>
                  {c.subcategorias.length === 0
                    ? 'sem subcategorias'
                    : c.subcategorias.map((s) => s.nome).join(' · ')}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Subcategorias</div>
        {categorias.length === 0 ? (
          <div className={estilos.vazio}>Crie um orçamento primeiro.</div>
        ) : (
          <form action={acaoCriarSubcategoria} className={estilos.linha}>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="sub-cat">
                Orçamento
              </label>
              <select
                id="sub-cat"
                name="budgetCategoryId"
                className={estilos.entrada}
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="sub-nome">
                Nome
              </label>
              <input
                id="sub-nome"
                name="nome"
                required
                className={estilos.entrada}
                placeholder="Delivery"
              />
            </div>
            <button type="submit" className={estilos.botao}>
              Criar subcategoria
            </button>
          </form>
        )}
      </section>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Cartões</div>

        <form action={acaoCriarCartao} className={estilos.linha}>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cartao-nome">
              Nome
            </label>
            <input
              id="cartao-nome"
              name="nome"
              required
              className={estilos.entrada}
              placeholder="Nubank"
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cartao-fecha">
              Fecha dia
            </label>
            <input
              id="cartao-fecha"
              name="diaFechamento"
              type="number"
              min={1}
              max={31}
              required
              className={estilos.entrada}
              style={{ width: 80 }}
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cartao-vence">
              Vence dia
            </label>
            <input
              id="cartao-vence"
              name="diaVencimento"
              type="number"
              min={1}
              max={31}
              required
              className={estilos.entrada}
              style={{ width: 80 }}
            />
          </div>
          <button type="submit" className={estilos.botao}>
            Criar cartão
          </button>
        </form>

        <div className={estilos.lista}>
          {cartoes.length === 0 ? (
            <div className={estilos.vazio}>Nenhum cartão cadastrado ainda.</div>
          ) : (
            cartoes.map((c) => (
              <div key={c.id} className={estilos.item}>
                <strong>{c.nome}</strong>
                <span className={estilos.subs}>
                  fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
