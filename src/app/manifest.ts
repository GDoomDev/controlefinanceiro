import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Controle Financeiro',
    short_name: 'Financeiro',
    description:
      'Organização financeira pessoal — orçamentos, cartões, reembolsos e projeção de sobra mensal.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2a78d6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
