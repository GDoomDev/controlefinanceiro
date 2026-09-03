import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

import { prisma } from '@/dados/prisma';

/**
 * O app tem um usuário só. Não existe cadastro: só o e-mail configurado entra.
 * Sem `autorizado` definido, ninguém entra — um deploy que esqueceu a variável
 * deve ficar trancado, não aberto.
 */
export function emailAutorizado(
  email: string | null | undefined,
  autorizado: string | undefined,
): boolean {
  if (!email || !autorizado) return false;
  return email.trim().toLowerCase() === autorizado.trim().toLowerCase();
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  // Sessão em JWT, não em banco: o middleware roda em praticamente toda
  // rota (src/proxy.ts) e, com sessão via banco, cada navegação fazia uma
  // consulta ao Postgres só para validar quem já está logado. Com um único
  // usuário e sem necessidade de revogar sessão do lado do servidor, essa
  // consulta é custo puro. O adapter continua sendo usado só para
  // persistir a conta OAuth no primeiro login.
  session: {
    strategy: 'jwt',
  },
  // A detecção automática de host confiável do Auth.js não reconhece toda
  // URL de deploy da Vercel (ex.: os aliases de branch "-git-<branch>-...").
  // A Vercel já é o proxy reverso legítimo na frente do app, então confiar
  // no host que ela repassa é seguro.
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    signIn({ profile }) {
      return emailAutorizado(profile?.email, process.env.EMAIL_AUTORIZADO);
    },
    // Sem este callback, o `authorized` interno do Auth.js assume `true` por
    // padrão e o middleware nunca redireciona ninguém para /login — ou seja,
    // sem ele, o guard fica sem efeito nenhum e qualquer requisição não
    // autenticada acessa o app livremente. Ver relatório da Task 9.
    authorized({ auth: sessao }) {
      return !!sessao?.user;
    },
  },
});
