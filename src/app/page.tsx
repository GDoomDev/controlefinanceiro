import { auth, signOut } from '@/auth';

export default async function Painel() {
  const sessao = await auth();

  return (
    <main style={{ padding: 24 }}>
      <h1>Controle Financeiro</h1>
      <p>Logado como {sessao?.user?.email}</p>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button type="submit">Sair</button>
      </form>
    </main>
  );
}
