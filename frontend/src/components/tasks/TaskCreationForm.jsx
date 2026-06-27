import { useRef, useState } from 'react';
import { useTaskCreationContext } from '../../context/TaskCreationContext';
import SkeletonCard from '../common/SkeletonCard';
import PreviewCard from './PreviewCard';
import ClarificationPanel from './ClarificationPanel';

// ---------------------------------------------------------------------------
// Field option constants (match backend validator enums)
// ---------------------------------------------------------------------------
const CATEGORIES = [
  'Work', 'Personal', 'Health', 'Finance', 'Learning', 'Social', 'Home', 'Other',
];
const TASK_TYPES = [
  'Deep Work', 'Meeting', 'Admin', 'Creative', 'Exercise', 'Errand', 'Other',
];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Very Hard'];
const DAILY_AVAIL = ['< 1 hour', '1-2 hours', '2-4 hours', '4-6 hours', '6+ hours'];
const WORK_TIMES = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Late Night'];
const EXPERIENCE_LEVELS = ['Never done before', 'Some experience', 'Comfortable', 'Expert'];
const TIME_PREFERENCES = ['Morning', 'Afternoon', 'Evening', 'Night'];
const ENERGY_LEVELS = ['High Focus', 'Normal', 'Low Energy'];
const RECURRING_INTERVALS = ['Daily', 'Weekly', 'Monthly'];

// ---------------------------------------------------------------------------
// Utility: human-readable file size
// ---------------------------------------------------------------------------
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Spinner icon (inline — avoids external dependency)
// ---------------------------------------------------------------------------
function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg
      className={`animate-spin shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared input/select class helpers
// ---------------------------------------------------------------------------
const fieldCls =
  'w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
const errorCls = 'mt-1 text-xs text-red-600';

// ---------------------------------------------------------------------------
// Mode Toggle — "⚡ Quick Task" | "🧠 AI Project Planner"
// ---------------------------------------------------------------------------
function ModeToggle({ mode, switchMode, disabled }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-5" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'quick'}
        onClick={() => switchMode('quick')}
        disabled={disabled}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors
          ${mode === 'quick'
            ? 'bg-indigo-600 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        ⚡ Quick Task
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'ai'}
        onClick={() => switchMode('ai')}
        disabled={disabled}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors
          ${mode === 'ai'
            ? 'bg-indigo-600 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        🧠 AI Project Planner
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickTaskForm
// ---------------------------------------------------------------------------
function QuickTaskForm({ draftTask, updateDraft, onSave, loading, error }) {
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  // Auto-set deadline to today on first render if not already set
  const todayIso = new Date().toISOString().slice(0, 10);

  const validateQuick = () => {
    const errs = {};
    if (!draftTask.title || draftTask.title.trim().length < 3) {
      errs.title = 'Title must be at least 3 characters.';
    }
    return errs;
  };

  const handleSave = (e) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validateQuick();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    onSave();
  };

  const handleChange = (field, value) => {
    updateDraft(field, value);
    if (submitted && fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  const isSaveDisabled = !draftTask.title || draftTask.title.trim().length < 3 || loading;

  return (
    <form onSubmit={handleSave} noValidate className="space-y-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label className={labelCls} htmlFor="qt-title">
          Task Title <span className="text-red-500">*</span>
        </label>
        <input
          id="qt-title"
          type="text"
          maxLength={200}
          value={draftTask.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="e.g. Buy groceries"
          className={`${fieldCls} ${fieldErrors.title ? 'border-red-400 focus:ring-red-400' : ''}`}
          aria-describedby={fieldErrors.title ? 'qt-title-err' : undefined}
          aria-invalid={!!fieldErrors.title}
          disabled={loading}
        />
        {fieldErrors.title && (
          <p id="qt-title-err" className={errorCls} role="alert">{fieldErrors.title}</p>
        )}
      </div>

      {/* Priority */}
      <div>
        <label className={labelCls} htmlFor="qt-importance">
          Priority (1–5): <strong className="text-gray-800">{draftTask.importance}</strong>
        </label>
        <input
          id="qt-importance"
          type="range"
          min={1} max={5} step={1}
          value={draftTask.importance}
          onChange={(e) => handleChange('importance', Number(e.target.value))}
          className="w-full mt-1 accent-indigo-600"
          disabled={loading}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>Low</span><span>High</span>
        </div>
      </div>

      {/* Category + Preferred Working Time — always visible */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="qt-category">Category</label>
          <select
            id="qt-category"
            value={draftTask.category}
            onChange={(e) => handleChange('category', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            <option value="">— not specified —</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="qt-worktime">Preferred Working Time</label>
          <select
            id="qt-worktime"
            value={draftTask.preferredWorkingTime}
            onChange={(e) => handleChange('preferredWorkingTime', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            <option value="">— not specified —</option>
            {WORK_TIMES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Recurring / Frequency section */}
      <div className="space-y-3">
        {/* Repeat mode toggle */}
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              handleChange('isRecurring', false);
              handleChange('recurringInterval', '');
              handleChange('frequencyPerDay', '');
            }}
            className={`flex-1 py-2 transition-colors ${
              !draftTask.isRecurring && !draftTask.frequencyPerDay
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
            disabled={loading}
          >
            Once
          </button>
          <button
            type="button"
            onClick={() => {
              handleChange('isRecurring', true);
              handleChange('frequencyPerDay', '');
            }}
            className={`flex-1 py-2 transition-colors border-l border-gray-200 ${
              draftTask.isRecurring
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
            disabled={loading}
          >
            Recurring
          </button>
          <button
            type="button"
            onClick={() => {
              handleChange('isRecurring', false);
              handleChange('recurringInterval', '');
              handleChange('frequencyPerDay', draftTask.frequencyPerDay || 2);
            }}
            className={`flex-1 py-2 transition-colors border-l border-gray-200 ${
              !draftTask.isRecurring && draftTask.frequencyPerDay
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
            disabled={loading}
          >
            × per day
          </button>
        </div>

        {/* Recurring interval picker */}
        {draftTask.isRecurring && (
          <div className="flex gap-2">
            {RECURRING_INTERVALS.map((interval) => (
              <button
                key={interval}
                type="button"
                onClick={() => handleChange('recurringInterval', interval)}
                disabled={loading}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors
                  ${draftTask.recurringInterval === interval
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                  } disabled:opacity-50`}
              >
                {interval}
              </button>
            ))}
          </div>
        )}

        {/* Frequency per day picker */}
        {!draftTask.isRecurring && draftTask.frequencyPerDay ? (
          <div>
            <label className={labelCls} htmlFor="qt-freq">
              Times per day: <strong className="text-gray-800">{draftTask.frequencyPerDay}×</strong>
            </label>
            <input
              id="qt-freq"
              type="range"
              min={1} max={12} step={1}
              value={draftTask.frequencyPerDay || 2}
              onChange={(e) => handleChange('frequencyPerDay', Number(e.target.value))}
              className="w-full mt-1 accent-indigo-600"
              disabled={loading}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>1× / day</span>
              <span className="text-indigo-600 font-medium">
                every {Math.round(16 / (draftTask.frequencyPerDay || 2) * 10) / 10}h
              </span>
              <span>12× / day</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Hidden today-deadline — quick tasks always due today */}
      <input type="hidden" value={todayIso} readOnly />

      {/* Save button */}
      <div className="pt-1">
        <button
          type="submit"
          disabled={isSaveDisabled}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 rounded-md transition-colors"
        >
          {loading ? <><Spinner />Saving…</> : '⚡ Save Task'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// AIProjectForm — all existing AI fields + new Experience/Time/Energy fields
// ---------------------------------------------------------------------------
function AIProjectForm({
  draftTask, updateDraft, onSubmit, onBackToPreview,
  hasPreview, loading, error, fieldErrors,
}) {
  const fileInputRef = useRef(null);
  const [attachmentError, setAttachmentError] = useState(null);
  const { addAttachment, removeAttachment } = useAttachmentHandlers();

  const handleFileChange = (e) => {
    setAttachmentError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const isMimeValid = file.type === 'application/pdf' || file.type.startsWith('image/');
    if (!isMimeValid) {
      setAttachmentError('Only PDF and image files are allowed.');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError('File size must not exceed 10 MB.');
      e.target.value = '';
      return;
    }
    addAttachment(file, draftTask, updateDraft);
    e.target.value = '';
  };

  const isSubmitDisabled =
    !draftTask.title || draftTask.title.trim().length < 3 ||
    !draftTask.deadline || draftTask.deadline <= todayStr() ||
    loading;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error}
        </div>
      )}

      {/* Row 1: Title + Deadline */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="ai-title">
            Task Title <span className="text-red-500">*</span>
          </label>
          <input
            id="ai-title"
            type="text"
            maxLength={200}
            value={draftTask.title}
            onChange={(e) => updateDraft('title', e.target.value)}
            placeholder="e.g. Build REST API for user auth"
            className={`${fieldCls} ${fieldErrors.title ? 'border-red-400 focus:ring-red-400' : ''}`}
            aria-describedby={fieldErrors.title ? 'ai-title-err' : undefined}
            aria-invalid={!!fieldErrors.title}
            disabled={loading}
          />
          {fieldErrors.title && (
            <p id="ai-title-err" className={errorCls} role="alert">{fieldErrors.title}</p>
          )}
        </div>
        <div>
          <label className={labelCls} htmlFor="ai-deadline">
            Deadline <span className="text-red-500">*</span>
          </label>
          <input
            id="ai-deadline"
            type="date"
            value={draftTask.deadline}
            min={tomorrowStr()}
            onChange={(e) => updateDraft('deadline', e.target.value)}
            className={`${fieldCls} ${fieldErrors.deadline ? 'border-red-400 focus:ring-red-400' : ''}`}
            aria-describedby={fieldErrors.deadline ? 'ai-deadline-err' : undefined}
            aria-invalid={!!fieldErrors.deadline}
            disabled={loading}
          />
          {fieldErrors.deadline && (
            <p id="ai-deadline-err" className={errorCls} role="alert">{fieldErrors.deadline}</p>
          )}
        </div>
      </div>

      {/* Row 2: Description */}
      <div>
        <label className={labelCls} htmlFor="ai-description">
          Description <span className="text-gray-400 font-normal">(highly recommended)</span>
        </label>
        <textarea
          id="ai-description"
          rows={3}
          maxLength={2000}
          value={draftTask.description}
          onChange={(e) => updateDraft('description', e.target.value)}
          placeholder="Describe the task in detail."
          className={`${fieldCls} resize-none`}
          disabled={loading}
        />
        <p className="text-xs text-gray-400 mt-0.5 text-right">
          {draftTask.description.length}/2000
        </p>
      </div>

      {/* Row 3: Category + Task Type + Difficulty */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls} htmlFor="ai-category">Category</label>
          <select
            id="ai-category"
            value={draftTask.category}
            onChange={(e) => updateDraft('category', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="ai-tasktype">Task Type</label>
          <select
            id="ai-tasktype"
            value={draftTask.taskType}
            onChange={(e) => updateDraft('taskType', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="ai-difficulty">Difficulty</label>
          <select
            id="ai-difficulty"
            value={draftTask.difficulty}
            onChange={(e) => updateDraft('difficulty', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Row 4: Importance */}
      <div>
        <label className={labelCls} htmlFor="ai-importance">
          Importance (1–5): <strong className="text-gray-800">{draftTask.importance}</strong>
        </label>
        <input
          id="ai-importance"
          type="range"
          min={1} max={5} step={1}
          value={draftTask.importance}
          onChange={(e) => updateDraft('importance', Number(e.target.value))}
          className="w-full mt-1 accent-indigo-600"
          disabled={loading}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>Low</span><span>High</span>
        </div>
      </div>

      {/* Row 5: Daily Availability + Preferred Working Time */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="ai-dailyavail">
            Daily Availability <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            id="ai-dailyavail"
            value={draftTask.dailyAvailability}
            onChange={(e) => updateDraft('dailyAvailability', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            <option value="">— not specified —</option>
            {DAILY_AVAIL.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="ai-worktime">
            Preferred Working Time <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            id="ai-worktime"
            value={draftTask.preferredWorkingTime}
            onChange={(e) => updateDraft('preferredWorkingTime', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            <option value="">— not specified —</option>
            {WORK_TIMES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Row 6: Experience Level + Time Preference + Energy Level (NEW) */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls} htmlFor="ai-experience">
            Experience Level <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            id="ai-experience"
            value={draftTask.experienceLevel}
            onChange={(e) => updateDraft('experienceLevel', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            {EXPERIENCE_LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="ai-timepref">
            Time Preference <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            id="ai-timepref"
            value={draftTask.timePreference}
            onChange={(e) => updateDraft('timePreference', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            <option value="">— not specified —</option>
            {TIME_PREFERENCES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="ai-energy">
            Energy Level <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            id="ai-energy"
            value={draftTask.energyLevel}
            onChange={(e) => updateDraft('energyLevel', e.target.value)}
            className={fieldCls}
            disabled={loading}
          >
            <option value="">— not specified —</option>
            {ENERGY_LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Row 7: Attachments */}
      <div>
        <label className={labelCls}>
          Attachments <span className="text-gray-400 font-normal">(PDF or image, max 10 MB each, up to 5 files)</span>
        </label>
        {draftTask.attachments.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {draftTask.attachments.map((att, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-500 shrink-0">📎</span>
                  <span className="truncate text-gray-700">{att.name}</span>
                  <span className="shrink-0 text-xs text-gray-400">{formatBytes(att.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i, draftTask, updateDraft)}
                  disabled={loading}
                  className="shrink-0 ml-3 text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                  aria-label={`Remove ${att.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {draftTask.attachments.length < 5 && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              id="ai-file"
              accept="application/pdf,image/*"
              onChange={handleFileChange}
              disabled={loading}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:text-sm file:text-gray-600 file:bg-gray-50 hover:file:bg-gray-100 cursor-pointer disabled:opacity-50"
            />
            {attachmentError && (
              <p className={errorCls} role="alert">{attachmentError}</p>
            )}
          </div>
        )}
      </div>

      {/* Submit + Back to Preview */}
      <div className="pt-1 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 rounded-md transition-colors"
        >
          {loading ? <><Spinner />Generating Plan…</> : '🤖 Generate Plan'}
        </button>
        {hasPreview && !loading && (
          <button
            type="button"
            onClick={onBackToPreview}
            className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← Back to Preview
          </button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Utility helpers used by AIProjectForm
// ---------------------------------------------------------------------------
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Attachment helpers that work directly with draftTask state via updateDraft
function useAttachmentHandlers() {
  const addAttachment = (file, draftTask, updateDraft) => {
    const metadata = {
      name: file.name,
      size: file.size,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
    };
    updateDraft('attachments', [...draftTask.attachments, metadata]);
  };

  const removeAttachment = (index, draftTask, updateDraft) => {
    const updated = [...draftTask.attachments];
    updated.splice(index, 1);
    updateDraft('attachments', updated);
  };

  return { addAttachment, removeAttachment };
}

// ---------------------------------------------------------------------------
// TaskCreationForm — main export
// ---------------------------------------------------------------------------
export default function TaskCreationForm() {
  const {
    uiState,
    draftTask,
    previewTask,
    clarificationQuestions,
    loading,
    error,
    mode,
    updateDraft,
    switchMode,
    submitForPreview,
    submitClarification,
    approveTask,
    saveQuickTask,
    edit,
    backToPreview,
    cancel,
  } = useTaskCreationContext();

  // AI form field errors (only shown after first submit attempt)
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  // -------------------------------------------------------------------------
  // Validation for AI form
  // -------------------------------------------------------------------------
  const validateAIForm = () => {
    const today = todayStr();
    const errs = {};
    if (!draftTask.title || draftTask.title.trim().length < 3) {
      errs.title = 'Title must be at least 3 characters.';
    }
    if (!draftTask.deadline) {
      errs.deadline = 'Deadline is required.';
    } else if (draftTask.deadline <= today) {
      errs.deadline = 'Deadline must be a future date.';
    }
    return errs;
  };

  const handleAISubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validateAIForm();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    submitForPreview();
  };

  const handleAIFieldChange = (field, value) => {
    updateDraft(field, value);
    // Live-validate deadline
    if (field === 'deadline') {
      const today = todayStr();
      if (!value) {
        setFieldErrors((prev) => ({ ...prev, deadline: 'Deadline is required.' }));
      } else if (value <= today) {
        setFieldErrors((prev) => ({ ...prev, deadline: 'Please enter a valid future deadline.' }));
      } else {
        setFieldErrors((prev) => { const next = { ...prev }; delete next.deadline; return next; });
      }
      return;
    }
    if (submitted && fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  // -------------------------------------------------------------------------
  // handleReplan — assumption correction replan flow (Requirement 9 / Task 17)
  // Called by PreviewCard when the user marks assumptions as wrong and clicks Replan.
  // Passes corrections as a separate _corrections field — NOT merged into description.
  // Sets _isClarificationResubmit: true so the backend enforces the 1-round limit.
  // -------------------------------------------------------------------------
  const handleReplan = (corrections) => {
    if (!corrections || corrections.length === 0) return;
    submitForPreview({
      _corrections: corrections,
      _isClarificationResubmit: true,
    });
  };

  // -------------------------------------------------------------------------
  // Render: preview state
  // -------------------------------------------------------------------------
  if (uiState === 'preview') {
    return (
      <PreviewCard
        plan={previewTask}
        draftTask={draftTask}
        onApprove={approveTask}
        onEdit={edit}
        onCancel={cancel}
        onReplan={handleReplan}
        loading={loading}
        error={error}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Render: clarification state
  // -------------------------------------------------------------------------
  if (uiState === 'clarification') {
    return (
      <ClarificationPanel
        questions={clarificationQuestions}
        onSubmit={submitClarification}
        onCancel={cancel}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Render: form-filling + loading states
  // -------------------------------------------------------------------------

  // Proxy updateDraft for AI form — adds live validation
  const aiUpdateDraft = (field, value) => {
    handleAIFieldChange(field, value);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        {/* Mode toggle — always visible */}
        <ModeToggle mode={mode} switchMode={switchMode} disabled={loading} />

        {mode === 'quick' ? (
          <QuickTaskForm
            draftTask={draftTask}
            updateDraft={updateDraft}
            onSave={saveQuickTask}
            loading={loading}
            error={error}
          />
        ) : (
          <AIProjectForm
            draftTask={draftTask}
            updateDraft={aiUpdateDraft}
            onSubmit={handleAISubmit}
            onBackToPreview={backToPreview}
            hasPreview={!!previewTask}
            loading={loading}
            error={uiState === 'form-filling' ? error : null}
            fieldErrors={fieldErrors}
          />
        )}
      </div>

      {/* Skeleton — shown during loading state */}
      {uiState === 'loading' && (
        <div aria-label="Generating AI plan…" aria-live="polite">
          <SkeletonCard lines={4} />
        </div>
      )}
    </div>
  );
}
