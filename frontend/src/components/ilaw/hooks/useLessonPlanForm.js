// ============================================
// CUSTOM HOOK: useLessonPlanForm
// ============================================

import { useState, useCallback } from 'react';
import { validateDepEdFormat } from '../utils/depedFormatter';

export const useLessonPlanForm = (initialData = {}) => {
  const [formData, setFormData] = useState({
    // Basic Information
    school: initialData.school || '',
    teacherName: initialData.teacherName || '',
    gradeLevel: initialData.gradeLevel || '',
    section: initialData.section || '',
    subject: initialData.subject || '',
    learningArea: initialData.learningArea || '',
    quarter: initialData.quarter || '',
    week: initialData.week || '',
    date: initialData.date || new Date().toISOString().split('T')[0],
    time: initialData.time || '',

    // Competency Information
    competency: initialData.competency || '',
    competencyCode: initialData.competencyCode || '',

    // Objectives
    objectives: initialData.objectives || '',
    knowledge: initialData.knowledge || '',
    skills: initialData.skills || '',
    attitude: initialData.attitude || '',
    values: initialData.values || '',

    // Intentions
    intentions: initialData.intentions || '',

    // Content
    mainTopic: initialData.mainTopic || '',
    subtopics: initialData.subtopics || [],
    content: initialData.content || '',

    // Learning Resources
    books: initialData.books || [],
    modules: initialData.modules || [],
    audiovisuals: initialData.audiovisuals || [],
    websites: initialData.websites || [],
    resources: initialData.resources || [],

    // Procedures
    review: initialData.review || '',
    motivation: initialData.motivation || '',
    lessonProper: initialData.lessonProper || '',
    guidedPractice: initialData.guidedPractice || '',
    independentPractice: initialData.independentPractice || '',
    assessment: initialData.assessment || '',
    assignment: initialData.assignment || '',

    // Reflection
    reflection: initialData.reflection || '',
    teacherReflection: initialData.teacherReflection || '',
    improvementAreas: initialData.improvementAreas || []
  });

  const [errors, setErrors] = useState([]);
  const [touched, setTouched] = useState({});

  const updateField = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    if (touched[field]) {
      validateField(field, value);
    }
  }, [touched]);

  const updateMultipleFields = useCallback((updates) => {
    setFormData(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  const addToArray = useCallback((field, item) => {
    setFormData(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), item]
    }));
  }, []);

  const removeFromArray = useCallback((field, index) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  }, []);

  const validateField = useCallback((field, value) => {
    const fieldErrors = [];
    
    // Required fields validation
    const requiredFields = ['school', 'subject', 'gradeLevel', 'competency', 'objectives'];
    if (requiredFields.includes(field) && !value) {
      fieldErrors.push(`${field} is required`);
    }

    // Email validation for teacher contact (if needed)
    if (field === 'teacherEmail' && value && !isValidEmail(value)) {
      fieldErrors.push('Please enter a valid email');
    }

    // Length validations
    if (field === 'subject' && value && value.length < 3) {
      fieldErrors.push('Subject must be at least 3 characters');
    }

    return fieldErrors;
  }, []);

  const validateForm = useCallback(() => {
    const validationResult = validateDepEdFormat(formData);
    setErrors(validationResult.errors);
    return validationResult.isValid;
  }, [formData]);

  const handleFieldBlur = useCallback((field) => {
    setTouched(prev => ({
      ...prev,
      [field]: true
    }));
    validateField(field, formData[field]);
  }, [formData, validateField]);

  const resetForm = useCallback(() => {
    setFormData(initialData);
    setErrors([]);
    setTouched({});
  }, [initialData]);

  const getFormValue = useCallback((field) => {
    return formData[field];
  }, [formData]);

  const getFieldError = useCallback((field) => {
    if (touched[field]) {
      return validateField(field, formData[field]);
    }
    return [];
  }, [touched, formData, validateField]);

  const isFormValid = useCallback(() => {
    return errors.length === 0 && 
           formData.school && 
           formData.subject && 
           formData.gradeLevel && 
           formData.competency && 
           formData.objectives;
  }, [errors, formData]);

  return {
    formData,
    updateField,
    updateMultipleFields,
    addToArray,
    removeFromArray,
    validateForm,
    validateField,
    handleFieldBlur,
    resetForm,
    getFormValue,
    getFieldError,
    isFormValid,
    errors,
    touched
  };
};

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
