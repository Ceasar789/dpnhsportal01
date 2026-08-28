// ============================================
// ILAW HOME/LANDING PAGE COMPONENT
// ============================================

import React from 'react';
import { BookOpen, Zap, FileText, Share2, Plus, ArrowRight } from 'lucide-react';

export const ILAWHome = ({ onGenerateNew, recentPlans = [], dark, setActiveTab }) => {
  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <BookOpen size={24} className="text-white" />
            </div>
            <h1 className="text-4xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
              ILAW
            </h1>
          </div>
          <h2 className="text-2xl font-semibold mb-2" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
            Lesson Plan and PPT Generator
          </h2>
          <p className="text-lg mb-6" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
            AI-powered tool to create structured, DepEd-compliant lesson plans and presentations in minutes
          </p>
          <button
            onClick={onGenerateNew}
            className="px-8 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 mx-auto hover:shadow-lg transition-shadow"
            style={{ backgroundColor: '#1e3a5f' }}>
            <Plus size={20} /> Create New Lesson Plan
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <FeatureCard
            icon={<Zap size={28} className="text-blue-500" />}
            title="AI-Powered"
            description="Automatically generate complete lesson plans using advanced AI"
            dark={dark}
          />
          <FeatureCard
            icon={<FileText size={28} className="text-green-500" />}
            title="DepEd Format"
            description="All lessons comply with DepEd standards and requirements"
            dark={dark}
          />
          <FeatureCard
            icon={<Share2 size={28} className="text-purple-500" />}
            title="Multiple Exports"
            description="Download as PDF, Word, or print directly to paper"
            dark={dark}
          />
        </div>

        {/* How It Works */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold mb-8 text-center" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            How It Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { num: 1, title: 'Fill Form', desc: 'Enter lesson details' },
              { num: 2, title: 'AI Process', desc: 'Let AI generate content' },
              { num: 3, title: 'Review', desc: 'Edit and customize' },
              { num: 4, title: 'Export', desc: 'Download your plan' }
            ].map((step) => (
              <div key={step.num} className="relative">
                <div
                  className="p-4 rounded-lg text-center"
                  style={{
                    backgroundColor: dark ? '#1e293b' : '#ffffff',
                    border: `2px solid ${dark ? '#334155' : '#e2e8f0'}`
                  }}>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white mx-auto mb-2"
                    style={{ backgroundColor: '#1e3a5f' }}>
                    {step.num}
                  </div>
                  <p className="font-semibold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                    {step.title}
                  </p>
                  <p className="text-sm" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
                    {step.desc}
                  </p>
                </div>
                {step.num < 4 && (
                  <div className="hidden md:flex absolute top-1/2 -right-6 transform -translate-y-1/2">
                    <ArrowRight size={20} style={{ color: dark ? '#475569' : '#cbd5e1' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Plans */}
        {recentPlans.length > 0 && (
          <div>
            <h3 className="text-2xl font-bold mb-6" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
              Recent Lesson Plans
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentPlans.map((plan, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg cursor-pointer hover:shadow-md transition-shadow"
                  style={{
                    backgroundColor: dark ? '#1e293b' : '#ffffff',
                    border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`
                  }}>
                  <p className="font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                    {plan.title || 'Untitled Lesson'}
                  </p>
                  <p className="text-sm mb-3" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
                    {plan.subject} • {plan.gradeLevel}
                  </p>
                  <button
                    onClick={() => setActiveTab('form')}
                    className="text-sm font-semibold text-blue-500 hover:text-blue-700">
                    View →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Features List */}
        <div className="mt-16 p-8 rounded-xl" style={{ backgroundColor: dark ? '#1e293b' : '#f0f9ff' }}>
          <h3 className="text-xl font-bold mb-4" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            What's Included:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              '✓ Lesson information and competency input',
              '✓ Learning objectives generator',
              '✓ Detailed lesson procedures',
              '✓ Learning resources compilation',
              '✓ Assessment strategies',
              '✓ PowerPoint presentation generator',
              '✓ Reflection templates',
              '✓ DepEd compliance check',
              '✓ Multiple export formats',
              '✓ Edit and customize options',
              '✓ Auto-save functionality',
              '✓ Lesson plan templates'
            ].map((feature, idx) => (
              <p key={idx} style={{ color: dark ? '#cbd5e1' : '#374151' }}>
                {feature}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const FeatureCard = ({ icon, title, description, dark }) => (
  <div
    className="p-6 rounded-xl text-center hover:shadow-lg transition-shadow"
    style={{
      backgroundColor: dark ? '#1e293b' : '#ffffff',
      border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`
    }}>
    <div className="flex justify-center mb-4">{icon}</div>
    <h4 className="text-lg font-semibold mb-2" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
      {title}
    </h4>
    <p style={{ color: dark ? '#94a3b8' : '#64748b' }}>{description}</p>
  </div>
);
