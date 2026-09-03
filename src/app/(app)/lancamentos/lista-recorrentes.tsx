'use client';

import { useOptimistic, useRef } from 'react';

import type { Cartao } from '@/dados/cartoes';
import type { CategoriaComSubs } from '@/dados/categorias';
import type { RecorrenciaListada } from '@/dados/recorrentes';
import { emCentavos, formatarBRL } from '@/dominio/dinheiro';
import type { MetodoPagamento } from '@/dominio/lancamento';

import { BotaoEditarRecorrencia } from './botao-editar-recorrencia';
import estilos from './gestao.module.css';

/**
 * Escrita otimista: a despesa fixa aparece na lista assim que o formulário é
 * enviado. Nome da categoria/subcategoria/cartão vem de busca local nas
 * listas já carregadas (`categorias`, `cartoes`) — nenhuma consulta nova.
 * Pausar/retomar/encerrar continuam sem mudança (não eram o ponto lento).
 */
export function ListaRecorrentes({
  recorrentesIniciais,
  categorias,
  cartoes,
  acaoCriar,
  acaoEditar,
  acaoAlternar,
  acaoEncerrar,
}: {
  recorrentesIniciais: RecorrenciaListada[];
  categorias: CategoriaComSubs[];
  cartoes: Cartao[];
  acaoCriar: (dadosForm: FormData) => Promise<void>;
  acaoEditar: (dadosForm: FormData) => Promise<void>;
  acaoAlternar: (dadosForm: FormData) => Promise<void>;
  acaoEncerrar: (dadosForm: FormData) => Promise<void>;
}) {
  const [recorrentes, adicionarOtimista] = useOptimistic(
    recorrentesIniciais,
    (estado, nova: RecorrenciaListada) => [...estado, nova],
  );
  const formRef = useRef<HTMLFormElement>(null);

  async function enviar(dadosForm: FormData) {
    const subcategoryId = String(dadosForm.get('subcategoryId') ?? '');
    const cardIdBruto = String(dadosForm.get('cardId') ?? '');
    const metodo = String(dadosForm.get('metodo') ?? 'PIX') as MetodoPagamento;

    // Mesmas duas listas já carregadas pela página — a subcategoria escolhida
    // sempre existe em uma delas, porque é o próprio <select> que as ofereceu.
    let budgetCategoryId = '';
    let categoriaNome = '';
    let subcategoriaNome = '';
    for (const c of categorias) {
      const sub = c.subcategorias.find((s) => s.id === subcategoryId);
      if (sub) {
        budgetCategoryId = c.id;
        categoriaNome = c.nome;
        subcategoriaNome = sub.nome;
        break;
      }
    }
    const cardId = metodo === 'CREDITO' && cardIdBruto ? cardIdBruto : null;
    const cartaoNome = cardId ? (cartoes.find((c) => c.id === cardId)?.nome ?? null) : null;

    adicionarOtimista({
      id: `otimista-${Date.now()}`,
      descricao: String(dadosForm.get('descricao') ?? ''),
      valorCentavos: emCentavos(Number(dadosForm.get('valor') ?? 0)),
      diaDoMes: Number(dadosForm.get('diaDoMes')),
      budgetCategoryId,
      subcategoryId,
      metodo,
      cardId,
      cartaoNome,
      categoriaNome,
      subcategoriaNome,
      inicio: String(dadosForm.get('inicio') ?? ''),
      fim: null,
      ativa: true,
    });
    formRef.current?.reset();
    await acaoCriar(dadosForm);
  }

  return (
    <>
      {categorias.length === 0 ? (
        <div className={estilos.vazio}>Crie um orçamento primeiro.</div>
      ) : (
        <form ref={formRef} action={enviar} className={estilos.linha}>
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
                  {!r.id.startsWith('otimista-') && (
                    <BotaoEditarRecorrencia
                      recorrencia={r}
                      categorias={categorias}
                      cartoes={cartoes}
                      acao={acaoEditar}
                    />
                  )}
                  <form action={acaoAlternar}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="ativa" value={r.ativa ? '1' : '0'} />
                    <button type="submit" className={estilos.botaoTexto}>
                      {r.ativa ? 'pausar' : 'retomar'}
                    </button>
                  </form>

                  <form
                    action={acaoEncerrar}
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
    </>
  );
}
