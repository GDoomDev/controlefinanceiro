import { listarCategorias, slotsEmUso } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';
import { listarRecorrentes } from '@/dados/recorrentes';
import { formatarBRL } from '@/dominio/dinheiro';

import {
  acaoEditarCartao,
  acaoArquivarCartao,
  acaoCriarCartao,
  acaoCriarCategoria,
  acaoCriarSubcategoria,
  acaoCriarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
  acaoExcluirCategoria,
  acaoEditarSubcategoria,
  acaoArquivarSubcategoria,
} from './acoes';
import { ListaCategorias } from './lista-categorias';
import { ListaCartoes } from './lista-cartoes';
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

        {categorias.length === 0 ? (
          <div className={estilos.vazio}>Crie um orçamento primeiro.</div>
        ) : (
          <form action={acaoCriarRecorrencia} className={estilos.linha}>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-descricao">
                Descrição
              </label>
              <input
                id="rec-descricao"
                name="descricao"
                required
                className={estilos.entrada}
                placeholder="Streaming"
              />
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-valor">
                Valor
              </label>
              <input
                id="rec-valor"
                name="valor"
                type="number"
                step="0.01"
                min="0.01"
                required
                className={estilos.entrada}
                style={{ width: 90 }}
              />
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-dia">
                Dia do mês
              </label>
              <input
                id="rec-dia"
                name="diaDoMes"
                type="number"
                min={1}
                max={31}
                required
                className={estilos.entrada}
                style={{ width: 70 }}
              />
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-sub">
                Subcategoria
              </label>
              <select id="rec-sub" name="subcategoryId" className={estilos.entrada}>
                {categorias.flatMap((c) =>
                  c.subcategorias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {c.nome} — {s.nome}
                    </option>
                  )),
                )}
              </select>
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-metodo">
                Método
              </label>
              <select id="rec-metodo" name="metodo" className={estilos.entrada}>
                <option value="PIX">Pix</option>
                <option value="DEBITO">Débito</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="BOLETO">Boleto</option>
                <option value="CREDITO">Crédito</option>
              </select>
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-cartao">
                Cartão (se crédito)
              </label>
              <select id="rec-cartao" name="cardId" className={estilos.entrada}>
                <option value="">—</option>
                {cartoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-inicio">
                Início
              </label>
              <input
                id="rec-inicio"
                name="inicio"
                type="month"
                required
                className={estilos.entrada}
              />
            </div>
            <button type="submit" className={estilos.botao}>
              Criar despesa fixa
            </button>
          </form>
        )}

        <div className={estilos.lista}>
          {recorrentes.length === 0 ? (
            <div className={estilos.vazio}>Nenhuma despesa fixa cadastrada ainda.</div>
          ) : (
            recorrentes.map((r) => (
              <div key={r.id} className={estilos.item}>
                <div className={estilos.recorrenciaTopo}>
                  <span>
                    <strong className={r.ativa ? '' : estilos.pausada}>
                      {r.descricao}
                    </strong>
                    <span className={estilos.subs}>
                      {' '}
                      {formatarBRL(r.valorCentavos)} · dia {r.diaDoMes} ·{' '}
                      {r.categoriaNome} › {r.subcategoriaNome}
                      {r.cartaoNome ? ` · ${r.cartaoNome}` : ''}
                      {' · desde '}
                      {r.inicio}
                      {r.fim ? ` até ${r.fim}` : ''}
                      {r.ativa ? '' : ' · pausada'}
                    </span>
                  </span>

                  <div className={estilos.recorrenciaControles}>
                    <form action={acaoAlternarRecorrencia}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="ativa" value={r.ativa ? '1' : '0'} />
                      <button type="submit" className={estilos.botaoTexto}>
                        {r.ativa ? 'pausar' : 'retomar'}
                      </button>
                    </form>

                    <form
                      action={acaoEncerrarRecorrencia}
                      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                    >
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        type="month"
                        name="fim"
                        defaultValue={r.fim ?? undefined}
                        className={estilos.entradaPequena}
                      />
                      <button type="submit" className={estilos.botaoTexto}>
                        encerrar em
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
