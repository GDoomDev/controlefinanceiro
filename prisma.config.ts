import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

// O Prisma 7 não carrega o `.env` automaticamente ao ler este arquivo de
// configuração — carregamos aqui para que `DATABASE_URL` chegue aos
// comandos de `migrate`/`db`.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
