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
