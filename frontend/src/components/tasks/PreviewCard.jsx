export default function PreviewCard({
  plan,
  draftTask,
  onApprove,
  onEdit,
  onCancel,
  loading,
  error,
}) {
  if (!plan || !draftTask) return null;

  const confidenceColor =
    plan.confidence >= 80
      ? 'bg-green-100 text-green-700 border-green-200'
      : plan.confidence >= 60
      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-red-100 text-red-700 border-red-200';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1">
            AI Plan Preview
          </p>
          <h2 className="text-base font-bold text-gray-900 leading-snug">
            {draftTask.title}
          </h2>
        </div>

        {/* Confidence badge */}
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${confidenceColor}`}
        >
          {plan.confidence}% confident
        </span>
      </div>

      {/* ── reviewRequired warning banner ───────────────── */}
      {plan.reviewRequired && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-3 flex gap-2">
          <span className="text-yellow-500 text-sm mt-0.5">⚠</span>
          <div>
            <p className="text-xs font-semibold text-yellow-700">Review Required</p>
            {plan.reviewReason && (
              <p className="text-xs text-yellow-600 mt-0.5 leading-relaxed">{plan.reviewReason}</p>
            )}
          </div>
        </div>
      )}

      {/* ── AI Summary ──────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          AI Summary
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">{plan.understanding}</p>
      </div>

      {/* ── Estimated Hours ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">⏱ Estimated:</span>
        <span className="text-sm font-semibold text-gray-800">{plan.estimatedHours}h total</span>
      </div>

      {/* ── Subtasks ────────────────────────────────────── */}
      {plan.subtasks?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Subtasks
          </p>
          <ol className="space-y-1.5">
            {plan.subtasks.map((sub, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm bg-gray-50 border border-gray-100 rounded px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono w-4 shrink-0">{i + 1}.</span>
                  <span className="text-gray-700">{sub.name}</span>
                </span>
                <span className="text-xs text-gray-400 shrink-0 ml-3">{sub.hours}h</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Risks ───────────────────────────────────────── */}
      {plan.risks?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Potential Risks
          </p>
          <ul className="space-y-1">
            {plan.risks.map((risk, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="text-red-400 mt-0.5 shrink-0">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Action Buttons ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {/* Approve & Save */}
        <button
          type="button"
          onClick={onApprove}
          disabled={loading}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold px-5 py-2.5 rounded-md transition-colors"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Saving…
            </>
          ) : (
            '✅ Approve & Save'
          )}
        </button>

        {/* Edit */}
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-semibold px-5 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ✏ Edit
        </button>

        {/* Cancel */}
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium px-4 py-2.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* ── Error Region ────────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
