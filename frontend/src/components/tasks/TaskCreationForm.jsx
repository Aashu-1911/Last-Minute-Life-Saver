import { useRef, useState } from 'react';
import { useTaskCreation } from '../../hooks/useTaskCreation';
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
    updateDraft,
    addAttachment,
    removeAttachment,
    submitForPreview,
    submitClarification,
    approveTask,
    edit,
    backToPreview,
    cancel,
  } = useTaskCreation();

  // Per-field inline validation errors (only shown after first submit attempt)
  const [fieldErrors, setFieldErrors] = useState({});
  // Track whether the user has attempted to submit (to show inline errors)
  const [submitted, setSubmitted] = useState(false);
  // Attachment-specific error (file type / size)
  const [attachmentError, setAttachmentError] = useState(null);
  const fileInputRef = useRef(null);

  // -------------------------------------------------------------------------
  // Validation helpers
  // -------------------------------------------------------------------------
  const todayStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })(); // YYYY-MM-DD in local time

  const validateForm = () => {
    const errs = {};
    if (!draftTask.title || draftTask.title.trim().length < 3) {
      errs.title = 'Title must be at least 3 characters.';
    }
    if (!draftTask.deadline) {
      errs.deadline = 'Deadline is required.';
    } else if (draftTask.deadline <= todayStr) {
      errs.deadline = 'Deadline must be a future date.';
    }
    return errs;
  };

  const isSubmitDisabled =
    !draftTask.title || draftTask.title.trim().length < 3 || !draftTask.deadline || draftTask.deadline <= todayStr || loading;

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------
  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validateForm();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    submitForPreview();
  };

  const handleFieldChange = (field, value) => {
    updateDraft(field, value);
    // Validate deadline in real-time (always, not just after submit)
    if (field === 'deadline') {
      if (!value) {
        setFieldErrors((prev) => ({ ...prev, deadline: 'Deadline is required.' }));
      } else if (value <= todayStr) {
        setFieldErrors((prev) => ({ ...prev, deadline: 'Please enter a valid future deadline.' }));
      } else {
        setFieldErrors((prev) => { const next = { ...prev }; delete next.deadline; return next; });
      }
      return;
    }
    // Clear other field errors on edit (after first submit attempt)
    if (submitted && fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleFileChange = (e) => {
    setAttachmentError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // MIME validation
    const isMimeValid = file.type === 'application/pdf' || file.type.startsWith('image/');
    if (!isMimeValid) {
      setAttachmentError('Only PDF and image files are allowed.');
      e.target.value = '';
      return;
    }
    // Size validation (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError('File size must not exceed 10 MB.');
      e.target.value = '';
      return;
    }

    addAttachment(file);
    // Reset input so the same file can be re-selected after removal
    e.target.value = '';
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
  return (
    <div className="space-y-5">
      {/* ── Card wrapper ──────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4">✨ Create Task with AI</h2>

        {/* ── Global error banner (form-filling state only) ── */}
        {uiState === 'form-filling' && error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Row 1: Title + Deadline */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Title */}
            <div>
              <label className={labelCls} htmlFor="tcf-title">
                Task Title <span className="text-red-500">*</span>
              </label>
              <input
                id="tcf-title"
                type="text"
                maxLength={200}
                value={draftTask.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                placeholder="e.g. Build REST API for user auth"
                className={`${fieldCls} ${fieldErrors.title ? 'border-red-400 focus:ring-red-400' : ''}`}
                aria-describedby={fieldErrors.title ? 'tcf-title-err' : undefined}
                aria-invalid={!!fieldErrors.title}
                disabled={loading}
              />
              {fieldErrors.title && (
                <p id="tcf-title-err" className={errorCls} role="alert">
                  {fieldErrors.title}
                </p>
              )}
            </div>

            {/* Deadline */}
            <div>
              <label className={labelCls} htmlFor="tcf-deadline">
                Deadline <span className="text-red-500">*</span>
              </label>
              <input
                id="tcf-deadline"
                type="date"
                value={draftTask.deadline}
                min={(() => { const d = new Date(); d.setDate(d.getDate() + 1); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; })()}
                onChange={(e) => handleFieldChange('deadline', e.target.value)}
                className={`${fieldCls} ${fieldErrors.deadline ? 'border-red-400 focus:ring-red-400' : ''}`}
                aria-describedby={fieldErrors.deadline ? 'tcf-deadline-err' : undefined}
                aria-invalid={!!fieldErrors.deadline}
                disabled={loading}
              />
              {fieldErrors.deadline && (
                <p id="tcf-deadline-err" className={errorCls} role="alert">
                  {fieldErrors.deadline}
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Description */}
          <div>
            <label className={labelCls} htmlFor="tcf-description">
              Description{' '}
              <span className="text-gray-400 font-normal">(highly recommended)</span>
            </label>
            <textarea
              id="tcf-description"
              rows={3}
              maxLength={2000}
              value={draftTask.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
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
              <label className={labelCls} htmlFor="tcf-category">Category</label>
              <select
                id="tcf-category"
                value={draftTask.category}
                onChange={(e) => handleFieldChange('category', e.target.value)}
                className={fieldCls}
                disabled={loading}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="tcf-tasktype">Task Type</label>
              <select
                id="tcf-tasktype"
                value={draftTask.taskType}
                onChange={(e) => handleFieldChange('taskType', e.target.value)}
                className={fieldCls}
                disabled={loading}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="tcf-difficulty">Difficulty</label>
              <select
                id="tcf-difficulty"
                value={draftTask.difficulty}
                onChange={(e) => handleFieldChange('difficulty', e.target.value)}
                className={fieldCls}
                disabled={loading}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Importance */}
          <div>
            <label className={labelCls} htmlFor="tcf-importance">
              Importance (1–5):{' '}
              <strong className="text-gray-800">{draftTask.importance}</strong>
            </label>
            <input
              id="tcf-importance"
              type="range"
              min={1}
              max={5}
              step={1}
              value={draftTask.importance}
              onChange={(e) => handleFieldChange('importance', Number(e.target.value))}
              className="w-full mt-1 accent-indigo-600"
              disabled={loading}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>

          {/* Row 5: Daily Availability + Preferred Working Time */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="tcf-dailyavail">
                Daily Availability{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id="tcf-dailyavail"
                value={draftTask.dailyAvailability}
                onChange={(e) => handleFieldChange('dailyAvailability', e.target.value)}
                className={fieldCls}
                disabled={loading}
              >
                <option value="">— not specified —</option>
                {DAILY_AVAIL.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="tcf-worktime">
                Preferred Working Time{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id="tcf-worktime"
                value={draftTask.preferredWorkingTime}
                onChange={(e) => handleFieldChange('preferredWorkingTime', e.target.value)}
                className={fieldCls}
                disabled={loading}
              >
                <option value="">— not specified —</option>
                {WORK_TIMES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 6: Attachments */}
          <div>
            <label className={labelCls}>
              Attachments{' '}
              <span className="text-gray-400 font-normal">
                (PDF or image, max 10 MB each, up to 5 files)
              </span>
            </label>

            {/* Existing attachments list */}
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
                      onClick={() => removeAttachment(i)}
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

            {/* File picker — hidden when max reached */}
            {draftTask.attachments.length < 5 && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="tcf-file"
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

          {/* ── Submit button ────────────────────────────── */}
          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 rounded-md transition-colors"
            >
              {loading ? (
                <>
                  <Spinner />
                  Generating Plan…
                </>
              ) : (
                '🤖 Generate Plan'
              )}
            </button>

            {/* Back to Preview — shown when the user came here via Edit */}
            {previewTask && !loading && (
              <button
                type="button"
                onClick={backToPreview}
                className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ← Back to Preview
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── Skeleton preview area (loading state only) ──── */}
      {uiState === 'loading' && (
        <div aria-label="Generating AI plan…" aria-live="polite">
          <SkeletonCard lines={4} />
        </div>
      )}
    </div>
  );
}
