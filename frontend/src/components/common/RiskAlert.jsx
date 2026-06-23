import { getReviewReasonLabel } from '../../utils/insights';

const REVIEW_ACTIONS = {
  ESTIMATE_EXCEEDS_MAXIMUM: 'Split this task into smaller sub-tasks before scheduling.',
  ESTIMATE_BELOW_MINIMUM: 'Verify the effort estimate — it may be too low to be reliable.',
  INVALID_AI_OUTPUT: 'Re-submit the task to get a valid AI estimate.',
  MANUAL_REVIEW_REQUIRED: 'Review this task manually before adding it to the schedule.',
};

const getSuggestedAction = (code) =>
  REVIEW_ACTIONS[code] || 'Review the task estimate before scheduling.';

export default function RiskAlert({
  type = 'overdue',
  taskTitle,
  requiredHours,
  availableHours,
  deficitHours,
  reviewReason,
  reviewRangeMin = 0.5,
  reviewRangeMax = 100,
}) {
  const isOverdue = type === 'overdue';

  return (
    <div
      className={`rounded-lg border p-4 ${
        isOverdue ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{isOverdue ? '🔴' : '🟡'}</span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-semibold ${
              isOverdue ? 'text-red-700' : 'text-yellow-700'
            }`}
          >
            {isOverdue ? '⚠ Deadline Risk Detected' : '⚠ Review Required'}
          </p>
          <p className="text-sm font-medium text-gray-800 mt-0.5">{taskTitle}</p>

          {isOverdue ? (
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-600">
              <span>
                Required: <strong>{requiredHours}h</strong>
              </span>
              <span>
                Available: <strong>{availableHours}h</strong>
              </span>
              <span className="text-red-600 font-semibold">Deficit: {deficitHours}h</span>
            </div>
          ) : (
            <div className="mt-1.5 space-y-1">
              <p className="text-xs text-gray-600">
                <span className="font-medium">Reason:</span> {getReviewReasonLabel(reviewReason)}
              </p>
              <p className="text-xs text-gray-600">
                <span className="font-medium">Estimated Hours:</span> {requiredHours}h &nbsp;·&nbsp;
                <span className="font-medium">Allowed Range:</span> {reviewRangeMin}–{reviewRangeMax}h
              </p>
              <p className="text-xs text-yellow-700 font-medium mt-1">
                💡 Suggested Action: {getSuggestedAction(reviewReason)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
