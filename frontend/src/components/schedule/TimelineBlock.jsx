import { getPriorityLabel, getPriorityColor } from '../../utils/taskHelpers';

export default function TimelineBlock({ date, blocks }) {
  const label = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const totalHours = blocks.reduce((s, b) => s + (b.durationHours || 0), 0);
  const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full whitespace-nowrap">
          {label}
        </span>
        <span className="text-xs text-gray-400 shrink-0">({totalHours}h)</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      <div className="space-y-2 pl-2">
        {sorted.map((block, i) => (
          <div
            key={i}
            className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm"
          >
            <div className="text-xs text-gray-400 font-mono shrink-0 pt-0.5 w-28">
              {block.startTime} – {block.endTime}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 truncate">{block.taskTitle}</p>
              <p className="text-xs text-gray-400 mt-0.5">{block.durationHours}h block</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {block.priorityScoreAtGeneration != null && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(
                    block.priorityScoreAtGeneration
                  )}`}
                >
                  {getPriorityLabel(block.priorityScoreAtGeneration)}
                </span>
              )}
              <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                {block.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
