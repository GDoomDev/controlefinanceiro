import Link from 'next/link';

import { auth, signOut } from '@/auth';

import estilos from './mais.module.css';

const DESTINOS_MAIS = [
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/reembolsos', rotulo: 'Reembolsos' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];

export default async function Mais() {
  const sessao = await auth();

  return (
    <>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Mais</h1>

      <div className={estilos.lista}>
        {DESTINOS_MAIS.map((d) => (
          <Link key={d.href} href={d.href} className={estilos.item}>
            {d.rotulo}
          </Link>
        ))}
      </div>

      <div className={estilos.conta}>
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
    </>
  );
}
