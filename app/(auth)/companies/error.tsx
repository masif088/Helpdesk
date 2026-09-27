'use client'

export default function CompaniesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h2>Something went wrong loading Companies</h2>
      <p style={{ color: '#888', marginBottom: 16 }}>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
