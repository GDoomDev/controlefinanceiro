'use client';

import { useRef } from 'react';

import estilos from './gestao.module.css';

export function BotaoExcluirSubcategoria({
  subcategoriaId,
  subcategoriaNome,
  acao,
}: {
  subcategoriaId: string;
  subcategoriaNome: string;
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
        excluir
      </button>
      <dialog ref={dialogoRef} className={estilos.dialogo}>
        <p>
          Excluir <strong>{subcategoriaNome}</strong>?
        </p>
        <p className={estilos.dialogoAviso}>
          Isso arquiva a subcategoria: ela some de novas escolhas (novos
          lançamentos, novas despesas fixas), mas nenhum lançamento ou
          histórico já existente é apagado ou muda de valor.
        </p>
        <form action={acao} className={estilos.dialogoBotoes}>
          <input type="hidden" name="id" value={subcategoriaId} />
          <button
            type="button"
            className={estilos.botaoCancelar}
            onClick={() => dialogoRef.current?.close()}
          >
            Cancelar
          </button>
          <button type="submit" className={estilos.botaoConfirmarExclusao}>
            Confirmar exclusão
          </button>
        </form>
      </dialog>
    </>
  );
}
