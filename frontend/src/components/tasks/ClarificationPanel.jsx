import { useState } from 'react';

/**
 * ClarificationPanel
 *
 * Shown when N.O.V.A. needs more context before generating an AI plan.
 * - Renders suggested question buttons (one per item in `questions`)
 * - Clicking a button pre-fills the textarea; user can freely override the text
 * - "Submit" is enabled only when textarea is non-empty
 * - "Cancel" is always enabled
 *
 * Props:
 *   questions  string[]  - Suggested clarification options from the AI
 *   onSubmit   fn(answer: string) => void
 *   onCancel   fn() => void
 */
export default function ClarificationPanel({ questions = [], onSubmit, onCancel }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [answer, setAnswer] = useState('');

  const handleOptionClick = (index) => {
    setSelectedIndex(index);
    setAnswer(questions[index]);
  };

  const handleTextareaChange = (e) => {
    // Once the user types freely, deselect the button if text no longer matches
    const newValue = e.target.value;
    setAnswer(newValue);
    if (selectedIndex !== null && newValue !== questions[selectedIndex]) {
      setSelectedIndex(null);
    }
  };

  const handleSubmit = () => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1">
          Clarification Needed
        </p>
        <h2 className="text-base font-bold text-gray-900 leading-snug">
          N.O.V.A. needs a bit more context
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Select one of the suggested options below, or type your own answer.
        </p>
      </div>

      {/* ── Suggested Question Buttons ───────────────────── */}
      {questions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {questions.map((question, index) => {
            const isSelected = selectedIndex === index;
            return (
              <button
                key={index}
                type="button"
                onClick={() => handleOptionClick(index)}
                className={`text-sm px-3 py-2 rounded-md border transition-colors text-left ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white font-semibold'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700'
                }`}
              >
                {question}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Free-text Textarea ───────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Your Answer
        </label>
        <textarea
          rows={4}
          value={answer}
          onChange={handleTextareaChange}
          placeholder="Select an option above or describe your task in more detail…"
          className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
        />
      </div>

      {/* ── Action Buttons ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!answer.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-md transition-colors"
        >
          Submit
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
    </div>
  );
}
