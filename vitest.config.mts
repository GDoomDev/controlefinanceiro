import path from 'node:path';

import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      // Espelha o path mapping "@/*" -> "./src/*" do tsconfig.json, que o
      // Vitest não lê automaticamente.
      '@': path.resolve(process.cwd(), './src'),
      // next-auth (ESM) importa "next/server" sem extensão. O pacote `next`
      // não declara um campo "exports", então o resolvedor nativo de ESM do
      // Node (usado quando o Vitest externaliza dependências) não consegue
      // encontrar o arquivo sem a extensão explícita. Bundlers (webpack/
      // Turbopack) resolvem isso normalmente em runtime de app; em testes
      // precisamos apontar explicitamente para o arquivo real.
      'next/server': 'next/server.js',
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 15000,
    server: {
      deps: {
        // Força o Vite a transformar (em vez de externalizar/usar o require
        // nativo do Node para) essas dependências ESM, para que o alias
        // acima seja de fato aplicado durante a resolução.
        inline: [/next-auth/, /@auth\//],
      },
    },
  },
}));
