import { createContext, useContext } from 'react';
import { useTaskCreation } from '../hooks/useTaskCreation';

// ---------------------------------------------------------------------------
// TaskCreationContext — provides a single shared useTaskCreation instance to
// all components in the tree (TaskCreationForm, TaskCard, Dashboard, etc.)
// This allows "Plan this Task" on a TaskCard to pre-fill the TaskCreationForm
// that lives elsewhere in the component tree.
// ---------------------------------------------------------------------------

const TaskCreationContext = createContext(null);

export function TaskCreationProvider({ children }) {
  const taskCreation = useTaskCreation();

  return (
    <TaskCreationContext.Provider value={taskCreation}>
      {children}
    </TaskCreationContext.Provider>
  );
}

export function useTaskCreationContext() {
  const ctx = useContext(TaskCreationContext);
  if (!ctx) {
    throw new Error('useTaskCreationContext must be used inside TaskCreationProvider');
  }
  return ctx;
}
