import { signIn } from '@/auth';

export default function Login() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/' });
        }}
      >
        <button type="submit">Entrar com Google</button>
      </form>
    </main>
  );
}
