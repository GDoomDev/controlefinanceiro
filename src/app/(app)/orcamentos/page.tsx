import Link from 'next/link';

import { listarCategorias, slotsEmUso } from '@/dados/categorias';
import { orcamentosDoMes } from '@/dados/orcamentos';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { corDaCategoria } from '@/dominio/paleta';

import {
  acaoDefinirAlocacao,
  acaoRemoverAlocacao,
  acaoCriarCategoria,
  acaoExcluirCategoria,
  acaoEditarSubcategoria,
  acaoArquivarSubcategoria,
} from './acoes';
import { ListaCategorias } from './lista-categorias';
import estilos from './orcamentos.module.css';

export default async function Orcamentos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));

  const [orcamentos, categorias, ocupados] = await Promise.all([
    orcamentosDoMes(competencia),
    listarCategorias(),
    slotsEmUso(),
  ]);
  const total = orcamentos.reduce((a, o) => a + o.valorCentavos, 0);

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0 }}>Orçamentos</h1>
      </div>

      <ListaCategorias
        categoriasIniciais={categorias}
        ocupados={ocupados}
        acaoCriar={acaoCriarCategoria}
        acaoExcluir={acaoExcluirCategoria}
        acaoEditarSubcategoria={acaoEditarSubcategoria}
        acaoArquivarSubcategoria={acaoArquivarSubcategoria}
      />

      <div className={estilos.meses}>
        <Link
          href={`/orcamentos?mes=${somarMeses(competencia, -1)}`}
          className={estilos.mesLink}
        >
          ‹ {somarMeses(competencia, -1)}
        </Link>
        <span className={estilos.mesAtual}>{competencia}</span>
        <Link
          href={`/orcamentos?mes=${somarMeses(competencia, 1)}`}
          className={estilos.mesLink}
        >
          {somarMeses(competencia, 1)} ›
        </Link>
      </div>

      <p style={{ fontSize: 'var(--fonte-tamanho-corpo)', color: 'var(--cor-texto-secundario)', marginTop: 0, marginBottom: 'var(--espaco-4)' }}>
        Alterar um mês vale dele em diante, até a próxima mudança — meses
        anteriores não mudam.
      </p>

      {orcamentos.length === 0 ? (
        <div className={estilos.vazio}>
          Nenhum orçamento cadastrado. Crie um orçamento acima.
        </div>
      ) : (
        <>
          <div className={estilos.lista}>
            {orcamentos.map((o) => {
              const definidoAqui = o.vigenteDe === competencia;
              return (
                <div key={o.categoriaId} className={estilos.linha}>
                  <span
                    className={estilos.cor}
                    style={{ background: corDaCategoria(o) }}
                  />
                  <span className={estilos.nome}>{o.nome}</span>

                  <span className={estilos.origem}>
                    {o.vigenteDe === null ? (
                      'sem orçamento definido'
                    ) : definidoAqui ? (
                      <span className={estilos.definido}>definido neste mês</span>
                    ) : (
                      `herdado de ${o.vigenteDe}`
                    )}
                  </span>

                  <form action={acaoDefinirAlocacao} className={estilos.linha} style={{ padding: 0, gap: 8 }}>
                    <input type="hidden" name="budgetCategoryId" value={o.categoriaId} />
                    <input type="hidden" name="mes" value={competencia} />
                    <input
                      name="valor"
                      className={estilos.entrada}
                      inputMode="decimal"
                      defaultValue={(o.valorCentavos / 100).toFixed(2)}
                      aria-label={`Orçamento de ${o.nome} em ${competencia}`}
                    />
                    <button type="submit" className={estilos.botao}>
                      Salvar
                    </button>
                  </form>

                  {definidoAqui ? (
                    <form action={acaoRemoverAlocacao}>
                      <input type="hidden" name="budgetCategoryId" value={o.categoriaId} />
                      <input type="hidden" name="mes" value={competencia} />
                      <button type="submit" className={estilos.remover}>
                        voltar a herdar
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className={estilos.total}>
            Total orçado em {competencia}: <strong>{formatarBRL(total)}</strong>
          </div>
        </>
      )}
    </>
  );
}
