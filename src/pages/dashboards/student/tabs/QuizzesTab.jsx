// ============================================
// FILE: src/pages/dashboards/student/tabs/QuizzesTab.jsx
// QUIZZES TAB — Supabase + Real-time
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { useTheme, useToast, Card, Badge } from '../hooks';

const QuizzesTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();

  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('student_id', userData?.uid)
        .order('date', { ascending: false });

      if (error) throw error;
      setQuizzes(data || []);
    } catch (err) {
      showToast('Error fetching quizzes', 'error');
    }
    setLoading(false);
  }, [userData?.uid]);

  useEffect(() => {
    if (userData?.uid) fetchQuizzes();

    const channel = supabase
      .channel('student-quizzes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quizzes', filter: `student_id=eq.${userData?.uid}` }, fetchQuizzes)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userData?.uid, fetchQuizzes]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Toast />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>My Quizzes</h1>
        <button onClick={fetchQuizzes} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} style={{ color: dark ? '#64748b' : '#94a3b8' }} /></div>
      ) : quizzes.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText size={40} className="mx-auto mb-3" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
          <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>No quizzes found.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {quizzes.map((quiz, i) => (
            <Card key={quiz.id || i} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{quiz.title}</h3>
                  <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{quiz.subject}</p>
                  <p className="text-xs mt-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                    {new Date(quiz.date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {quiz.score !== null ? (
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{quiz.score}/{quiz.total_score || 50}</p>
                    <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{((quiz.score/(quiz.total_score || 50))*100).toFixed(0)}%</p>
                    <Badge 
                      color={quiz.score >= (quiz.total_score || 50) * 0.75 ? '#16a34a' : quiz.score >= (quiz.total_score || 50) * 0.5 ? '#d97706' : '#dc2626'}
                      bg={quiz.score >= (quiz.total_score || 50) * 0.75 ? 'rgba(22,163,74,0.12)' : quiz.score >= (quiz.total_score || 50) * 0.5 ? 'rgba(217,119,6,0.12)' : 'rgba(220,38,38,0.12)'}
                    >
                      {quiz.score >= (quiz.total_score || 50) * 0.75 ? 'Passed' : quiz.score >= (quiz.total_score || 50) * 0.5 ? 'Average' : 'Failed'}
                    </Badge>
                  </div>
                ) : (
                  <Badge color="#2563eb" bg="rgba(37,99,235,0.12)">Upcoming</Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// ATTENDANCE TAB — Supabase + Real-time
// ORIGINAL DESIGN PRESERVED
// ============================================

export default QuizzesTab;
