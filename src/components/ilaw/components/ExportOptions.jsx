// ============================================
// EXPORT OPTIONS COMPONENT
// ============================================

import React, { useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { exportToPDF, exportToWord, exportToPlainText, generateFilename } from '../utils/exportUtils';

export const ExportOptions = ({ lessonPlan, dark, onClose }) => {
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [isExporting, setIsExporting] = useState(false);

  const filename = generateFilename(lessonPlan.subject, lessonPlan.date);

  const exportFormats = [
    {
      id: 'pdf',
      name: 'PDF Document',
      description: 'Print-ready PDF format with formatting preserved',
      icon: '📄',
      action: () => exportToPDF(lessonPlan, `${filename}.pdf`)
    },
    {
      id: 'word',
      name: 'Microsoft Word',
      description: 'Editable Word document for further customization',
      icon: '📘',
      action: () => exportToWord(lessonPlan, `${filename}.docx`)
    },
    {
      id: 'text',
      name: 'Plain Text',
      description: 'Simple text file format',
      icon: '📝',
      action: () => exportToPlainText(lessonPlan, `${filename}.txt`)
    }
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const format = exportFormats.find((f) => f.id === selectedFormat);
      const result = format.action();
      if (result.success) {
        alert(`Export successful! File: ${filename}`);
        onClose();
      } else {
        alert(`Export failed: ${result.message}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
      <div
        className="rounded-lg shadow-2xl max-w-md w-full p-6"
        style={{
          backgroundColor: dark ? '#1e293b' : '#ffffff'
        }}>
        <h2 className="text-2xl font-bold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
          Export Lesson Plan
        </h2>
        <p className="mb-6" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
          Choose your preferred format
        </p>

        <div className="space-y-3 mb-6">
          {exportFormats.map((format) => (
            <label
              key={format.id}
              className="flex items-center p-3 rounded-lg cursor-pointer border transition-all"
              style={{
                backgroundColor:
                  selectedFormat === format.id
                    ? dark
                      ? '#0f172a'
                      : '#eff6ff'
                    : dark
                      ? '#0f172a'
                      : '#f8fafc',
                borderColor:
                  selectedFormat === format.id
                    ? '#3b82f6'
                    : dark
                      ? '#334155'
                      : '#e2e8f0'
              }}>
              <input
                type="radio"
                value={format.id}
                checked={selectedFormat === format.id}
                onChange={(e) => setSelectedFormat(e.target.value)}
                className="w-4 h-4 cursor-pointer"
              />
              <div className="ml-4 flex-1">
                <p className="font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                  {format.icon} {format.name}
                </p>
                <p className="text-xs" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
                  {format.description}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg font-semibold border"
            style={{
              backgroundColor: dark ? '#0f172a' : '#f8fafc',
              borderColor: dark ? '#334155' : '#e2e8f0',
              color: dark ? '#f1f5f9' : '#1a2b4a'
            }}>
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1 py-2 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
            style={{
              backgroundColor: '#1e3a5f',
              opacity: isExporting ? 0.7 : 1
            }}>
            {isExporting && <Loader2 size={16} className="animate-spin" />}
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
};
