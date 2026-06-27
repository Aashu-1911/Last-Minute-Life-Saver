import { getPriorityLabel, getPriorityColor } from '../../utils/taskHelpers';

/**
 * Converts "HH:MM" (24h) → "h:MM AM/PM" (12h).
 * e.g. "16:30" → "4:30 PM", "09:00" → "9:00 AM"
 */
const to12h = (time24) => {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
};

/**
 * Formats durationHours into a human-readable string.
 * < 1h  → "X min"  (e.g. "30 min")
 * ≥ 1h  → "Xh Ymin" when there are leftover minutes, "Xh" when exact
 * e.g. 1.9 → "1h 54min", 2.1 → "2h 6min", 2.0 → "2h", 0.5 → "30 min"
 */
const formatDuration = (hours) => {
  const h = Math.round((hours || 0) * 10000) / 10000; // strip float garbage
  if (h < 1 / 60) return '< 1 min';
  const totalMins = Math.round(h * 60);
  const hPart = Math.floor(totalMins / 60);
  const mPart = totalMins % 60;
  if (hPart === 0) return `${mPart} min`;
  if (mPart === 0) return `${hPart}h`;
  return `${hPart}h ${mPart}min`;
};

/** Left-side color stripe based on priority score */
const priorityStripe = (score) => {
  if (score >= 70) return 'bg-red-400';
  if (score >= 40) return 'bg-yellow-400';
  return 'bg-green-400';
};

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
      {/* Date header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full whitespace-nowrap">
          {label}
        </span>
        <span className="text-xs text-gray-400 shrink-0 font-medium">
          {formatDuration(totalHours)} total
        </span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* Block list */}
      <div className="space-y-2 pl-1">
        {sorted.map((block, i) => {
          const isReminder = block.isReminder === true;
          return (
            <div
              key={i}
              className={`flex items-stretch gap-0 rounded-lg overflow-hidden border shadow-sm transition-shadow hover:shadow-md ${
                isReminder
                  ? 'border-blue-100 bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* Priority color stripe */}
              {!isReminder && (
                <div
                  className={`w-1 shrink-0 ${priorityStripe(
                    block.priorityScoreAtGeneration ?? 0
                  )}`}
                />
              )}
              {/* Reminder accent */}
              {isReminder && (
                <div className="w-1 shrink-0 bg-blue-400" />
              )}

              <div className="flex items-center gap-4 px-4 py-3 flex-1 min-w-0">
                {/* Time range */}
                <div className="shrink-0 text-center min-w-[80px]">
                  <p className="text-xs font-semibold text-gray-700 tabular-nums">
                    {to12h(block.startTime)}
                  </p>
                  <p className="text-xs text-gray-400 tabular-nums">
                    {to12h(block.endTime)}
                  </p>
                </div>

                {/* Divider */}
                <div className="w-px h-8 bg-gray-200 shrink-0" />

                {/* Task info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {block.taskTitle}
                    </p>
                    {isReminder && (
                      <span className="text-xs bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full shrink-0">
                        🔔 reminder
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {isReminder ? 'Habit reminder' : formatDuration(block.durationHours) + ' block'}
                  </p>
                </div>

                {/* Right badges */}
                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                  {!isReminder && block.priorityScoreAtGeneration != null && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityColor(
                        block.priorityScoreAtGeneration
                      )}`}
                    >
                      {getPriorityLabel(block.priorityScoreAtGeneration)}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      block.status === 'PLANNED'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {block.status}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
