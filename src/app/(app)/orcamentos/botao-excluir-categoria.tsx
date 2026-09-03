'use client';

import { useRef } from 'react';

import estilos from './gestao.module.css';

/**
 * Botão + popup de confirmação, usando o elemento `<dialog>` nativo do HTML
 * (sem biblioteca nova). Só existe como Client Component porque abrir/fechar
 * um `<dialog>` via `.showModal()`/`.close()` exige uma referência de DOM —
 * o formulário de dentro do popup continua sendo uma Server Action comum.
 */
export function BotaoExcluirCategoria({
  categoriaId,
  categoriaNome,
  acao,
}: {
  categoriaId: string;
  categoriaNome: string;
  acao: (dadosForm: FormData) => Promise<void>;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={estilos.botaoPerigo}
        onClick={() => dialogoRef.current?.showModal()}
      >
        excluir
      </button>
      <dialog ref={dialogoRef} className={estilos.dialogo}>
        <p>
          Excluir <strong>{categoriaNome}</strong>?
        </p>
        <p className={estilos.dialogoAviso}>
          Isso arquiva o orçamento: ele some de novas escolhas (novos
          lançamentos, novos orçamentos, novas despesas fixas), mas nenhum
          lançamento, alocação ou histórico já existente é apagado ou muda de
          valor.
        </p>
        <form action={acao} className={estilos.dialogoBotoes}>
          <input type="hidden" name="id" value={categoriaId} />
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
