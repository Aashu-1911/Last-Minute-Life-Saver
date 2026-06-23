import { useState } from 'react';
import {
  getPriorityLabel,
  getPriorityColor,
  getStatusLabel,
  getStatusColor,
  daysUntilDeadline,
} from '../../utils/taskHelpers';
import { getReviewReasonLabel } from '../../utils/insights';

export default function TaskCard({ task, taskStatus }) {
  const [expanded, setExpanded] = useState(false);

  const days = daysUntilDeadline(task.deadline);
  const status = taskStatus?.scheduleStatus;
  const isReview = status === 'REVIEW_REQUIRED';

  return (
    <div
      className={`bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow ${
        isReview ? 'border-yellow-300' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
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

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPriorityColor(
              task.priorityScore
            )}`}
          >
            {getPriorityLabel(task.priorityScore)}
          </span>
          {status && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(status)}`}>
              {getStatusLabel(status)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span>
          🎯 Priority: <strong className="text-gray-700">{task.priorityScore}</strong>
        </span>
        <span>
          ⏱ Est: <strong className="text-gray-700">{task.estimatedHours}h</strong>
        </span>
        {task.subtasks?.length > 0 && <span>{task.subtasks.length} subtasks</span>}
      </div>

      {/* REVIEW_REQUIRED explanation — no fake deficit numbers */}
      {isReview && taskStatus?.reviewReason && (
        <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-2.5 text-xs space-y-0.5">
          <p className="text-yellow-700 font-medium">Validation issue detected</p>
          <p className="text-gray-600">{getReviewReasonLabel(taskStatus.reviewReason)}</p>
          <p className="text-gray-500">
            Allowed range: {taskStatus.reviewRangeMin ?? 0.5}–{taskStatus.reviewRangeMax ?? 100}h
          </p>
        </div>
      )}

      {task.subtasks?.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {expanded ? '▲ Hide subtasks' : `▼ Show ${task.subtasks.length} subtasks`}
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1">
              {task.subtasks.map((sub, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-1.5"
                >
                  <span className="text-gray-700">{sub.name}</span>
                  <span className="text-gray-400">{sub.hours}h</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
