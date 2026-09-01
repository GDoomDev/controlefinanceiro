'use client';

export default function ErroApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 24 }}>
      <h1>Algo deu errado</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
        {error.message || 'Ocorreu um erro inesperado.'}
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: '#111827',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '10px 16px',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
