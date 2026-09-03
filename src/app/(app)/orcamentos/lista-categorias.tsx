'use client';

import { useOptimistic, useRef } from 'react';

import type { CategoriaComSubs } from '@/dados/categorias';
import { corDaCategoria } from '@/dominio/paleta';

import { BotaoExcluirCategoria } from './botao-excluir-categoria';
import { BotaoEditarSubcategoria } from './botao-editar-subcategoria';
import { BotaoExcluirSubcategoria } from './botao-excluir-subcategoria';
import { SeletorDeCor, type SlotOcupadoProp } from './seletor-de-cor';
import estilos from './gestao.module.css';

export function ListaCategorias({
  categoriasIniciais,
  ocupados,
  acaoCriar,
  acaoExcluir,
  acaoEditarSubcategoria,
  acaoArquivarSubcategoria,
}: {
  categoriasIniciais: CategoriaComSubs[];
  ocupados: SlotOcupadoProp[];
  acaoCriar: (dadosForm: FormData) => Promise<void>;
  acaoExcluir: (dadosForm: FormData) => Promise<void>;
  acaoEditarSubcategoria: (dadosForm: FormData) => Promise<void>;
  acaoArquivarSubcategoria: (dadosForm: FormData) => Promise<void>;
}) {
  const [categorias, adicionarOtimista] = useOptimistic(
    categoriasIniciais,
    (estado, nova: CategoriaComSubs) => [...estado, nova],
  );
  const formRef = useRef<HTMLFormElement>(null);

  async function enviar(dadosForm: FormData) {
    const corSlotBruto = String(dadosForm.get('corSlot') ?? '');
    const corPersonalizadaBruta = String(dadosForm.get('corPersonalizada') ?? '');
    adicionarOtimista({
      id: `otimista-${Date.now()}`,
      nome: String(dadosForm.get('nome') ?? ''),
      ordem: categorias.length + 1,
      corSlot: corSlotBruto ? Number(corSlotBruto) : null,
      corPersonalizada: corPersonalizadaBruta || null,
      arquivada: false,
      subcategorias: [],
    });
    formRef.current?.reset();
    await acaoCriar(dadosForm);
  }

  return (
    <>
      <form ref={formRef} action={enviar} className={estilos.linha}>
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
        <SeletorDeCor key={ocupados.length} ocupados={ocupados} />
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
                style={{ background: corDaCategoria(c) }}
              />
              <strong>{c.nome}</strong>
              <span className={estilos.subs}>
                {c.subcategorias.length === 0 ? (
                  'sem subcategorias'
                ) : (
                  <span className={estilos.subLista}>
                    {c.subcategorias.map((s) => (
                      <span key={s.id} className={estilos.subItem}>
                        {s.nome}
                        <BotaoEditarSubcategoria
                          subcategoriaId={s.id}
                          nomeAtual={s.nome}
                          acao={acaoEditarSubcategoria}
                        />
                        <BotaoExcluirSubcategoria
                          subcategoriaId={s.id}
                          subcategoriaNome={s.nome}
                          acao={acaoArquivarSubcategoria}
                        />
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <BotaoExcluirCategoria
                categoriaId={c.id}
                categoriaNome={c.nome}
                acao={acaoExcluir}
              />
            </div>
          ))
        )}
      </div>
    </>
  );
}
