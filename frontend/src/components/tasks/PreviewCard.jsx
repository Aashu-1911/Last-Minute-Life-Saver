import { useState } from 'react';

export default function PreviewCard({
  plan,
  draftTask,
  onApprove,
  onEdit,
  onCancel,
  onReplan,
  loading,
  error,
}) {
  // AI Assumptions collapsible state — open by default
  const [assumptionsOpen, setAssumptionsOpen] = useState(true);
  // Track which assumptions have been toggled as "wrong"
  const [wrongToggles, setWrongToggles] = useState({});
  // Track correction text per assumption index
  const [corrections, setCorrections] = useState({});

  // N.O.V.A. Suggests collapsible state — open by default
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);

  if (!plan || !draftTask) return null;

  // Use compositeConfidence with fallback to confidence for backward compat
  const displayConfidence = plan.compositeConfidence ?? plan.confidence;

  const confidenceColor =
    displayConfidence >= 80
      ? 'bg-green-100 text-green-700 border-green-200'
      : displayConfidence >= 60
      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-red-100 text-red-700 border-red-200';

  // Toggle a single assumption's "wrong" state
  const toggleWrong = (idx) => {
    setWrongToggles((prev) => ({ ...prev, [idx]: !prev[idx] }));
    // Clear correction text when un-toggling
    if (wrongToggles[idx]) {
      setCorrections((prev) => { const n = { ...prev }; delete n[idx]; return n; });
    }
  };

  const updateCorrection = (idx, text) => {
    setCorrections((prev) => ({ ...prev, [idx]: text }));
  };

  // Collect all filled-in corrections and call onReplan
  const handleReplan = () => {
    if (!onReplan) return;
    const filled = Object.entries(corrections)
      .filter(([, text]) => text && text.trim().length > 0)
      .map(([, text]) => text.trim());
    onReplan(filled);
  };

  const assumptions = plan.taskUnderstanding?.assumptions ?? [];
  const hasAssumptions = assumptions.length > 0;
  const hasSuggestions = plan.aiSuggestions?.length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">

      {/* ── 1. Header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1">
            AI Plan Preview
          </p>
          <h2 className="text-base font-bold text-gray-900 leading-snug">
            {draftTask.title}
          </h2>
        </div>
        {/* Composite confidence badge */}
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${confidenceColor}`}>
          {displayConfidence}% confident
        </span>
      </div>

      {/* ── 2. Three-tier Review Level banner ──────────────── */}
      {plan.reviewLevel === 'WARNING' && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-3 flex gap-2">
          <span className="text-yellow-500 text-sm mt-0.5 shrink-0">⚠</span>
          <p className="text-xs text-yellow-700 leading-relaxed">
            <span className="font-semibold">Heads Up</span>
            {plan.reviewReason ? ` — ${plan.reviewReason}` : ''}
          </p>
        </div>
      )}
      {plan.reviewLevel === 'REQUIRED' && (
        <div className="bg-orange-50 border border-orange-400 rounded-lg px-4 py-3 flex gap-2">
          <span className="text-orange-500 text-sm mt-0.5 shrink-0">🔍</span>
          <p className="text-xs text-orange-700 leading-relaxed">
            <span className="font-semibold">Review Recommended</span>
            {plan.reviewReason ? ` — ${plan.reviewReason}` : ''}
          </p>
        </div>
      )}

      {/* ── 3. Task Understanding ───────────────────────────── */}
      {plan.taskUnderstanding && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">
            Task Understanding
          </p>
          {plan.taskUnderstanding.goal && (
            <p className="text-sm font-semibold text-gray-900 leading-snug">
              {plan.taskUnderstanding.goal}
            </p>
          )}
          {plan.taskUnderstanding.planningStrategy && (
            <p className="text-xs text-indigo-600 leading-relaxed">
              {plan.taskUnderstanding.planningStrategy}
            </p>
          )}
          {plan.taskUnderstanding.constraints?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {plan.taskUnderstanding.constraints.map((c, i) => (
                <span
                  key={i}
                  className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 4. AI Assumptions collapsible ──────────────────── */}
      {hasAssumptions && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setAssumptionsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              AI Assumptions
            </span>
            <span className="text-gray-400 text-sm">{assumptionsOpen ? '▲' : '▼'}</span>
          </button>

          {assumptionsOpen && (
            <div className="divide-y divide-gray-100">
              {assumptions.map((assumption, idx) => (
                <div key={idx} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-700 flex-1 leading-relaxed">{assumption}</p>
                    <button
                      type="button"
                      onClick={() => toggleWrong(idx)}
                      className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded border transition-colors ${
                        wrongToggles[idx]
                          ? 'bg-red-100 text-red-600 border-red-300'
                          : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                      }`}
                    >
                      ✗ Wrong
                    </button>
                  </div>

                  {wrongToggles[idx] && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={corrections[idx] || ''}
                        onChange={(e) => updateCorrection(idx, e.target.value)}
                        placeholder="What's the correct assumption?"
                        className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={handleReplan}
                        disabled={!corrections[idx]?.trim()}
                        className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded transition-colors"
                      >
                        Replan
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 5. AI Summary ──────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          AI Summary
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">{plan.understanding}</p>
      </div>

      {/* ── 6. Deliverables ────────────────────────────────── */}
      {plan.deliverables?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Deliverables
          </p>
          <ul className="space-y-1">
            {plan.deliverables.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 7. Estimated Hours ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">⏱ Estimated:</span>
        <span className="text-sm font-semibold text-gray-800">{plan.estimatedHours}h total</span>
      </div>

      {/* ── 8. Subtasks ────────────────────────────────────── */}
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

      {/* ── 9. Risks ───────────────────────────────────────── */}
      {plan.risks?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Potential Risks
          </p>
          <ul className="space-y-1">
            {plan.risks.map((risk, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="text-red-400 mt-0.5 shrink-0">•</span>
                <span>{typeof risk === 'object' ? risk.risk : risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 10. Why N.O.V.A. generated this plan ───────────── */}
      {plan.reasoning && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Why N.O.V.A. generated this plan
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">{plan.reasoning}</p>
        </div>
      )}

      {/* ── 11. 💡 N.O.V.A. Suggests collapsible ───────────── */}
      {hasSuggestions && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setSuggestionsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              💡 N.O.V.A. Suggests
            </span>
            <span className="text-gray-400 text-sm">{suggestionsOpen ? '▲' : '▼'}</span>
          </button>

          {suggestionsOpen && (
            <div className="divide-y divide-gray-100">
              {plan.aiSuggestions.map((item, i) => (
                <div key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                  {typeof item === 'object' ? (
                    <div className="flex-1 space-y-0.5">
                      <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                      {item.reason && (
                        <p className="text-xs text-gray-500 leading-relaxed">{item.reason}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 flex-1 leading-relaxed">{item}</p>
                  )}
                  <button
                    type="button"
                    className="shrink-0 text-xs font-semibold px-2.5 py-1 border border-indigo-200 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition-colors"
                  >
                    {typeof item === 'object' && item.action ? item.action : 'View'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 12. Action Buttons ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
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

        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-semibold px-5 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ✏ Edit
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium px-4 py-2.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* ── 13. Error Region ───────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
