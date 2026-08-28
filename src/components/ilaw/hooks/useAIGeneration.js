// ============================================
// CUSTOM HOOK: useAIGeneration
// ============================================

import { useState, useCallback } from 'react';
import { generateLessonPlanPrompt, generatePPTContentPrompt, generateLearningResourcesPrompt } from '../utils/aiPrompts';

export const useAIGeneration = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [error, setError] = useState(null);

  const generateLessonPlan = useCallback(async (formData, onProgress) => {
    setIsGenerating(true);
    setError(null);
    setGenerationProgress(0);

    try {
      // Step 1: Build prompt
      setGenerationProgress(10);
      const prompt = generateLessonPlanPrompt(formData);

      // Step 2: Send to AI API (example with OpenAI-like structure)
      setGenerationProgress(30);
      const aiResponse = await callAIAPI(prompt);

      // Step 3: Process response
      setGenerationProgress(70);
      const processedLessonPlan = processAIResponse(aiResponse);

      // Step 4: Format for DepEd
      setGenerationProgress(90);
      const formattedPlan = formatLessonPlanResponse(processedLessonPlan, formData);

      // Step 5: Complete
      setGenerationProgress(100);
      setGeneratedContent(formattedPlan);

      if (onProgress) onProgress(100);
      
      return formattedPlan;
    } catch (err) {
      console.error('AI Generation Error:', err);
      setError(err.message || 'Failed to generate lesson plan');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const generatePPT = useCallback(async (lessonPlan, onProgress) => {
    setIsGenerating(true);
    setError(null);
    setGenerationProgress(0);

    try {
      setGenerationProgress(20);
      const prompt = generatePPTContentPrompt(lessonPlan);

      setGenerationProgress(50);
      const aiResponse = await callAIAPI(prompt);

      setGenerationProgress(80);
      const pptSlides = processAIResponse(aiResponse);

      setGenerationProgress(100);
      setGeneratedContent(pptSlides);

      if (onProgress) onProgress(100);
      
      return pptSlides;
    } catch (err) {
      console.error('PPT Generation Error:', err);
      setError(err.message || 'Failed to generate PowerPoint');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const generateResources = useCallback(async (subject, topic, gradeLevel, onProgress) => {
    setIsGenerating(true);
    setError(null);
    setGenerationProgress(0);

    try {
      setGenerationProgress(25);
      const prompt = generateLearningResourcesPrompt(subject, topic, gradeLevel);

      setGenerationProgress(60);
      const aiResponse = await callAIAPI(prompt);

      setGenerationProgress(90);
      const resources = processAIResponse(aiResponse);

      setGenerationProgress(100);
      setGeneratedContent(resources);

      if (onProgress) onProgress(100);
      
      return resources;
    } catch (err) {
      console.error('Resources Generation Error:', err);
      setError(err.message || 'Failed to generate resources');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const resetGeneration = useCallback(() => {
    setIsGenerating(false);
    setGenerationProgress(0);
    setGeneratedContent(null);
    setError(null);
  }, []);

  return {
    generateLessonPlan,
    generatePPT,
    generateResources,
    isGenerating,
    generationProgress,
    generatedContent,
    error,
    resetGeneration
  };
};

// ============================================
// AI API CALL (Mock Implementation)
// Replace with actual API call to OpenAI, Gemini, etc.
// ============================================

const callAIAPI = async (prompt) => {
  // MOCK RESPONSE - Replace with actual API call
  // Example: 
  // const response = await fetch('https://api.openai.com/v1/chat/completions', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${process.env.REACT_APP_AI_API_KEY}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     model: 'gpt-4',
  //     messages: [{ role: 'user', content: prompt }]
  //   })
  // });

  // Mock API response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(generateMockLessonPlan(prompt));
    }, 2000);
  });
};

const processAIResponse = (response) => {
  // Parse and validate AI response
  try {
    // If response is already an object
    if (typeof response === 'object') {
      return response;
    }
    // If response is a string, try to parse JSON
    if (typeof response === 'string') {
      return JSON.parse(response);
    }
    return response;
  } catch (err) {
    console.error('Error processing AI response:', err);
    return response;
  }
};

const formatLessonPlanResponse = (aiResponse, formData) => {
  return {
    ...formData,
    ...aiResponse,
    generatedAt: new Date().toISOString(),
    status: 'generated'
  };
};

// ============================================
// MOCK LESSON PLAN GENERATOR (for development)
// ============================================

const generateMockLessonPlan = (prompt) => {
  return {
    objectives: {
      knowledge: [
        'Define and understand key concepts',
        'Identify main ideas and supporting details',
        'Recall important information'
      ],
      skills: [
        'Apply learned concepts to real situations',
        'Analyze and solve problems',
        'Communicate ideas effectively'
      ],
      attitude: [
        'Develop interest in the subject',
        'Show respect for diverse perspectives',
        'Demonstrate perseverance in learning'
      ],
      values: [
        'Appreciate the importance of the topic',
        'Show responsibility in learning',
        'Practice integrity in academic work'
      ]
    },
    content: `
      This is the main content of the lesson. It includes:
      1. Introduction to the topic
      2. Key concepts and definitions
      3. Examples and applications
      4. Real-world connections
    `,
    procedures: {
      review: 'Ask students about previous lessons related to this topic. Show quick review slides.',
      motivation: 'Engage students with an interesting question or video clip related to the topic.',
      lessonProper: 'Present the main content using slides, examples, and interactive activities.',
      guidedPractice: 'Work through examples with students. Answer questions. Provide guidance.',
      independentPractice: 'Give students tasks to complete independently. Monitor and assist as needed.',
      assessment: 'Conduct a quiz or performance task to check understanding.',
      assignment: 'Assign homework for reinforcement and enrichment.'
    },
    resources: [
      'Textbook: Chapter on the topic',
      'YouTube educational videos',
      'Online learning modules',
      'Visual aids and infographics',
      'Interactive tools and apps'
    ],
    reflection: 'Reflect on the effectiveness of this lesson in achieving the learning objectives.'
  };
};
