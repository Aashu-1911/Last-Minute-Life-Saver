import { useState } from 'react';
import {
  getPriorityLabel,
  getPriorityColor,
  getStatusLabel,
  getStatusColor,
  daysUntilDeadline,
} from '../../utils/taskHelpers';
import { getReviewReasonLabel } from '../../utils/insights';
import * as taskService from '../../services/taskService';

export default function TaskCard({ task, taskStatus, onPlanThisTask, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [subtaskStates, setSubtaskStates] = useState(
    () => (task.subtasks || []).map((s) => s.completed ?? false)
  );

  const days = daysUntilDeadline(task.deadline);
  const status = taskStatus?.scheduleStatus;
  const isReview = status === 'REVIEW_REQUIRED';
  const isDone = task.status === 'COMPLETED';

  const handleCompleteTask = async () => {
    setCompleting(true);
    try {
      const newStatus = isDone ? 'PENDING' : 'COMPLETED';
      await taskService.completeTask(task.taskId, newStatus);
      if (onRefresh) await onRefresh();
    } catch {
      // silently ignore — refresh will show correct state
    } finally {
      setCompleting(false);
    }
  };

  const handleToggleSubtask = async (idx, checked) => {
    // Optimistic update
    setSubtaskStates((prev) => {
      const next = [...prev];
      next[idx] = checked;
      return next;
    });
    try {
      await taskService.completeSubtask(task.taskId, idx, checked);
      if (onRefresh) await onRefresh();
    } catch {
      // Revert on error
      setSubtaskStates((prev) => {
        const next = [...prev];
        next[idx] = !checked;
        return next;
      });
    }
  };

  return (
    <div
      className={`border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow ${
        isDone
          ? 'bg-gray-50 border-gray-200 opacity-75'
          : isReview
          ? 'bg-white border-yellow-300'
          : 'bg-white border-gray-200'
      }`}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Complete task checkbox */}
          <button
            type="button"
            onClick={handleCompleteTask}
            disabled={completing}
            aria-label={isDone ? 'Mark as pending' : 'Mark as complete'}
            className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              isDone
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-gray-300 hover:border-green-400 bg-white'
            } disabled:opacity-50`}
          >
            {isDone && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          <div className="min-w-0">
            <h3 className={`text-sm font-semibold truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.sanitizedTitle || task.originalTitle || task.title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Due: {task.deadline} &middot;{' '}
              <span
                className={
                  days < 3
                    ? 'text-red-600 font-medium'
                    : days < 7
                    ? 'text-yellow-600'
                    : 'text-gray-500'
                }
              >
                {days > 0
                  ? `${days}d remaining`
                  : days === 0
                  ? 'Due today'
                  : `${Math.abs(days)}d overdue`}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPriorityColor(task.priorityScore)}`}>
            {getPriorityLabel(task.priorityScore)}
          </span>
          {isDone ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              ✓ Done
            </span>
          ) : status ? (
            <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(status)}`}>
              {getStatusLabel(status)}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Meta row ── */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 pl-7">
        <span>🎯 Priority: <strong className="text-gray-700">{task.priorityScore}</strong></span>
        {task.frequencyPerDay ? (
          <span>
            🔁 <strong className="text-gray-700">{task.frequencyPerDay}× per day</strong>
            <span className="text-gray-400 ml-1">
              · every {Math.round(16 / task.frequencyPerDay * 10) / 10}h
            </span>
          </span>
        ) : (
          <span>⏱ Est: <strong className="text-gray-700">{task.estimatedHours}h</strong></span>
        )}
        {task.subtasks?.length > 0 && (
          <span>
            {subtaskStates.filter(Boolean).length}/{task.subtasks.length} done
          </span>
        )}
      </div>

      {/* ── Review warning ── */}
      {isReview && taskStatus?.reviewReason && (
        <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-2.5 text-xs space-y-0.5 ml-7">
          <p className="text-yellow-700 font-medium">Validation issue detected</p>
          <p className="text-gray-600">{getReviewReasonLabel(taskStatus.reviewReason)}</p>
          <p className="text-gray-500">
            Allowed range: {taskStatus.reviewRangeMin ?? 0.5}–{taskStatus.reviewRangeMax ?? 100}h
          </p>
        </div>
      )}

      {/* ── Subtasks ── */}
      {task.subtasks?.length > 0 && (
        <div className="mt-3 ml-7">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {expanded ? '▲ Hide subtasks' : `▼ Show ${task.subtasks.length} subtasks`}
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1.5">
              {task.subtasks.map((sub, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-2.5 text-xs rounded px-3 py-2 border transition-colors ${
                    subtaskStates[i]
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={subtaskStates[i] ?? false}
                    onChange={(e) => handleToggleSubtask(i, e.target.checked)}
                    className="accent-green-500 h-3.5 w-3.5 shrink-0 cursor-pointer"
                    aria-label={`Mark "${sub.name}" as complete`}
                  />
                  <span className={`flex-1 ${subtaskStates[i] ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {sub.name}
                  </span>
                  <span className="text-gray-400 shrink-0">{sub.hours}h</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Plan this Task ── */}
      {task.taskMode === 'quick' && !task.frequencyPerDay && !isDone && onPlanThisTask && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => onPlanThisTask(task)}
            aria-label={`Plan "${task.sanitizedTitle || task.originalTitle || task.title}" with AI`}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-3 py-2 transition-colors"
          >
            ✨ Plan this Task
          </button>
        </div>
      )}
    </div>
  );
}
