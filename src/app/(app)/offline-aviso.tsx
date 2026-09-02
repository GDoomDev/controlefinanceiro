'use client';

import { useEffect, useState } from 'react';

import estilos from './navegacao.module.css';

/**
 * Só um script no navegador sabe se a conexão caiu no meio do uso — por isso
 * este é o único Client Component novo do plano. Nenhum dado é escondido ou
 * fingido: o aviso só aparece, nunca substitui o conteúdo real (spec, seção
 * 11 — "o app exibe aviso claro em vez de aparentar ter salvo algo").
 */
export function AvisoOffline() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffline(!navigator.onLine);

    const aoFicarOffline = () => setOffline(true);
    const aoFicarOnline = () => setOffline(false);

    window.addEventListener('offline', aoFicarOffline);
    window.addEventListener('online', aoFicarOnline);

    return () => {
      window.removeEventListener('offline', aoFicarOffline);
      window.removeEventListener('online', aoFicarOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className={estilos.avisoOffline} role="status">
      Sem conexão — o que você vir agora pode estar desatualizado, e nada novo
      será salvo até você voltar a ficar online.
    </div>
  );
}
