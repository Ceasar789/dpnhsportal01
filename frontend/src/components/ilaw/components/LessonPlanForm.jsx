// ============================================
// ILAW LESSON PLAN FORM COMPONENT
// ============================================

import React, { useState } from 'react';
import { ChevronDown, Plus, Trash2, Loader2 } from 'lucide-react';
import { useLessonPlanForm } from '../hooks/useLessonPlanForm';

export const LessonPlanForm = ({ onSubmit, isLoading, dark }) => {
  const form = useLessonPlanForm();
  const [expandedSection, setExpandedSection] = useState('basic');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.validateForm()) {
      onSubmit(form.formData);
    } else {
      console.log('Form errors:', form.errors);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic Information */}
        <Section
          title="1. Basic Information"
          isExpanded={expandedSection === 'basic'}
          onToggle={() => setExpandedSection(expandedSection === 'basic' ? null : 'basic')}
          dark={dark}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormInput
              label="School Name"
              value={form.getFormValue('school')}
              onChange={(e) => form.updateField('school', e.target.value)}
              placeholder="School Name"
              dark={dark}
              required
            />
            <FormInput
              label="Teacher Name"
              value={form.getFormValue('teacherName')}
              onChange={(e) => form.updateField('teacherName', e.target.value)}
              placeholder="Your Name"
              dark={dark}
            />
            <FormInput
              label="Subject"
              value={form.getFormValue('subject')}
              onChange={(e) => form.updateField('subject', e.target.value)}
              placeholder="e.g., English, Mathematics"
              dark={dark}
              required
            />
            <FormInput
              label="Grade Level"
              value={form.getFormValue('gradeLevel')}
              onChange={(e) => form.updateField('gradeLevel', e.target.value)}
              placeholder="e.g., Grade 7, Grade 11"
              dark={dark}
              required
            />
            <FormInput
              label="Section"
              value={form.getFormValue('section')}
              onChange={(e) => form.updateField('section', e.target.value)}
              placeholder="e.g., Maligayang Araw, Section A"
              dark={dark}
            />
            <FormInput
              label="Learning Area"
              value={form.getFormValue('learningArea')}
              onChange={(e) => form.updateField('learningArea', e.target.value)}
              placeholder="e.g., English Language Arts"
              dark={dark}
            />
            <FormSelect
              label="Quarter"
              value={form.getFormValue('quarter')}
              onChange={(e) => form.updateField('quarter', e.target.value)}
              options={['Q1', 'Q2', 'Q3', 'Q4']}
              dark={dark}
            />
            <FormInput
              label="Week"
              type="number"
              value={form.getFormValue('week')}
              onChange={(e) => form.updateField('week', e.target.value)}
              placeholder="Week number"
              dark={dark}
              min="1"
              max="52"
            />
            <FormInput
              label="Date"
              type="date"
              value={form.getFormValue('date')}
              onChange={(e) => form.updateField('date', e.target.value)}
              dark={dark}
            />
            <FormInput
              label="Time"
              type="time"
              value={form.getFormValue('time')}
              onChange={(e) => form.updateField('time', e.target.value)}
              dark={dark}
            />
          </div>
        </Section>

        {/* Learning Competency */}
        <Section
          title="2. Learning Competency (MELC)"
          isExpanded={expandedSection === 'competency'}
          onToggle={() => setExpandedSection(expandedSection === 'competency' ? null : 'competency')}
          dark={dark}>
          <div className="space-y-4">
            <FormInput
              label="Competency Code"
              value={form.getFormValue('competencyCode')}
              onChange={(e) => form.updateField('competencyCode', e.target.value)}
              placeholder="e.g., EN7-I-a-1"
              dark={dark}
            />
            <FormTextarea
              label="Competency Statement"
              value={form.getFormValue('competency')}
              onChange={(e) => form.updateField('competency', e.target.value)}
              placeholder="Enter the MELC or learning competency statement..."
              dark={dark}
              required
              rows={4}
            />
          </div>
        </Section>

        {/* Learning Objectives */}
        <Section
          title="3. Learning Objectives"
          isExpanded={expandedSection === 'objectives'}
          onToggle={() => setExpandedSection(expandedSection === 'objectives' ? null : 'objectives')}
          dark={dark}>
          <div className="space-y-4">
            <FormTextarea
              label="General Objectives"
              value={form.getFormValue('objectives')}
              onChange={(e) => form.updateField('objectives', e.target.value)}
              placeholder="Students will be able to..."
              dark={dark}
              required
              rows={3}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormTextarea
                label="Knowledge Objectives"
                value={form.getFormValue('knowledge')}
                onChange={(e) => form.updateField('knowledge', e.target.value)}
                placeholder="What students should know..."
                dark={dark}
                rows={3}
              />
              <FormTextarea
                label="Skills Objectives"
                value={form.getFormValue('skills')}
                onChange={(e) => form.updateField('skills', e.target.value)}
                placeholder="What skills they will develop..."
                dark={dark}
                rows={3}
              />
              <FormTextarea
                label="Attitude Objectives"
                value={form.getFormValue('attitude')}
                onChange={(e) => form.updateField('attitude', e.target.value)}
                placeholder="Attitudes to cultivate..."
                dark={dark}
                rows={3}
              />
              <FormTextarea
                label="Values Objectives"
                value={form.getFormValue('values')}
                onChange={(e) => form.updateField('values', e.target.value)}
                placeholder="Values to instill..."
                dark={dark}
                rows={3}
              />
            </div>
          </div>
        </Section>

        {/* Learning Intentions */}
        <Section
          title="4. Learning Intentions"
          isExpanded={expandedSection === 'intentions'}
          onToggle={() => setExpandedSection(expandedSection === 'intentions' ? null : 'intentions')}
          dark={dark}>
          <FormTextarea
            label="Learning Intentions"
            value={form.getFormValue('intentions')}
            onChange={(e) => form.updateField('intentions', e.target.value)}
            placeholder="What do you intend students to achieve? (e.g., Students will understand, identify, perform...)"
            dark={dark}
            rows={4}
            hint="Be specific about the desired learning outcomes"
          />
        </Section>

        {/* Learning Resources */}
        <Section
          title="5. Learning Resources"
          isExpanded={expandedSection === 'resources'}
          onToggle={() => setExpandedSection(expandedSection === 'resources' ? null : 'resources')}
          dark={dark}>
          <ArrayInput
            label="Add Learning Resources"
            items={form.getFormValue('resources')}
            onAdd={(item) => form.addToArray('resources', item)}
            onRemove={(idx) => form.removeFromArray('resources', idx)}
            placeholder="e.g., Teacher's Guide, Learning Module, YouTube Video"
            dark={dark}
          />
        </Section>

        {/* Content/Subject Matter */}
        <Section
          title="6. Subject Matter/Content"
          isExpanded={expandedSection === 'content'}
          onToggle={() => setExpandedSection(expandedSection === 'content' ? null : 'content')}
          dark={dark}>
          <div className="space-y-4">
            <FormInput
              label="Main Topic"
              value={form.getFormValue('mainTopic')}
              onChange={(e) => form.updateField('mainTopic', e.target.value)}
              placeholder="Main topic title"
              dark={dark}
            />
            <FormTextarea
              label="Detailed Content"
              value={form.getFormValue('content')}
              onChange={(e) => form.updateField('content', e.target.value)}
              placeholder="Outline your lesson content here..."
              dark={dark}
              rows={6}
            />
          </div>
        </Section>

        {/* Lesson Procedures */}
        <Section
          title="7. Lesson Procedures (Optional - AI will generate if blank)"
          isExpanded={expandedSection === 'procedures'}
          onToggle={() => setExpandedSection(expandedSection === 'procedures' ? null : 'procedures')}
          dark={dark}>
          <div className="space-y-4">
            <FormTextarea
              label="A. Review"
              value={form.getFormValue('review')}
              onChange={(e) => form.updateField('review', e.target.value)}
              placeholder="Recall/review of previous lessons..."
              dark={dark}
              rows={2}
            />
            <FormTextarea
              label="B. Motivation"
              value={form.getFormValue('motivation')}
              onChange={(e) => form.updateField('motivation', e.target.value)}
              placeholder="Engagement and motivation activities..."
              dark={dark}
              rows={2}
            />
            <FormTextarea
              label="C. Lesson Proper"
              value={form.getFormValue('lessonProper')}
              onChange={(e) => form.updateField('lessonProper', e.target.value)}
              placeholder="Main lesson instruction..."
              dark={dark}
              rows={2}
            />
            <FormTextarea
              label="D. Guided Practice"
              value={form.getFormValue('guidedPractice')}
              onChange={(e) => form.updateField('guidedPractice', e.target.value)}
              placeholder="Structured practice activities..."
              dark={dark}
              rows={2}
            />
            <FormTextarea
              label="E. Independent Practice"
              value={form.getFormValue('independentPractice')}
              onChange={(e) => form.updateField('independentPractice', e.target.value)}
              placeholder="Individual student tasks..."
              dark={dark}
              rows={2}
            />
            <FormTextarea
              label="F. Assessment"
              value={form.getFormValue('assessment')}
              onChange={(e) => form.updateField('assessment', e.target.value)}
              placeholder="Assessment strategies and tools..."
              dark={dark}
              rows={2}
            />
            <FormTextarea
              label="G. Assignment"
              value={form.getFormValue('assignment')}
              onChange={(e) => form.updateField('assignment', e.target.value)}
              placeholder="Homework and enrichment activities..."
              dark={dark}
              rows={2}
            />
          </div>
        </Section>

        {/* Reflection */}
        <Section
          title="8. Reflection"
          isExpanded={expandedSection === 'reflection'}
          onToggle={() => setExpandedSection(expandedSection === 'reflection' ? null : 'reflection')}
          dark={dark}>
          <FormTextarea
            label="Teacher Reflection"
            value={form.getFormValue('reflection')}
            onChange={(e) => form.updateField('reflection', e.target.value)}
            placeholder="Reflect on the effectiveness of the lesson, areas for improvement..."
            dark={dark}
            rows={4}
          />
        </Section>

        {/* Errors Display */}
        {form.errors.length > 0 && (
          <div
            className="p-4 rounded-lg border"
            style={{
              backgroundColor: '#fee2e2',
              borderColor: '#fca5a5',
              color: '#991b1b'
            }}>
            <p className="font-semibold mb-2">Please fix the following errors:</p>
            <ul className="list-disc list-inside">
              {form.errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-3 pt-6">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:shadow-lg transition-shadow disabled:opacity-50"
            style={{ backgroundColor: '#1e3a5f' }}>
            {isLoading && <Loader2 size={18} className="animate-spin" />}
            {isLoading ? 'Generating...' : 'Generate Lesson Plan'}
          </button>
          <button
            type="button"
            onClick={() => form.resetForm()}
            className="px-6 py-3 rounded-lg font-semibold border"
            style={{
              backgroundColor: dark ? '#1e293b' : '#ffffff',
              borderColor: dark ? '#334155' : '#e2e8f0',
              color: dark ? '#f1f5f9' : '#1a2b4a'
            }}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
};

// ============================================
// FORM COMPONENTS
// ============================================

const Section = ({ title, isExpanded, onToggle, children, dark }) => (
  <div
    className="rounded-lg border"
    style={{
      backgroundColor: dark ? '#1e293b' : '#ffffff',
      borderColor: dark ? '#334155' : '#e2e8f0'
    }}>
    <button
      type="button"
      onClick={onToggle}
      className="w-full px-6 py-4 flex items-center justify-between hover:opacity-80 transition-opacity"
      style={{ borderBottom: isExpanded ? `1px solid ${dark ? '#334155' : '#e2e8f0'}` : 'none' }}>
      <h3 className="font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
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
    {isExpanded && <div className="px-6 py-4 space-y-4">{children}</div>}
  </div>
);

const FormInput = ({ label, dark, hint, ...props }) => (
  <div>
    {label && (
      <label className="block text-sm font-medium mb-2" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
        {label}
      </label>
    )}
    <input
      className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
      style={{
        backgroundColor: dark ? '#0f172a' : '#f8fafc',
        borderColor: dark ? '#334155' : '#cbd5e1',
        border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
        color: dark ? '#f1f5f9' : '#1a2b4a'
      }}
      {...props}
    />
    {hint && (
      <p className="text-xs mt-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
        {hint}
      </p>
    )}
  </div>
);

const FormSelect = ({ label, options, dark, ...props }) => (
  <div>
    {label && (
      <label className="block text-sm font-medium mb-2" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
        {label}
      </label>
    )}
    <select
      className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
      style={{
        backgroundColor: dark ? '#0f172a' : '#f8fafc',
        borderColor: dark ? '#334155' : '#cbd5e1',
        border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
        color: dark ? '#f1f5f9' : '#1a2b4a'
      }}
      {...props}>
      <option value="">-- Select --</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);

const FormTextarea = ({ label, dark, hint, ...props }) => (
  <div>
    {label && (
      <label className="block text-sm font-medium mb-2" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
        {label}
      </label>
    )}
    <textarea
      className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      style={{
        backgroundColor: dark ? '#0f172a' : '#f8fafc',
        borderColor: dark ? '#334155' : '#cbd5e1',
        border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
        color: dark ? '#f1f5f9' : '#1a2b4a'
      }}
      {...props}
    />
    {hint && (
      <p className="text-xs mt-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
        {hint}
      </p>
    )}
  </div>
);

const ArrayInput = ({ label, items = [], onAdd, onRemove, placeholder, dark }) => {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAdd(inputValue);
      setInputValue('');
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
        {label}
      </label>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          style={{
            backgroundColor: dark ? '#0f172a' : '#f8fafc',
            border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
            color: dark ? '#f1f5f9' : '#1a2b4a'
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-4 py-2 rounded-lg font-semibold text-white flex items-center gap-1"
          style={{ backgroundColor: '#1e3a5f' }}>
          <Plus size={16} /> Add
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{
              backgroundColor: dark ? '#0f172a' : '#f8fafc',
              border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`
            }}>
            <span style={{ color: dark ? '#cbd5e1' : '#475569' }}>{item}</span>
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="text-red-500 hover:text-red-700">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
