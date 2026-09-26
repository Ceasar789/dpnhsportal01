// ============================================
// GENERATED LESSON PLAN DISPLAY COMPONENT
// ============================================

import React, { useState } from 'react';
import { Download, Printer, Edit2, ChevronDown, FileText } from 'lucide-react';
import { exportToPDF, exportToWord, exportToPlainText, printLessonPlan, generateFilename } from '../utils/exportUtils';

export const GeneratedLessonPlan = ({ lessonPlan, dark, onEdit, onGeneratePPT }) => {
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    objectives: true,
    procedures: true
  });

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (!lessonPlan) {
    return (
      <div className="flex items-center justify-center p-8">
        <p style={{ color: dark ? '#94a3b8' : '#64748b' }}>No lesson plan generated yet.</p>
      </div>
    );
  }

  const filename = generateFilename(lessonPlan.subject, lessonPlan.date);

  return (
    <div className="max-w-5xl mx-auto p-6" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
      {/* Header with Export Options */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-3xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
          Generated Lesson Plan
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold"
            style={{
              backgroundColor: dark ? '#1e293b' : '#f0f0f0',
              color: dark ? '#f1f5f9' : '#1a2b4a'
            }}>
            <Edit2 size={18} /> Edit
          </button>
          <button
            onClick={() => printLessonPlan(lessonPlan)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold"
            style={{
              backgroundColor: dark ? '#1e293b' : '#f0f0f0',
              color: dark ? '#f1f5f9' : '#1a2b4a'
            }}>
            <Printer size={18} /> Print
          </button>
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white"
              style={{ backgroundColor: '#1e3a5f' }}>
              <Download size={18} /> Export
            </button>
            <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-xl hidden group-hover:block"
              style={{ backgroundColor: dark ? '#1e293b' : '#ffffff' }}>
              <button
                onClick={() => exportToPDF(lessonPlan, `${filename}.pdf`)}
                className="block w-full text-left px-4 py-2 hover:opacity-80"
                style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                📄 Export as PDF
              </button>
              <button
                onClick={() => exportToWord(lessonPlan, `${filename}.docx`)}
                className="block w-full text-left px-4 py-2 hover:opacity-80"
                style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                📘 Export as Word
              </button>
              <button
                onClick={() => exportToPlainText(lessonPlan, `${filename}.txt`)}
                className="block w-full text-left px-4 py-2 hover:opacity-80"
                style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                📝 Export as Text
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Overview Section */}
      <SectionCard
        title="LESSON INFORMATION"
        isExpanded={expandedSections.overview}
        onToggle={() => toggleSection('overview')}
        dark={dark}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="School" value={lessonPlan.school} dark={dark} />
          <InfoItem label="Grade Level" value={lessonPlan.gradeLevel} dark={dark} />
          <InfoItem label="Subject" value={lessonPlan.subject} dark={dark} />
          <InfoItem label="Section" value={lessonPlan.section} dark={dark} />
          <InfoItem label="Quarter" value={lessonPlan.quarter} dark={dark} />
          <InfoItem label="Week" value={lessonPlan.week} dark={dark} />
          <InfoItem label="Date" value={lessonPlan.date} dark={dark} />
          <InfoItem label="Teacher" value={lessonPlan.teacherName} dark={dark} />
        </div>
      </SectionCard>

      {/* Competency */}
      <SectionCard title="LEARNING COMPETENCY (MELC)" dark={dark}>
        <div className="mb-2">
          {lessonPlan.competencyCode && (
            <p style={{ color: dark ? '#94a3b8' : '#64748b' }} className="text-sm">
              Code: {lessonPlan.competencyCode}
            </p>
          )}
        </div>
        <p style={{ color: dark ? '#cbd5e1' : '#374151' }} className="leading-relaxed">
          {lessonPlan.competency}
        </p>
      </SectionCard>

      {/* Learning Objectives */}
      <SectionCard
        title="I. LEARNING OBJECTIVES"
        isExpanded={expandedSections.objectives}
        onToggle={() => toggleSection('objectives')}
        dark={dark}>
        <div className="space-y-4">
          <ObjectiveCategory
            title="Knowledge - Students will know:"
            items={lessonPlan.objectives?.knowledge || lessonPlan.knowledge?.split('\n').filter(Boolean)}
            dark={dark}
          />
          <ObjectiveCategory
            title="Skills - Students will be able to:"
            items={lessonPlan.objectives?.skills || lessonPlan.skills?.split('\n').filter(Boolean)}
            dark={dark}
          />
          <ObjectiveCategory
            title="Attitude - Students will develop:"
            items={lessonPlan.objectives?.attitude || lessonPlan.attitude?.split('\n').filter(Boolean)}
            dark={dark}
          />
          <ObjectiveCategory
            title="Values - Students will appreciate:"
            items={lessonPlan.objectives?.values || lessonPlan.values?.split('\n').filter(Boolean)}
            dark={dark}
          />
        </div>
      </SectionCard>

      {/* Learning Resources */}
      <SectionCard title="II. LEARNING RESOURCES" dark={dark}>
        <ul className="space-y-2">
          {(lessonPlan.resources || []).map((resource, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-blue-500 font-bold mt-1">•</span>
              <span style={{ color: dark ? '#cbd5e1' : '#374151' }}>{resource}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Subject Matter */}
      {lessonPlan.content && (
        <SectionCard title="III. SUBJECT MATTER / CONTENT" dark={dark}>
          <p style={{ color: dark ? '#cbd5e1' : '#374151' }} className="leading-relaxed whitespace-pre-wrap">
            {lessonPlan.content}
          </p>
        </SectionCard>
      )}

      {/* Procedures */}
      <SectionCard
        title="IV. LESSON PROCEDURES"
        isExpanded={expandedSections.procedures}
        onToggle={() => toggleSection('procedures')}
        dark={dark}>
        <div className="space-y-4">
          <ProcedureItem
            letter="A"
            title="Review"
            content={lessonPlan.procedures?.a_review?.description || lessonPlan.review || 'Review previous lessons'}
            duration={lessonPlan.procedures?.a_review?.duration}
            dark={dark}
          />
          <ProcedureItem
            letter="B"
            title="Motivation"
            content={lessonPlan.procedures?.b_motivation?.description || lessonPlan.motivation || 'Engage students'}
            duration={lessonPlan.procedures?.b_motivation?.duration}
            dark={dark}
          />
          <ProcedureItem
            letter="C"
            title="Lesson Proper"
            content={lessonPlan.procedures?.c_lessonProper?.description || lessonPlan.lessonProper || 'Present main lesson'}
            duration={lessonPlan.procedures?.c_lessonProper?.duration}
            dark={dark}
          />
          <ProcedureItem
            letter="D"
            title="Guided Practice"
            content={lessonPlan.procedures?.d_guidedPractice?.description || lessonPlan.guidedPractice || 'Structured activities'}
            duration={lessonPlan.procedures?.d_guidedPractice?.duration}
            dark={dark}
          />
          <ProcedureItem
            letter="E"
            title="Independent Practice"
            content={lessonPlan.procedures?.e_independentPractice?.description || lessonPlan.independentPractice || 'Individual tasks'}
            duration={lessonPlan.procedures?.e_independentPractice?.duration}
            dark={dark}
          />
          <ProcedureItem
            letter="F"
            title="Assessment"
            content={lessonPlan.procedures?.f_assessment?.description || lessonPlan.assessment || 'Assess learning'}
            duration={lessonPlan.procedures?.f_assessment?.duration}
            dark={dark}
          />
          <ProcedureItem
            letter="G"
            title="Assignment"
            content={lessonPlan.procedures?.g_assignment?.description || lessonPlan.assignment || 'Homework and enrichment'}
            dark={dark}
          />
        </div>
      </SectionCard>

      {/* Assessment */}
      <SectionCard title="V. ASSESSMENT STRATEGIES" dark={dark}>
        <div className="space-y-3">
          <div>
            <p className="font-semibold" style={{ color: dark ? '#cbd5e1' : '#475569' }}>Formative:</p>
            <p style={{ color: dark ? '#cbd5e1' : '#374151' }}>{lessonPlan.assessment || 'Assessment tools'}</p>
          </div>
        </div>
      </SectionCard>

      {/* Reflection */}
      <SectionCard title="VI. REFLECTION" dark={dark}>
        <p style={{ color: dark ? '#cbd5e1' : '#374151' }} className="leading-relaxed">
          {lessonPlan.reflection || 'Teacher reflection on lesson effectiveness'}
        </p>
      </SectionCard>

      {/* Signature Section */}
      <div
        className="mt-8 p-6 rounded-lg"
        style={{
          backgroundColor: dark ? '#1e293b' : '#f8fafc',
          border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`
        }}>
        <p className="font-semibold mb-6" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
          SIGNATURES
        </p>
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p style={{ color: dark ? '#cbd5e1' : '#475569' }} className="text-sm mb-8">
              _____________________
            </p>
            <p style={{ color: dark ? '#cbd5e1' : '#475569' }} className="font-semibold">
              Prepared by
            </p>
            <p style={{ color: dark ? '#94a3b8' : '#64748b' }} className="text-xs">
              Teacher
            </p>
          </div>
          <div>
            <p style={{ color: dark ? '#cbd5e1' : '#475569' }} className="text-sm mb-8">
              _____________________
            </p>
            <p style={{ color: dark ? '#cbd5e1' : '#475569' }} className="font-semibold">
              Checked by
            </p>
            <p style={{ color: dark ? '#94a3b8' : '#64748b' }} className="text-xs">
              Mentor Teacher
            </p>
          </div>
          <div>
            <p style={{ color: dark ? '#cbd5e1' : '#475569' }} className="text-sm mb-8">
              _____________________
            </p>
            <p style={{ color: dark ? '#cbd5e1' : '#475569' }} className="font-semibold">
              Approved by
            </p>
            <p style={{ color: dark ? '#94a3b8' : '#64748b' }} className="text-xs">
              Principal
            </p>
          </div>
        </div>
      </div>

      {/* PPT Generation Button */}
      <button
        onClick={onGeneratePPT}
        className="w-full mt-6 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:shadow-lg transition-shadow"
        style={{ backgroundColor: '#16a34a' }}>
        <FileText size={20} /> Generate PowerPoint Presentation
      </button>
    </div>
  );
};

// ============================================
// HELPER COMPONENTS
// ============================================

const SectionCard = ({ title, children, isExpanded, onToggle, dark }) => (
  <div
    className="rounded-lg p-6 mb-4 border"
    style={{
      backgroundColor: dark ? '#1e293b' : '#ffffff',
      borderColor: dark ? '#334155' : '#e2e8f0'
    }}>
    {onToggle ? (
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left mb-4">
        <h3 className="font-bold text-lg" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
          {title}
        </h3>
        <ChevronDown
          size={20}
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s',
            color: dark ? '#94a3b8' : '#64748b'
          }}
        />
      </button>
    ) : (
      <h3 className="font-bold text-lg mb-4" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
        {title}
      </h3>
    )}
    {(!isExpanded && onToggle) ? null : children}
  </div>
);

const InfoItem = ({ label, value, dark }) => (
  <div>
    <p className="text-xs font-semibold uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
      {label}
    </p>
    <p style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{value || '—'}</p>
  </div>
);

const ObjectiveCategory = ({ title, items, dark }) => (
  <div>
    <p className="font-semibold mb-2" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
      {title}
    </p>
    <ul className="space-y-1 ml-4">
      {items?.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2">
          <span className="text-green-500 font-bold">✓</span>
          <span style={{ color: dark ? '#cbd5e1' : '#374151' }}>{item}</span>
        </li>
      )) || (
        <li style={{ color: dark ? '#64748b' : '#94a3b8' }}>Not specified</li>
      )}
    </ul>
  </div>
);

const ProcedureItem = ({ letter, title, content, duration, dark }) => (
  <div
    className="p-4 rounded-lg border"
    style={{
      backgroundColor: dark ? '#0f172a' : '#f8fafc',
      borderColor: dark ? '#334155' : '#e2e8f0'
    }}>
    <div className="flex items-start gap-4">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
        style={{ backgroundColor: '#1e3a5f' }}>
        {letter}
      </div>
      <div className="flex-1">
        <p className="font-semibold" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
          {title}
        </p>
        <p style={{ color: dark ? '#cbd5e1' : '#374151' }} className="mt-1 leading-relaxed">
          {content}
        </p>
        {duration && (
          <p style={{ color: dark ? '#64748b' : '#94a3b8' }} className="text-xs mt-2">
            Duration: {duration}
          </p>
        )}
      </div>
    </div>
  </div>
);
