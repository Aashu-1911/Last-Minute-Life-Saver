import { NavLink } from 'react-router-dom';
import { useTaskContext } from '../../context/TaskContext';

export default function Navbar() {
  const { insights } = useTaskContext();
  const score = insights?.productivityScore ?? 0;

  const scoreColor =
    score >= 75 ? 'bg-green-100 text-green-700' :
    score >= 50 ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-700';

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-indigo-600">N.O.V.A.</span>
          <span className="text-sm text-gray-400 hidden sm:inline">AI Productivity Copilot</span>
        </div>

        <div className="flex items-center gap-4">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                isActive ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:text-indigo-600'
              }`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/schedule"
            className={({ isActive }) =>
              `text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                isActive ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:text-indigo-600'
              }`
            }
          >
            Schedule
          </NavLink>

          {insights?.productivityScore !== undefined && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${scoreColor}`}>
              Score: {score}/100
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
