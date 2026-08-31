import { handlers } from '@/auth';

// `src/auth.ts` exporta `handlers` como objeto (ver seção "Interfaces" do
// brief da Task 9), não `GET`/`POST` individualmente — por isso a
// desestruturação aqui em vez de `export { GET, POST } from '@/auth'`.
export const { GET, POST } = handlers;
