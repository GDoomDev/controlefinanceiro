'use client';

import { useOptimistic, useRef } from 'react';

import type { Cartao } from '@/dados/cartoes';

import { BotaoEditarCartao } from './botao-editar-cartao';
import { BotaoExcluirCartao } from './botao-excluir-cartao';
import estilos from './ajustes.module.css';

export function ListaCartoes({
  cartoesIniciais,
  acao,
  acaoEditar,
  acaoExcluir,
}: {
  cartoesIniciais: Cartao[];
  acao: (dadosForm: FormData) => Promise<void>;
  acaoEditar: (dadosForm: FormData) => Promise<void>;
  acaoExcluir: (dadosForm: FormData) => Promise<void>;
}) {
  const [cartoes, adicionarOtimista] = useOptimistic(
    cartoesIniciais,
    (estado, novo: Cartao) => [...estado, novo],
  );
  const formRef = useRef<HTMLFormElement>(null);

  async function enviar(dadosForm: FormData) {
    adicionarOtimista({
      id: `otimista-${Date.now()}`,
      nome: String(dadosForm.get('nome') ?? ''),
      diaFechamento: Number(dadosForm.get('diaFechamento')),
      diaVencimento: Number(dadosForm.get('diaVencimento')),
      ativo: true,
    });
    formRef.current?.reset();
    await acao(dadosForm);
  }

  return (
    <>
      <form ref={formRef} action={enviar} className={estilos.linha}>
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
              {!c.id.startsWith('otimista-') && (
                <>
                  <BotaoEditarCartao cartao={c} acao={acaoEditar} />
                  <BotaoExcluirCartao cartaoId={c.id} cartaoNome={c.nome} acao={acaoExcluir} />
                </>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
