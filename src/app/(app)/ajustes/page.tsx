import { listarCategorias } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';
import { listarRecorrentes } from '@/dados/recorrentes';

import {
  acaoEditarCartao,
  acaoArquivarCartao,
  acaoCriarCartao,
  acaoCriarRecorrencia,
  acaoEditarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
} from './acoes';
import { ListaCartoes } from './lista-cartoes';
import { ListaRecorrentes } from './lista-recorrentes';
import estilos from './ajustes.module.css';

export default async function Ajustes() {
  const [categorias, cartoes, recorrentes] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
    listarRecorrentes(),
  ]);

  return (
    <>
      <h1>Ajustes</h1>

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
