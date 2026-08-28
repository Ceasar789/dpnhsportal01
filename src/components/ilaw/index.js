// ============================================
// ILAW INDEX - MAIN EXPORTS
// ============================================

// Main Component
export { default as ILAWLessonPlanGenerator, useILAW } from './ILAWLessonPlanGenerator';

// Sub Components
export { ILAWHome } from './components/Home';
export { LessonPlanForm } from './components/LessonPlanForm';
export { GeneratedLessonPlan } from './components/GeneratedLessonPlan';
export { PPTGenerator } from './components/PPTGenerator';
export { ExportOptions } from './components/ExportOptions';

// Custom Hooks
export { useLessonPlanForm } from './hooks/useLessonPlanForm';
export { useAIGeneration } from './hooks/useAIGeneration';

// Utilities
export * from './utils/depedFormatter';
export * from './utils/exportUtils';
export * from './utils/aiPrompts';
