/** Same "récurrent" visual used on the Tickets de maintenance grouped view -- shared so both screens agree on it. */
export function RecurrentBadge({ appartementId }: { appartementId: number | undefined }) {
  return (
    <span
      data-testid={`recurrent-badge-${appartementId}`}
      className="shrink-0 rounded-badge bg-danger-bg px-2 py-0.5 text-xs font-bold text-danger"
    >
      Récurrent
    </span>
  )
}
