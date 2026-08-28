// ============================================
// PPT GENERATOR COMPONENT
// ============================================

import React, { useState } from 'react';
import { Download, Loader2, ArrowLeft } from 'lucide-react';

export const PPTGenerator = ({ lessonPlan, dark, onBack, isGenerating, onGenerate }) => {
  const [pptContent, setPptContent] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGeneratePPT = async () => {
    setLoading(true);
    try {
      const result = await onGenerate(lessonPlan);
      if (result) {
        setPptContent(result);
      }
    } catch (error) {
      console.error('Error generating PPT:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadPPT = () => {
    // Mock download functionality
    const filename = `${lessonPlan.subject}-PPT-${lessonPlan.date}.pptx`;
    console.log('Downloading PPT:', filename);
    alert('PPT download feature would be implemented with pptx library');
  };

  if (!pptContent) {
    return (
      <div className="max-w-4xl mx-auto p-6" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-6 font-semibold text-blue-500 hover:text-blue-700">
          <ArrowLeft size={18} /> Back to Lesson Plan
        </button>

        <div
          className="p-8 rounded-lg text-center border"
          style={{
            backgroundColor: dark ? '#1e293b' : '#ffffff',
            borderColor: dark ? '#334155' : '#e2e8f0'
          }}>
          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📊</span>
          </div>
          <h2 className="text-2xl font-bold mb-4" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            Generate PowerPoint Presentation
          </h2>
          <p className="mb-6" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
            Convert your lesson plan into a professional PowerPoint presentation with AI assistance
          </p>

          <div className="bg-blue-50 p-4 rounded-lg mb-6 text-left" style={{ backgroundColor: dark ? '#0f172a' : '#eff6ff' }}>
            <p className="font-semibold mb-3" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
              What will be included:
            </p>
            <ul className="space-y-2 text-sm" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
              <li>✓ Title slide with lesson information</li>
              <li>✓ Learning objectives slide</li>
              <li>✓ Main content slides with key points</li>
              <li>✓ Interactive activity slides</li>
              <li>✓ Assessment slide</li>
              <li>✓ Summary/reflection slide</li>
              <li>✓ Speaker notes for each slide</li>
            </ul>
          </div>

          <button
            onClick={handleGeneratePPT}
            disabled={loading}
            className="px-8 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 mx-auto hover:shadow-lg transition-shadow disabled:opacity-50"
            style={{ backgroundColor: '#f97316' }}>
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? 'Generating PPT...' : 'Generate Presentation'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
      <button
        onClick={onBack}
        className="flex items-center gap-2 mb-6 font-semibold text-blue-500 hover:text-blue-700">
        <ArrowLeft size={18} /> Back to Lesson Plan
      </button>

      <div
        className="rounded-lg p-8 border"
        style={{
          backgroundColor: dark ? '#1e293b' : '#ffffff',
          borderColor: dark ? '#334155' : '#e2e8f0'
        }}>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            Generated PowerPoint
          </h2>
          <button
            onClick={downloadPPT}
            className="flex items-center gap-2 px-6 py-2 rounded-lg font-semibold text-white"
            style={{ backgroundColor: '#f97316' }}>
            <Download size={18} /> Download PPT
          </button>
        </div>

        <div className="space-y-6">
          {pptContent.slides?.map((slide, idx) => (
            <SlidePreview key={idx} slide={slide} slideNumber={idx + 1} dark={dark} />
          )) || (
            <div className="p-4 text-center" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
              <p>PPT content generated successfully.</p>
            </div>
          )}
        </div>

        <button
          onClick={downloadPPT}
          className="w-full mt-8 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
          style={{ backgroundColor: '#f97316' }}>
          <Download size={18} /> Download Complete Presentation
        </button>
      </div>
    </div>
  );
};

const SlidePreview = ({ slide, slideNumber, dark }) => (
  <div
    className="p-6 rounded-lg border"
    style={{
      backgroundColor: dark ? '#0f172a' : '#f8fafc',
      borderColor: dark ? '#334155' : '#e2e8f0'
    }}>
    <div className="flex items-center gap-4 mb-4">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
        style={{ backgroundColor: '#f97316' }}>
        {slideNumber}
      </div>
      <h3 className="text-lg font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
        {slide.title || `Slide ${slideNumber}`}
      </h3>
    </div>

    {slide.content && (
      <div className="mb-4">
        <p style={{ color: dark ? '#cbd5e1' : '#374151' }} className="whitespace-pre-wrap">
          {slide.content}
        </p>
      </div>
    )}

    {slide.bulletPoints && (
      <ul className="space-y-2 mb-4 ml-4">
        {slide.bulletPoints.map((point, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="text-blue-500 font-bold">•</span>
            <span style={{ color: dark ? '#cbd5e1' : '#374151' }}>{point}</span>
          </li>
        ))}
      </ul>
    )}

    {slide.speakerNotes && (
      <div
        className="p-3 rounded border mt-4"
        style={{
          backgroundColor: dark ? '#1e293b' : '#f8fafc',
          borderColor: dark ? '#334155' : '#e2e8f0'
        }}>
        <p className="text-xs font-semibold mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
          Speaker Notes:
        </p>
        <p style={{ color: dark ? '#cbd5e1' : '#374151' }} className="text-sm">
          {slide.speakerNotes}
        </p>
      </div>
    )}
  </div>
);
