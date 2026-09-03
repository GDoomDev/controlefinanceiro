'use client';

import { useRef } from 'react';

import estilos from './gestao.module.css';

/**
 * Botão + popup de edição, mesmo padrão do `<dialog>` nativo já usado por
 * `BotaoExcluirCategoria` — só que aqui o formulário tem um campo editável em
 * vez de só confirmar.
 */
export function BotaoEditarSubcategoria({
  subcategoriaId,
  nomeAtual,
  acao,
}: {
  subcategoriaId: string;
  nomeAtual: string;
  acao: (dadosForm: FormData) => Promise<void>;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  async function salvar(dadosForm: FormData) {
    await acao(dadosForm);
    dialogoRef.current?.close();
  }

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
        <p>Editar subcategoria</p>
        <form action={salvar} className={estilos.dialogoCampos}>
          <input type="hidden" name="id" value={subcategoriaId} />
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`sub-editar-nome-${subcategoriaId}`}
            >
              Nome
            </label>
            <input
              id={`sub-editar-nome-${subcategoriaId}`}
              name="nome"
              required
              defaultValue={nomeAtual}
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
