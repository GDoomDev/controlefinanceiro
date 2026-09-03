import { listarCategorias, slotsEmUso } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';
import { listarRecorrentes } from '@/dados/recorrentes';

import {
  acaoEditarCartao,
  acaoArquivarCartao,
  acaoCriarCartao,
  acaoCriarCategoria,
  acaoCriarSubcategoria,
  acaoCriarRecorrencia,
  acaoEditarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
  acaoExcluirCategoria,
  acaoEditarSubcategoria,
  acaoArquivarSubcategoria,
} from './acoes';
import { ListaCategorias } from './lista-categorias';
import { ListaCartoes } from './lista-cartoes';
import { ListaRecorrentes } from './lista-recorrentes';
import estilos from './ajustes.module.css';

export default async function Ajustes() {
  const [categorias, cartoes, recorrentes, ocupados] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
    listarRecorrentes(),
    slotsEmUso(),
  ]);

  return (
    <>
      <h1>Ajustes</h1>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Orçamentos</div>

        <ListaCategorias
          categoriasIniciais={categorias}
          ocupados={ocupados}
          acaoCriar={acaoCriarCategoria}
          acaoExcluir={acaoExcluirCategoria}
          acaoEditarSubcategoria={acaoEditarSubcategoria}
          acaoArquivarSubcategoria={acaoArquivarSubcategoria}
        />


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
        <ListaCartoes
          cartoesIniciais={cartoes}
          acao={acaoCriarCartao}
          acaoEditar={acaoEditarCartao}
          acaoExcluir={acaoArquivarCartao}
        />
      </section>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Despesas fixas</div>

        <ListaRecorrentes
          recorrentesIniciais={recorrentes}
          categorias={categorias}
          cartoes={cartoes}
          acaoCriar={acaoCriarRecorrencia}
          acaoEditar={acaoEditarRecorrencia}
          acaoAlternar={acaoAlternarRecorrencia}
          acaoEncerrar={acaoEncerrarRecorrencia}
        />
      </section>
    </>
  );
}
