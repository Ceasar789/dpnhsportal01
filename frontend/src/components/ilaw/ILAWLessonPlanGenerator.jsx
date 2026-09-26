// ============================================
// ILAW LESSON PLAN GENERATOR - MAIN CONTAINER
// ============================================

import React, { useState, useCallback, createContext, useContext } from 'react';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

// Import components
import { ILAWHome } from './components/Home';
import { LessonPlanForm } from './components/LessonPlanForm';
import { GeneratedLessonPlan } from './components/GeneratedLessonPlan';
import { PPTGenerator } from './components/PPTGenerator';
import { ExportOptions } from './components/ExportOptions';

// Import hooks
import { useAIGeneration } from './hooks/useAIGeneration';

// ============================================
// ILAW CONTEXT (for theme and global state)
// ============================================
const ILAWContext = createContext();

export const useILAW = () => useContext(ILAWContext);

export const ILAWLessonPlanGenerator = ({ dark = false, teacherName = '' }) => {
  // State Management
  const [activeTab, setActiveTab] = useState('home'); // home, form, generated, ppt
  const [lessonPlan, setLessonPlan] = useState(null);
  const [recentPlans, setRecentPlans] = useState([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [toast, setToast] = useState(null);

  // AI Generation Hook
  const { generateLessonPlan, generatePPT, isGenerating, generationProgress, error: aiError } = useAIGeneration();

  // ============================================
  // TOAST NOTIFICATIONS
  // ============================================
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ============================================
  // LESSON PLAN GENERATION
  // ============================================
  const handleGenerateLessonPlan = useCallback(
    async (formData) => {
      try {
        setActiveTab('generating');
        const plan = await generateLessonPlan(formData, (progress) => {
          // Progress callback
        });

        if (plan) {
          setLessonPlan(plan);
          setRecentPlans((prev) => [
            { ...plan, title: plan.subject },
            ...prev.slice(0, 4) // Keep last 5
          ]);
          setActiveTab('generated');
          showToast('Lesson plan generated successfully!', 'success');
        } else {
          showToast('Failed to generate lesson plan', 'error');
          setActiveTab('form');
        }
      } catch (error) {
        showToast(error.message || 'An error occurred', 'error');
        setActiveTab('form');
      }
    },
    [generateLessonPlan, showToast]
  );

  // ============================================
  // PPT GENERATION
  // ============================================
  const handleGeneratePPT = useCallback(
    async (currentLessonPlan) => {
      try {
        setActiveTab('generating');
        const ppt = await generatePPT(currentLessonPlan);

        if (ppt) {
          setActiveTab('ppt');
          showToast('PowerPoint generated successfully!', 'success');
          return ppt;
        } else {
          showToast('Failed to generate PowerPoint', 'error');
          setActiveTab('generated');
          return null;
        }
      } catch (error) {
        showToast(error.message || 'An error occurred', 'error');
        setActiveTab('generated');
      }
    },
    [generatePPT, showToast]
  );

  // ============================================
  // NAVIGATION HANDLERS
  // ============================================
  const handleEditLessonPlan = useCallback(() => {
    setActiveTab('form');
  }, []);

  const handleBackToGenerated = useCallback(() => {
    setActiveTab('generated');
  }, []);

  const handleCreateNew = useCallback(() => {
    setLessonPlan(null);
    setActiveTab('form');
  }, []);

  // ============================================
  // RENDER LOGIC
  // ============================================
  return (
    <ILAWContext.Provider value={{ dark, teacherName, showToast }}>
      <div className="min-h-screen" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed top-4 right-4 px-6 py-3 rounded-lg text-white font-semibold flex items-center gap-2 z-50 animate-fade-in ${
              toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
            }`}>
            {toast.type === 'error' ? (
              <AlertCircle size={20} />
            ) : (
              <CheckCircle size={20} />
            )}
            {toast.message}
          </div>
        )}

        {/* Generating State */}
        {activeTab === 'generating' && (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <Loader2 size={48} className="animate-spin text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                Generating Lesson Plan
              </h2>
              <div className="w-64 h-2 bg-gray-300 rounded-full overflow-hidden mt-4">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
              <p style={{ color: dark ? '#94a3b8' : '#64748b' }} className="mt-2">
                {generationProgress}%
              </p>
              {aiError && (
                <p style={{ color: '#dc2626' }} className="mt-4">
                  {aiError}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Home Tab */}
        {activeTab === 'home' && (
          <ILAWHome
            onGenerateNew={handleCreateNew}
            recentPlans={recentPlans}
            dark={dark}
            setActiveTab={setActiveTab}
          />
        )}

        {/* Form Tab */}
        {activeTab === 'form' && (
          <LessonPlanForm
            onSubmit={handleGenerateLessonPlan}
            isLoading={isGenerating}
            dark={dark}
          />
        )}

        {/* Generated Lesson Plan Tab */}
        {activeTab === 'generated' && lessonPlan && (
          <GeneratedLessonPlan
            lessonPlan={lessonPlan}
            dark={dark}
            onEdit={handleEditLessonPlan}
            onGeneratePPT={() => handleGeneratePPT(lessonPlan)}
          />
        )}

        {/* PPT Tab */}
        {activeTab === 'ppt' && lessonPlan && (
          <PPTGenerator
            lessonPlan={lessonPlan}
            dark={dark}
            onBack={handleBackToGenerated}
            isGenerating={isGenerating}
            onGenerate={handleGeneratePPT}
          />
        )}

        {/* Export Modal */}
        {showExportModal && lessonPlan && (
          <ExportOptions
            lessonPlan={lessonPlan}
            dark={dark}
            onClose={() => setShowExportModal(false)}
          />
        )}

        {/* Navigation Buttons - Always visible */}
        {activeTab !== 'home' && (
          <div
            className="fixed bottom-6 left-6 flex gap-2 z-40"
            style={{ backgroundColor: dark ? '#1e293b' : '#ffffff' }}>
            <button
              onClick={() => setActiveTab('home')}
              className="px-4 py-2 rounded-lg font-semibold"
              style={{
                backgroundColor: dark ? '#0f172a' : '#f8fafc',
                color: dark ? '#f1f5f9' : '#1a2b4a',
                border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`
              }}>
              Home
            </button>
            {activeTab === 'generated' && (
              <button
                onClick={() => setShowExportModal(true)}
                className="px-4 py-2 rounded-lg font-semibold text-white"
                style={{ backgroundColor: '#1e3a5f' }}>
                Export
              </button>
            )}
          </div>
        )}
      </div>
    </ILAWContext.Provider>
  );
};

export default ILAWLessonPlanGenerator;
