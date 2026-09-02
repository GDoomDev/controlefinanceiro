import Link from 'next/link';

import { alvoDoEstorno } from '@/dados/estorno';
import { competenciaDe, dataCivilEm, formatarDataCivil } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';

import { FormularioEstorno } from './estorno';
import estilos from './estorno.module.css';

export default async function Estornar({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const alvo = await alvoDoEstorno(id);

  const hojeCivil = dataCivilEm(new Date());

  return (
    <>
      <Link href="/lancamentos" className={estilos.voltar}>
        ‹ voltar aos lançamentos
      </Link>

      <div className={estilos.compra}>Estornar {alvo.descricao}</div>
      <div className={estilos.compraMeta}>
        {formatarBRL(alvo.valorTotalCentavos)}
        {alvo.parcelas.length > 1 ? ` · ${alvo.parcelas.length}x` : ' · à vista'}
      </div>

      <FormularioEstorno
        alvo={alvo}
        competenciaPadrao={competenciaDe(hojeCivil)}
        hoje={formatarDataCivil(hojeCivil)}
      />
    </>
  );
}
