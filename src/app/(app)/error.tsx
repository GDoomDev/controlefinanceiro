'use client';

export default function ErroApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 'var(--espaco-6)' }}>
      <h1>Algo deu errado</h1>
      <p style={{ color: 'var(--cor-texto-secundario)', fontSize: 14, marginBottom: 'var(--espaco-4)' }}>
        {error.message || 'Ocorreu um erro inesperado.'}
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: 'var(--cor-texto)',
          color: 'var(--cor-fundo)',
          border: 'none',
          borderRadius: 'var(--raio-controle)',
          padding: 'var(--espaco-2) var(--espaco-4)',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
