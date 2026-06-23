import { useState } from 'react';
import { useTaskContext } from '../context/TaskContext';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import MetricCard from '../components/common/MetricCard';
import InsightCard from '../components/common/InsightCard';
import RiskAlert from '../components/common/RiskAlert';
import SkeletonCard from '../components/common/SkeletonCard';
import TaskCard from '../components/tasks/TaskCard';

export default function Dashboard() {
  const { tasks, summary, taskStatuses, insights, loading, error, actions } = useTaskContext();

  const [form, setForm] = useState({ title: '', deadline: '', importance: 3 });
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const statusMap = Object.fromEntries(taskStatuses.map((s) => [s.taskId, s]));
  const taskMap = Object.fromEntries(tasks.map((t) => [t.taskId, t]));

  const overdueAlerts = taskStatuses.filter((s) => s.scheduleStatus === 'OVERDUE_RISK');
  // Only show review alerts for REVIEW_REQUIRED status (not overdue — those already have their own card)
  const reviewAlerts = taskStatuses.filter((s) => s.reviewRequired && s.scheduleStatus === 'REVIEW_REQUIRED');

  const topTasks = [...tasks].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 2);
  const today = new Date().toISOString().slice(0, 10);

  const isMetricsLoading = loading.tasks || loading.schedule;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);
    try {
      await actions.createTask({
        title: form.title,
        deadline: form.deadline,
        importance: Number(form.importance),
      });
      setForm({ title: '', deadline: '', importance: 3 });
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 4000);
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="N.O.V.A. — AI Productivity Copilot"
        subtitle="Never miss a deadline again."
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

      {/* ── Metrics ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Total Tasks"
          value={tasks.length}
          color="indigo"
          loading={loading.tasks}
        />
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
        <MetricCard
          label="Productivity Score"
          value={`${insights.productivityScore}/100`}
          color={
            insights.productivityScore >= 75
              ? 'green'
              : insights.productivityScore >= 50
              ? 'yellow'
              : 'red'
          }
          loading={isMetricsLoading}
        />
      </div>

      {/* ── AI Command Center ─────────────────────────────── */}
      {(tasks.length > 0 || loading.tasks) && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">🎯 AI Command Center</h2>
          {loading.tasks ? (
            <div className="grid md:grid-cols-2 gap-4">
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Today's Focus</p>
                <ul className="space-y-2">
                  {topTasks.map((t, i) => (
                    <li key={t.taskId} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 font-mono">{i + 1}.</span>
                      <span className="font-medium text-gray-800 truncate">
                        {t.sanitizedTitle || t.originalTitle}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">{t.estimatedHours}h</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                {overdueAlerts.length > 0 ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-red-600 mb-1">⚠ Deadline Risks</p>
                    <p className="text-sm text-red-700">
                      {overdueAlerts.length} task{overdueAlerts.length > 1 ? 's' : ''} at risk
                    </p>
                    {overdueAlerts[0] && (
                      <p className="text-xs text-red-500 mt-1 truncate">
                        {taskMap[overdueAlerts[0].taskId]?.sanitizedTitle ||
                          overdueAlerts[0].taskId}{' '}
                        &mdash; {overdueAlerts[0].deficitHours}h deficit
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-700 font-medium">✅ All tasks on track</p>
                    <p className="text-xs text-green-500 mt-1">No deadline risks detected</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AI Insights ───────────────────────────────────── */}
      {isMetricsLoading ? (
        <div>
          <p className="text-sm font-bold text-gray-700 mb-3">🧠 AI Insights</p>
          <div className="grid md:grid-cols-3 gap-3">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        </div>
      ) : (
        (insights.biggestRisk || insights.biggestValidationRisk || insights.highestLeverage || (summary.totalScheduledHours ?? 0) > 0) && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-3">🧠 AI Insights</h2>
            <div className="grid md:grid-cols-3 gap-3">
              {insights.biggestRisk && (
                <InsightCard
                  type="warning"
                  title="Scheduling Risk"
                  value={insights.biggestRisk.taskTitle}
                  description={`Required: ${insights.biggestRisk.requiredHours}h · Available: ${insights.biggestRisk.availableHours}h · Deficit: ${insights.biggestRisk.deficitHours}h`}
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
                  title="Schedule Utilization"
                  value={`${insights.capacityUtilization}%`}
                  description={`${summary.totalScheduledHours}h allocated across all tasks`}
                />
              )}
            </div>
          </div>
        )
      )}

      {/* ── Quick Add Task ────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4">➕ Quick Add Task</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Task Title</label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. DBMS Assignment"
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deadline</label>
              <input
                type="date"
                required
                min={today}
                value={form.deadline}
                onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Importance (1–5): <strong>{form.importance}</strong>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={form.importance}
                onChange={(e) => setForm((p) => ({ ...p, importance: e.target.value }))}
                className="w-full mt-2 accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {formError}
            </p>
          )}
          {formSuccess && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
              ✅ Task created — AI plan generated successfully.
            </p>
          )}

          <button
            type="submit"
            disabled={loading.createTask}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold px-6 py-2.5 rounded-md transition-colors"
          >
            {loading.createTask ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating Plan…
              </span>
            ) : (
              'Generate Plan'
            )}
          </button>
        </form>
      </div>

      {/* ── Risk Alerts ───────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3">🚨 Risk Alerts</h2>
        {overdueAlerts.length === 0 && reviewAlerts.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg bg-gray-50">
            <p className="text-sm text-gray-400">✅ No active risks — all tasks are on track.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {overdueAlerts.map((s) => (
              <RiskAlert
                key={s.taskId}
                type="overdue"
                taskTitle={taskMap[s.taskId]?.sanitizedTitle || taskMap[s.taskId]?.originalTitle || s.taskId}
                requiredHours={s.requiredHours}
                availableHours={s.availableHours}
                deficitHours={s.deficitHours}
              />
            ))}
            {reviewAlerts.map((s) => (
              <RiskAlert
                key={s.taskId + '-review'}
                type="review"
                taskTitle={taskMap[s.taskId]?.sanitizedTitle || taskMap[s.taskId]?.originalTitle || s.taskId}
                reviewReason={s.reviewReason}
                requiredHours={s.requiredHours}
                reviewRangeMin={s.reviewRangeMin}
                reviewRangeMax={s.reviewRangeMax}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Task List ─────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3">
          📋 Tasks{' '}
          {tasks.length > 0 && (
            <span className="text-gray-400 font-normal">({tasks.length})</span>
          )}
        </h2>

        {loading.tasks ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} lines={4} />
            ))}
          </div>
        ) : error.tasks ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">
            {error.tasks}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-2xl mb-2">🚀</p>
            <p className="text-sm font-medium text-gray-600">No tasks created yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Create your first task and let N.O.V.A. build an AI-powered execution plan.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {tasks.map((task) => (
              <TaskCard key={task.taskId} task={task} taskStatus={statusMap[task.taskId]} />
            ))}
          </div>
        )}
      </div>

      {/* ── Rescue Mode Preview ───────────────────────────── */}
      <div className="border-2 border-dashed border-indigo-200 rounded-lg p-5 text-center bg-indigo-50">
        <p className="text-lg mb-1">🚧</p>
        <p className="text-sm font-semibold text-indigo-700">Deadline Rescue Mode — Coming in Day 4</p>
        <p className="text-xs text-indigo-400 mt-1">
          Will automatically re-plan your schedule when you fall behind on deadlines.
        </p>
      </div>
    </PageContainer>
  );
}
