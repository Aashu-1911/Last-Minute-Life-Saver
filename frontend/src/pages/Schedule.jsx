import { useTaskContext } from '../context/TaskContext';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import MetricCard from '../components/common/MetricCard';
import InsightCard from '../components/common/InsightCard';
import RiskAlert from '../components/common/RiskAlert';
import SkeletonCard from '../components/common/SkeletonCard';
import TimelineBlock from '../components/schedule/TimelineBlock';

/** Formats an ISO timestamp to "Jun 23, 2026 3:13 PM" local time. */
const formatGeneratedAt = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
};

export default function Schedule() {
  const { tasks, schedule, summary, taskStatuses, insights, loading, error, actions } =
    useTaskContext();

  const taskMap = Object.fromEntries(tasks.map((t) => [t.taskId, t]));
  const overdueAlerts = taskStatuses.filter((s) => s.scheduleStatus === 'OVERDUE_RISK');
  const reviewAlerts = taskStatuses.filter(
    (s) => s.reviewRequired && s.scheduleStatus === 'REVIEW_REQUIRED'
  );

  // Group blocks by date, preserving chronological order
  const byDate = schedule.reduce((acc, block) => {
    (acc[block.date] = acc[block.date] || []).push(block);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort();

  // Use the first block's generatedAt as the generation time for the run
  const generatedAtLabel = formatGeneratedAt(schedule[0]?.generatedAt);

  const isMetricsLoading = loading.schedule;

  return (
    <PageContainer>
      <PageHeader
        title="Schedule"
        subtitle="AI-generated time-blocked execution plan"
        action={
          <button
            onClick={actions.refresh}
            disabled={loading.refresh}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {loading.refresh ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
        }
      />

      {/* ── Schedule Summary ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Scheduled Hours"
          value={`${summary.totalScheduledHours ?? 0}h`}
          color="green"
          loading={isMetricsLoading}
        />
        <MetricCard
          label="Overdue Risk"
          value={summary.overdueRiskTasks ?? 0}
          color={(summary.overdueRiskTasks ?? 0) > 0 ? 'red' : 'gray'}
          loading={isMetricsLoading}
        />
        <MetricCard
          label="Review Required"
          value={summary.reviewRequiredTasks ?? 0}
          color={(summary.reviewRequiredTasks ?? 0) > 0 ? 'yellow' : 'gray'}
          loading={isMetricsLoading}
        />
        {/* Blocks count = schedule.length exactly */}
        <MetricCard
          label="Timeline Blocks"
          value={schedule.length}
          color="indigo"
          sub={generatedAtLabel ? `Generated ${generatedAtLabel}` : undefined}
          loading={isMetricsLoading}
        />
      </div>

      {/* ── Generate Button ───────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-sm font-bold text-gray-700">Generate Schedule</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Runs the AI scheduling engine across all tasks (16:00–22:00 window by default).
              Previous schedule will be replaced.
            </p>
          </div>
          <button
            onClick={() => actions.generateSchedule()}
            disabled={loading.generateSchedule}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold px-6 py-2.5 rounded-md transition-colors"
          >
            {loading.generateSchedule ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
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
                Generating…
              </span>
            ) : (
              '⚡ Generate Schedule'
            )}
          </button>
        </div>

        {error.generateSchedule && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
            {error.generateSchedule}
          </p>
        )}
      </div>

      {/* ── Timeline ──────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3">📅 Timeline</h2>

        {loading.schedule ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} lines={3} />
            ))}
          </div>
        ) : error.schedule ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">
            {error.schedule}
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-2xl mb-2">📅</p>
            <p className="text-sm font-medium text-gray-600">No schedule generated yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Click "Generate Schedule" to create your AI-powered execution plan.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedDates.map((date) => (
              <TimelineBlock key={date} date={date} blocks={byDate[date]} />
            ))}
          </div>
        )}
      </div>

      {/* ── Risk Analysis ─────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3">🚨 Risk Analysis</h2>
        {overdueAlerts.length === 0 && reviewAlerts.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg bg-gray-50">
            <p className="text-sm text-gray-400">✅ No active risks detected.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {overdueAlerts.map((s) => (
              <RiskAlert
                key={s.taskId}
                type="overdue"
                taskTitle={
                  taskMap[s.taskId]?.sanitizedTitle ||
                  taskMap[s.taskId]?.originalTitle ||
                  s.taskId
                }
                requiredHours={s.requiredHours}
                availableHours={s.availableHours}
                deficitHours={s.deficitHours}
              />
            ))}
            {reviewAlerts.map((s) => (
              <RiskAlert
                key={s.taskId + '-review'}
                type="review"
                taskTitle={
                  taskMap[s.taskId]?.sanitizedTitle ||
                  taskMap[s.taskId]?.originalTitle ||
                  s.taskId
                }
                reviewReason={s.reviewReason}
                requiredHours={s.requiredHours}
                reviewRangeMin={s.reviewRangeMin}
                reviewRangeMax={s.reviewRangeMax}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── AI Insights ───────────────────────────────────── */}
      {(insights.biggestRisk ||
        insights.biggestValidationRisk ||
        insights.highestLeverage ||
        (summary.totalScheduledHours ?? 0) > 0) && (
        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-3">🧠 AI Insights</h2>
          <div className="grid md:grid-cols-3 gap-3">
            {insights.biggestRisk && (
              <InsightCard
                type="warning"
                title="Scheduling Risk"
                value={insights.biggestRisk.taskTitle}
                description={`Deficit: ${insights.biggestRisk.deficitHours}h before deadline`}
              />
            )}
            {insights.biggestValidationRisk && (
              <InsightCard
                type="validation"
                title="Validation Risk"
                value={insights.biggestValidationRisk.taskTitle}
                description={`Estimated ${insights.biggestValidationRisk.requiredHours}h — requires review before scheduling.`}
              />
            )}
            {insights.highestLeverage && (
              <InsightCard
                type="success"
                title="Highest Leverage"
                value={insights.highestLeverage.taskTitle}
                description={`${insights.highestLeverage.scheduledHours}h of scheduled work`}
              />
            )}
            {(summary.totalScheduledHours ?? 0) > 0 && (
              <InsightCard
                type="info"
                title="Capacity Utilization"
                value={`${insights.capacityUtilization}%`}
                description={`${summary.totalScheduledHours}h across all blocks`}
              />
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
