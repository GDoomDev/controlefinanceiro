export { auth as proxy } from '@/auth';

export const config = {
  // Protege tudo, menos os arquivos internos do Next, a própria rota de auth,
  // e os estáticos do PWA (manifest, service worker, página offline, ícones).
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icon-).*)',
  ],
};
