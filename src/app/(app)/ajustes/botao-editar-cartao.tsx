'use client';

import { useRef } from 'react';

import type { Cartao } from '@/dados/cartoes';

import estilos from './ajustes.module.css';

export function BotaoEditarCartao({
  cartao,
  acao,
}: {
  cartao: Cartao;
  acao: (dadosForm: FormData) => Promise<void>;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={estilos.botaoTexto}
        onClick={() => dialogoRef.current?.showModal()}
      >
        editar
      </button>
      <dialog ref={dialogoRef} className={estilos.dialogo}>
        <p>Editar cartão</p>
        <form action={acao} className={estilos.dialogoCampos}>
          <input type="hidden" name="id" value={cartao.id} />
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor={`cartao-editar-nome-${cartao.id}`}>
              Nome
            </label>
            <input
              id={`cartao-editar-nome-${cartao.id}`}
              name="nome"
              required
              defaultValue={cartao.nome}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`cartao-editar-fecha-${cartao.id}`}
            >
              Fecha dia
            </label>
            <input
              id={`cartao-editar-fecha-${cartao.id}`}
              name="diaFechamento"
              type="number"
              min={1}
              max={31}
              required
              defaultValue={cartao.diaFechamento}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`cartao-editar-vence-${cartao.id}`}
            >
              Vence dia
            </label>
            <input
              id={`cartao-editar-vence-${cartao.id}`}
              name="diaVencimento"
              type="number"
              min={1}
              max={31}
              required
              defaultValue={cartao.diaVencimento}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.dialogoBotoes}>
            <button
              type="button"
              className={estilos.botaoCancelar}
              onClick={() => dialogoRef.current?.close()}
            >
              Cancelar
            </button>
            <button type="submit" className={estilos.botao}>
              Salvar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
