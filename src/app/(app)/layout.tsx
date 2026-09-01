import Link from 'next/link';

import { auth, signOut } from '@/auth';

import estilos from './navegacao.module.css';

const DESTINOS = [
  { href: '/', rotulo: 'Painel' },
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = await auth();

  return (
    <div className={estilos.casca}>
      <nav className={estilos.lateral}>
        <div className={estilos.marca}>Controle Financeiro</div>
        {DESTINOS.map((d) => (
          <Link key={d.href} href={d.href} className={estilos.link}>
            {d.rotulo}
          </Link>
        ))}
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
      <main className={estilos.conteudo}>{children}</main>
    </div>
  );
}
