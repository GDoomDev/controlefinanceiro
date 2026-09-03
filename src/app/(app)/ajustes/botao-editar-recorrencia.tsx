'use client';

import { useRef } from 'react';

import type { Cartao } from '@/dados/cartoes';
import type { CategoriaComSubs } from '@/dados/categorias';
import type { RecorrenciaListada } from '@/dados/recorrentes';

import estilos from './ajustes.module.css';

export function BotaoEditarRecorrencia({
  recorrencia,
  categorias,
  cartoes,
  acao,
}: {
  recorrencia: RecorrenciaListada;
  categorias: CategoriaComSubs[];
  cartoes: Cartao[];
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
        <p>Editar despesa fixa</p>
        <form action={salvar} className={estilos.dialogoCampos}>
          <input type="hidden" name="id" value={recorrencia.id} />
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-descricao-${recorrencia.id}`}
            >
              Descrição
            </label>
            <input
              id={`rec-editar-descricao-${recorrencia.id}`}
              name="descricao"
              required
              defaultValue={recorrencia.descricao}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-valor-${recorrencia.id}`}
            >
              Valor
            </label>
            <input
              id={`rec-editar-valor-${recorrencia.id}`}
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={(recorrencia.valorCentavos / 100).toFixed(2)}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-dia-${recorrencia.id}`}
            >
              Dia do mês
            </label>
            <input
              id={`rec-editar-dia-${recorrencia.id}`}
              name="diaDoMes"
              type="number"
              min={1}
              max={31}
              required
              defaultValue={recorrencia.diaDoMes}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-sub-${recorrencia.id}`}
            >
              Subcategoria
            </label>
            <select
              id={`rec-editar-sub-${recorrencia.id}`}
              name="subcategoryId"
              defaultValue={recorrencia.subcategoryId}
              className={estilos.entrada}
            >
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
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-metodo-${recorrencia.id}`}
            >
              Método
            </label>
            <select
              id={`rec-editar-metodo-${recorrencia.id}`}
              name="metodo"
              defaultValue={recorrencia.metodo}
              className={estilos.entrada}
            >
              <option value="PIX">Pix</option>
              <option value="DEBITO">Débito</option>
              <option value="DINHEIRO">Dinheiro</option>
              <option value="BOLETO">Boleto</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-cartao-${recorrencia.id}`}
            >
              Cartão (se crédito)
            </label>
            <select
              id={`rec-editar-cartao-${recorrencia.id}`}
              name="cardId"
              defaultValue={recorrencia.cardId ?? ''}
              className={estilos.entrada}
            >
              <option value="">—</option>
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
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
