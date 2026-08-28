// ============================================
// AI PROMPTS TEMPLATES FOR ILAW
// ============================================

export const generateLessonPlanPrompt = (formData) => {
  const {
    subject,
    gradeLevel,
    quarter,
    week,
    learningArea,
    competency,
    objectives,
    intentions,
    teacherName,
    school,
    date,
    section
  } = formData;

  return `
You are an expert DepEd Curriculum Specialist. Generate a comprehensive, well-structured lesson plan based on the following information:

LESSON INFORMATION:
- Subject: ${subject}
- Grade Level: ${gradeLevel}
- Quarter: ${quarter}
- Week: ${week}
- Learning Area: ${learningArea}
- Teacher Name: ${teacherName}
- School: ${school}
- Date: ${date}
- Section: ${section}

LEARNING COMPETENCY:
${competency}

LEARNING OBJECTIVES:
Students will be able to:
${objectives}

LEARNING INTENTIONS:
${intentions}

Please generate a complete DepEd-formatted lesson plan with the following sections:
1. Objectives (Knowledge, Skills, Attitude, Values)
2. Subject Matter/Content
3. Learning Resources (Books, Modules, PPT, Videos, etc.)
4. Procedures:
   A. Review (Recall previous learning)
   B. Motivation (Engagement activity)
   C. Lesson Proper (Teacher explanation with examples)
   D. Guided Practice (Structured activities)
   E. Independent Practice (Individual tasks)
   F. Assessment (Formative and Summative)
   G. Assignment (Homework/Additional activity)
5. Reflection (Student self-assessment)

Make the lesson plan practical, age-appropriate, and aligned with DepEd standards.
Format the output as structured JSON with proper markdown for readability.
`;
};

export const generatePPTContentPrompt = (lessonPlan) => {
  return `
Based on the following lesson plan, generate PowerPoint slide content:

LESSON PLAN:
${JSON.stringify(lessonPlan, null, 2)}

Please generate slide content for a PowerPoint presentation with:
1. Title Slide (Title, Date, Teacher, School)
2. Learning Objectives Slide
3. Content Slides (Main concepts with bullet points)
4. Activity/Engagement Slides
5. Assessment Slide
6. Summary/Reflection Slide

Each slide should include:
- Clear title
- 3-5 bullet points (concise and impactful)
- Suggested speaker notes
- Visual suggestions

Format as JSON with slide array.
`;
};

export const generateLearningResourcesPrompt = (subject, topic, gradeLevel) => {
  return `
Suggest relevant learning resources for:
- Subject: ${subject}
- Topic: ${topic}
- Grade Level: ${gradeLevel}

Please provide:
1. Recommended textbooks
2. Educational websites/links
3. YouTube videos (with specific recommendations)
4. Downloadable modules
5. Visual aids or infographics
6. Interactive tools/apps

Format as structured list with brief descriptions.
`;
};

export const refineLessonPlanPrompt = (lessonPlan, feedback) => {
  return `
Please refine the following lesson plan based on this feedback:

FEEDBACK: ${feedback}

CURRENT LESSON PLAN:
${JSON.stringify(lessonPlan, null, 2)}

Make necessary adjustments while maintaining DepEd compliance and pedagogical best practices.
`;
};
