'use client';

import { useState } from 'react';

import { CORES } from '@/dominio/paleta';
import estilos from './gestao.module.css';

export interface SlotOcupadoProp {
  slot: number;
  categoriaNome: string;
}

/**
 * Catálogo visual das 6 cores validadas (spec original, seção 9), mais um
 * botão de cor personalizada. Só existe como Client Component porque alternar
 * entre "qual dos 6 slots" e "cor livre" é estado de interface pura — nenhum
 * dado de servidor entra nessa decisão.
 *
 * Os dois campos escondidos (`corSlot`, `corPersonalizada`) são o que o
 * formulário pai de fato envia: exatamente um deles carrega valor a cada
 * envio, o outro fica com string vazia — a Server Action converte string
 * vazia em `null`.
 */
export function SeletorDeCor({ ocupados }: { ocupados: SlotOcupadoProp[] }) {
  const primeiroLivre = CORES.findIndex(
    (_, i) => !ocupados.some((o) => o.slot === i + 1),
  );
  const [escolha, setEscolha] = useState<number | 'personalizada'>(
    primeiroLivre === -1 ? 'personalizada' : primeiroLivre + 1,
  );
  const [corHex, setCorHex] = useState('#2a78d6');

  return (
    <div className={estilos.campo}>
      <span className={estilos.rotulo}>Cor</span>
      <div className={estilos.catalogoCores}>
        {CORES.map((cor, i) => {
          const slot = i + 1;
          const ocupadoPor = ocupados.find((o) => o.slot === slot);
          return (
            <button
              key={slot}
              type="button"
              disabled={Boolean(ocupadoPor)}
              onClick={() => setEscolha(slot)}
              className={`${estilos.swatch} ${escolha === slot ? estilos.swatchAtivo : ''}`}
              style={{ background: cor }}
              title={ocupadoPor ? `Já usado por ${ocupadoPor.categoriaNome}` : cor}
              aria-label={ocupadoPor ? `Cor ${slot}, já usada por ${ocupadoPor.categoriaNome}` : `Cor ${slot}`}
            />
          );
        })}
        <label
          className={`${estilos.swatchPersonalizada} ${escolha === 'personalizada' ? estilos.swatchAtivo : ''}`}
          title="Cor personalizada"
        >
          🎨
          <input
            type="color"
            value={corHex}
            onChange={(e) => {
              setCorHex(e.target.value);
              setEscolha('personalizada');
            }}
            onClick={() => setEscolha('personalizada')}
            className={estilos.seletorNativo}
            aria-label="Cor personalizada"
          />
        </label>
      </div>

      {escolha === 'personalizada' ? (
        <p className={estilos.avisoDaltonismo}>
          Cores personalizadas não passam pela validação de daltonismo da
          paleta padrão — o nome do orçamento sempre aparece ao lado da cor.
        </p>
      ) : null}

      <input
        type="hidden"
        name="corSlot"
        value={escolha === 'personalizada' ? '' : escolha}
      />
      <input
        type="hidden"
        name="corPersonalizada"
        value={escolha === 'personalizada' ? corHex : ''}
      />
    </div>
  );
}
