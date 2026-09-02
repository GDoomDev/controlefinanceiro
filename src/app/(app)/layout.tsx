import Link from 'next/link';

import { auth, signOut } from '@/auth';

import { AvisoOffline } from './offline-aviso';
import { DESTINOS_PRINCIPAIS, DESTINOS_SECUNDARIOS } from './destinos';
import estilos from './navegacao.module.css';

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = await auth();

  return (
    <>
      <AvisoOffline />
      <div className={estilos.casca}>
        <nav className={estilos.lateral}>
          <div className={estilos.marca}>Controle Financeiro</div>
          {DESTINOS_PRINCIPAIS.map((d) => (
            <Link key={d.href} href={d.href} className={estilos.link}>
              {d.rotulo}
            </Link>
          ))}
          {DESTINOS_SECUNDARIOS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className={`${estilos.link} ${estilos.destinoSecundario}`}
            >
              {d.rotulo}
            </Link>
          ))}
          <Link href="/mais" className={`${estilos.link} ${estilos.linkMais}`}>
            Mais
          </Link>
          <div className={estilos.rodape}>
            <div>{sessao?.user?.email}</div>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button type="submit" className={estilos.sair}>
                Sair
              </button>
            </form>
          </div>
        </nav>

        {/* Sempre acessível, em qualquer tela (spec, seção 8). */}
        <Link href="/lancamentos/novo" className={estilos.fab} aria-label="Novo lançamento">
          +
        </Link>

        <main className={estilos.conteudo}>{children}</main>
      </div>
    </>
  );
}
