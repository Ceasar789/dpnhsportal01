// ============================================
// EXPORT UTILITIES (PDF, Word, Print)
// ============================================

export const exportToPDF = (lessonPlan, filename = 'lesson-plan.pdf') => {
  // This requires html2pdf or similar library
  // For now, providing structure
  try {
    const content = formatLessonPlanForPDF(lessonPlan);
    console.log('Exporting to PDF:', filename);
    // In production, use: html2pdf().set(options).fromString(content).save(filename);
    return { success: true, message: 'PDF export initiated' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const exportToWord = (lessonPlan, filename = 'lesson-plan.docx') => {
  // This requires docx library or similar
  try {
    const content = formatLessonPlanForWord(lessonPlan);
    console.log('Exporting to Word:', filename);
    // In production, use: docx library to generate .docx file
    downloadFile(content, filename, 'application/msword');
    return { success: true, message: 'Word document generated' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const exportToPlainText = (lessonPlan, filename = 'lesson-plan.txt') => {
  try {
    const content = formatLessonPlanForText(lessonPlan);
    downloadFile(content, filename, 'text/plain');
    return { success: true, message: 'Text file downloaded' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const printLessonPlan = (lessonPlan) => {
  try {
    const content = formatLessonPlanForPrint(lessonPlan);
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
    return { success: true, message: 'Print dialog opened' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const formatLessonPlanForPDF = (data) => {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 20px; }
          .section { margin-top: 15px; page-break-inside: avoid; }
          .section-title { font-weight: bold; font-size: 14px; background-color: #f0f0f0; padding: 5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4CAF50; color: white; }
          .signature-line { border-bottom: 1px solid black; width: 150px; display: inline-block; }
        </style>
      </head>
      <body>
        ${formatLessonPlanHTMLContent(data)}
      </body>
    </html>
  `;
};

const formatLessonPlanForWord = (data) => {
  return formatLessonPlanHTMLContent(data);
};

const formatLessonPlanForText = (data) => {
  return `
LESSON PLAN - ${data.subject || 'Subject'}

SCHOOL INFORMATION:
School: ${data.school || ''}
Grade Level: ${data.gradeLevel || ''}
Section: ${data.section || ''}
Quarter: ${data.quarter || ''} | Week: ${data.week || ''}
Date: ${data.date || ''}
Teacher: ${data.teacherName || ''}

LEARNING COMPETENCY:
${data.competency || ''}

LEARNING OBJECTIVES:
${data.objectives || ''}

LEARNING INTENTIONS:
${data.intentions || ''}

SUBJECT MATTER:
${data.content || ''}

LEARNING RESOURCES:
${Array.isArray(data.resources) ? data.resources.join('\n') : data.resources || ''}

LESSON PROCEDURES:

A. REVIEW
${data.review || ''}

B. MOTIVATION
${data.motivation || ''}

C. LESSON PROPER
${data.lessonProper || ''}

D. GUIDED PRACTICE
${data.guidedPractice || ''}

E. INDEPENDENT PRACTICE
${data.independentPractice || ''}

F. ASSESSMENT
${data.assessment || ''}

G. ASSIGNMENT
${data.assignment || ''}

REFLECTION:
${data.reflection || ''}

---
Prepared by: ${data.teacherName || ''}
Date: ${data.date || ''}
  `;
};

const formatLessonPlanForPrint = (data) => {
  return `
    <html>
      <head>
        <title>Lesson Plan - ${data.subject}</title>
        <style>
          body { font-family: 'Times New Roman', Times, serif; margin: 40px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid black; padding-bottom: 10px; }
          .info-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .info-item { display: flex; justify-content: space-between; }
          .label { font-weight: bold; width: 150px; }
          .section { margin-top: 20px; page-break-inside: avoid; }
          .section-title { font-weight: bold; font-size: 13px; text-transform: uppercase; margin-top: 15px; margin-bottom: 10px; }
          .content { line-height: 1.6; }
          .signature-section { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; text-align: center; }
          .signature-line { border-top: 1px solid black; padding-top: 10px; margin-top: 50px; }
          @media print { body { margin: 0.5in; } }
        </style>
      </head>
      <body>
        ${formatLessonPlanHTMLContent(data)}
      </body>
    </html>
  `;
};

const formatLessonPlanHTMLContent = (data) => {
  return `
    <div class="header">
      <h1>${data.school || 'School Name'}</h1>
      <h2>LESSON PLAN</h2>
      <p>${data.subject || 'Subject'} - Grade ${data.gradeLevel || ''}</p>
    </div>

    <div class="info-section">
      <div>
        <div class="info-item"><span class="label">Grade Level:</span> <span>${data.gradeLevel || ''}</span></div>
        <div class="info-item"><span class="label">Subject:</span> <span>${data.subject || ''}</span></div>
        <div class="info-item"><span class="label">Quarter:</span> <span>${data.quarter || ''}</span></div>
      </div>
      <div>
        <div class="info-item"><span class="label">Week:</span> <span>${data.week || ''}</span></div>
        <div class="info-item"><span class="label">Section:</span> <span>${data.section || ''}</span></div>
        <div class="info-item"><span class="label">Date:</span> <span>${data.date || ''}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">I. OBJECTIVES</div>
      <div class="content">${data.objectives || 'Objectives'}</div>
    </div>

    <div class="section">
      <div class="section-title">II. SUBJECT MATTER</div>
      <div class="content">${data.content || 'Content'}</div>
    </div>

    <div class="section">
      <div class="section-title">III. LEARNING RESOURCES</div>
      <div class="content">${Array.isArray(data.resources) ? data.resources.join('<br/>') : data.resources || 'Resources'}</div>
    </div>

    <div class="section">
      <div class="section-title">IV. PROCEDURES</div>
      <div class="content">
        <p><strong>A. Review:</strong> ${data.review || ''}</p>
        <p><strong>B. Motivation:</strong> ${data.motivation || ''}</p>
        <p><strong>C. Lesson Proper:</strong> ${data.lessonProper || ''}</p>
        <p><strong>D. Guided Practice:</strong> ${data.guidedPractice || ''}</p>
        <p><strong>E. Independent Practice:</strong> ${data.independentPractice || ''}</p>
        <p><strong>F. Assessment:</strong> ${data.assessment || ''}</p>
        <p><strong>G. Assignment:</strong> ${data.assignment || ''}</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">V. REFLECTION</div>
      <div class="content">${data.reflection || 'Teacher reflection on the effectiveness of the lesson'}</div>
    </div>

    <div class="signature-section">
      <div>
        <div class="signature-line">Prepared by<br/>Teacher</div>
      </div>
      <div>
        <div class="signature-line">Checked by<br/>Mentor Teacher</div>
      </div>
      <div>
        <div class="signature-line">Approved by<br/>Principal</div>
      </div>
    </div>
  `;
};

const downloadFile = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const generateFilename = (subject, date) => {
  const dateStr = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const subjectSlug = subject ? subject.toLowerCase().replace(/\s+/g, '-') : 'lesson-plan';
  return `${subjectSlug}-${dateStr}`;
};
