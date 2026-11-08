import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Btn, Card } from '../shared/ui';
import useDialogSafety from './useDialogSafety';
import {
  ESSAY_FIXTURE, evaluateSyntheticEssay, reviewFingerprint, sumPoints, validateMarks, validateRubric,
} from './essayReviewModel';

const fieldClass = 'w-full min-h-11 rounded-lg px-3 py-2 text-sm';
const fieldStyle = { color: 'var(--text)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' };
const copyRubric = () => ESSAY_FIXTURE.rubric.map(item => ({ ...item }));

export default function EssayReviewLab() {
  const navigate = useNavigate();
  const [responseId, setResponseId] = useState(ESSAY_FIXTURE.responses[0].id);
  const [questionId, setQuestionId] = useState(ESSAY_FIXTURE.questions[0].id);
  const [criteria, setCriteria] = useState(copyRubric);
  const [marks, setMarks] = useState({});
  const [feedback, setFeedback] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [state, setState] = useState('ready');
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const requestRef = useRef(0);
  const timerRef = useRef(null);
  const approvalRef = useRef(false);
  const nextCriterionRef = useRef(0);
  const response = ESSAY_FIXTURE.responses.find(item => item.id === responseId);
  const question = ESSAY_FIXTURE.questions.find(item => item.id === questionId);
  const rubricErrors = validateRubric(criteria, question.points);
  const markErrors = validateMarks(criteria, marks);
  const fingerprint = reviewFingerprint({ fixtureId: ESSAY_FIXTURE.id, response, question, criteria });
  const suggestionCurrent = suggestion?.fingerprint === fingerprint;
  const responseMatchesQuestion = response.questionId === question.id;
  const total = sumPoints(criteria.map(item => marks[item.id]));
  const pending = state === 'pending';
  const { routeBlocker, busyNotice } = useDialogSafety({
    dirty, pending, onClose: () => navigate('/teacher-dashboard/grades'),
    discardMessage: 'Discard this local essay review? It is not saved to EduScribe.',
  });

  useEffect(() => () => {
    requestRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const cancelPending = () => {
    requestRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const invalidate = ({ clearFeedback = false } = {}) => {
    cancelPending();
    setSuggestion(null);
    setMarks({});
    if (clearFeedback) setFeedback('');
    setReviewed(false);
    setState(previous => previous === 'ready' ? 'ready' : 'stale');
    setError('');
    approvalRef.current = false;
    setDirty(true);
  };
  const changeCriterion = (id, patch) => {
    setCriteria(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
    invalidate();
  };
  const addCriterion = () => {
    const id = `teacher-criterion-${++nextCriterionRef.current}`;
    setCriteria(previous => [...previous, { id, title: '', description: '', guidance: '', maxPoints: '' }]);
    invalidate();
  };
  const removeCriterion = id => {
    setCriteria(previous => previous.filter(item => item.id !== id));
    invalidate();
  };
  const moveCriterion = (index, direction) => {
    const destination = index + direction;
    if (destination < 0 || destination >= criteria.length) return;
    setCriteria(previous => {
      const next = [...previous];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    invalidate();
  };

  const requestEvaluation = () => {
    if (pending || timerRef.current || Object.keys(rubricErrors).length || !responseMatchesQuestion) return;
    cancelPending();
    const token = requestRef.current;
    const requestedFingerprint = fingerprint;
    setState('pending');
    setError('');
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (requestRef.current !== token) return;
      try {
        const result = evaluateSyntheticEssay({ fixtureId: ESSAY_FIXTURE.id, response, question, criteria });
        if (requestedFingerprint !== reviewFingerprint({ fixtureId: ESSAY_FIXTURE.id, response, question, criteria })) return;
        setSuggestion({ ...result, fingerprint: requestedFingerprint });
        setMarks(result.marks);
        setFeedback(result.feedback);
        setReviewed(false);
        setDirty(true);
        setState('suggestion');
      } catch (failure) {
        setSuggestion(null);
        setState('failed');
        setError(failure instanceof Error ? failure.message : 'The local evaluation could not be prepared.');
      }
    }, 300);
  };

  const approve = () => {
    if (approvalRef.current || pending || !reviewed || !responseMatchesQuestion
      || Object.keys(rubricErrors).length || Object.keys(markErrors).length
      || (suggestion && !suggestionCurrent)) return;
    approvalRef.current = true;
    setState('approved');
    setDirty(false);
  };

  return <div className="p-4 sm:p-6 min-w-0 space-y-5" style={{ color: 'var(--text)' }}>
    {routeBlocker}
    <header className="flex flex-wrap justify-between items-start gap-3">
      <div>
        <h1 className="text-xl font-bold">Essay Review Lab</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Fictional submissions only. No score is saved or released.</p>
      </div>
      <Btn variant="outline" onClick={() => navigate('/teacher-dashboard/grades')}>Back to Grading</Btn>
    </header>
    <p role="status" className="rounded-lg border px-3 py-2 text-sm" style={fieldStyle}>Simulated evaluation — not live AI. Local development only.</p>
    {busyNotice && <p role="status">{busyNotice}</p>}
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="p-4 sm:p-5 min-w-0 space-y-4">
        <h2 className="font-semibold">Synthetic essay submission</h2>
        <label className="block text-sm font-medium">Learner response
          <select className={`${fieldClass} mt-1`} style={fieldStyle} value={responseId} onChange={event => {
            setResponseId(event.target.value); invalidate({ clearFeedback: true });
          }}>{ESSAY_FIXTURE.responses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </label>
        <label className="block text-sm font-medium">Essay question
          <select className={`${fieldClass} mt-1`} style={fieldStyle} value={questionId} onChange={event => {
            setQuestionId(event.target.value); invalidate({ clearFeedback: true });
          }}>{ESSAY_FIXTURE.questions.map(item => <option key={item.id} value={item.id}>{item.text}</option>)}</select>
        </label>
        {!responseMatchesQuestion && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>This answer belongs to another question. Select its original question before approval.</p>}
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold">{question.text}</h3>
          <p className="text-sm mt-1">Question maximum: {question.points} points</p>
          <p className="text-sm mt-3 font-medium">{response.name} — answer</p>
          <p className="text-sm whitespace-pre-wrap break-words mt-1">{response.answer}</p>
        </div>
      </Card>
      <Card className="p-4 sm:p-5 min-w-0 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2"><h2 className="font-semibold">Scoring rubric</h2><Btn variant="outline" onClick={addCriterion}>Add criterion</Btn></div>
        {criteria.map((criterion, index) => <fieldset key={criterion.id} className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <legend className="px-1 text-sm font-semibold">Criterion {index + 1}</legend>
          <div className="flex flex-wrap gap-2">
            <Btn variant="outline" disabled={index === 0} onClick={() => moveCriterion(index, -1)}>Move up criterion {index + 1}</Btn>
            <Btn variant="outline" disabled={index === criteria.length - 1} onClick={() => moveCriterion(index, 1)}>Move down criterion {index + 1}</Btn>
            <Btn variant="outline" onClick={() => removeCriterion(criterion.id)}>Remove criterion {index + 1}</Btn>
          </div>
          <label className="block text-sm">Criterion {index + 1} title
            <input className={`${fieldClass} mt-1`} style={fieldStyle} value={criterion.title} aria-invalid={Boolean(rubricErrors[`title-${index}`])}
              onChange={event => changeCriterion(criterion.id, { title: event.target.value })} /></label>
          {rubricErrors[`title-${index}`] && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{rubricErrors[`title-${index}`]}</p>}
          <label className="block text-sm">Criterion {index + 1} description
            <textarea className={`${fieldClass} mt-1`} style={fieldStyle} value={criterion.description}
              onChange={event => changeCriterion(criterion.id, { description: event.target.value })} /></label>
          <label className="block text-sm">Criterion {index + 1} maximum points
            <input className={`${fieldClass} mt-1`} style={fieldStyle} type="number" min="0" max="100" step="0.5" value={criterion.maxPoints}
              aria-invalid={Boolean(rubricErrors[`max-${index}`])} onChange={event => changeCriterion(criterion.id, { maxPoints: event.target.value })} /></label>
          {rubricErrors[`max-${index}`] && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{rubricErrors[`max-${index}`]}</p>}
          <label className="block text-sm">Criterion {index + 1} performance guidance (optional)
            <textarea className={`${fieldClass} mt-1`} style={fieldStyle} value={criterion.guidance}
              onChange={event => changeCriterion(criterion.id, { guidance: event.target.value })} /></label>
        </fieldset>)}
        {rubricErrors.rubric && <p role="alert" style={{ color: 'var(--red)' }}>{rubricErrors.rubric}</p>}
        <p role="status" className="font-semibold">Rubric total: {sumPoints(criteria.map(item => item.maxPoints)) ?? 'Invalid'} / {question.points}</p>
        {rubricErrors.total && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{rubricErrors.total}</p>}
      </Card>
    </div>
    <Card className="p-4 sm:p-5 min-w-0 space-y-4">
      <h2 className="font-semibold">Teacher review</h2>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={requestEvaluation} disabled={pending || Boolean(Object.keys(rubricErrors).length) || !responseMatchesQuestion}>
          {pending ? 'Preparing local suggestion…' : 'Request simulated evaluation'}</Btn>
        {pending && <Btn variant="outline" onClick={() => { cancelPending(); setState('ready'); }}>Cancel evaluation</Btn>}
      </div>
      {pending && <p role="status">Matching the fictional response to a local evaluation fixture…</p>}
      {error && <p role="alert" style={{ color: 'var(--red)' }}>{error} You can retry or score manually.</p>}
      {state === 'stale' && <p role="status">The previous suggestion is stale. Request a new simulation or score this response manually.</p>}
      {state === 'rejected' && <p role="status">Suggestion rejected. Enter your own marks and feedback to continue.</p>}
      {suggestionCurrent && <div className="rounded-lg border p-3 text-sm space-y-1" style={{ borderColor: 'var(--border)' }}>
        <p className="font-semibold">{suggestion.label}</p>
        <p>Suggested total: {suggestion.total} / {question.points}</p>
        <p>Strength: {suggestion.strengths}</p><p>Improve: {suggestion.improvements}</p>
        <Btn variant="outline" onClick={() => { setSuggestion(null); setMarks({}); setReviewed(false); setState('rejected'); }}>Reject suggestion</Btn>
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {criteria.map(criterion => <label key={criterion.id} className="block text-sm font-medium">{criterion.title || 'Untitled criterion'} score (max {criterion.maxPoints || 0})
          <input className={`${fieldClass} mt-1`} style={fieldStyle} type="number" min="0" max={criterion.maxPoints} step="0.5"
            value={marks[criterion.id] ?? ''} aria-invalid={Boolean(markErrors[criterion.id])}
            onChange={event => { setMarks(previous => ({ ...previous, [criterion.id]: event.target.value })); setReviewed(false); setDirty(true); setState('ready'); approvalRef.current = false; }} />
          {markErrors[criterion.id] && (reviewed || (marks[criterion.id] !== undefined && marks[criterion.id] !== ''))
            && <span role="alert" className="block mt-1" style={{ color: 'var(--red)' }}>{markErrors[criterion.id]}</span>}
        </label>)}
      </div>
      <p role="status" className="font-semibold">Teacher score: {total} / {question.points}</p>
      <label className="block text-sm font-medium">Teacher feedback
        <textarea className={`${fieldClass} mt-1`} style={fieldStyle} rows={4} value={feedback}
          onChange={event => { setFeedback(event.target.value); setReviewed(false); setDirty(true); setState('ready'); approvalRef.current = false; }} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} className="mt-1"
        onChange={event => { setReviewed(event.target.checked); setDirty(true); }} />
        I reviewed this answer, each criterion mark, and my feedback.</label>
      <Btn variant="primary" onClick={approve} disabled={pending || state === 'approved' || !reviewed || !responseMatchesQuestion
        || Boolean(Object.keys(rubricErrors).length) || Boolean(Object.keys(markErrors).length) || Boolean(suggestion && !suggestionCurrent)}>
        Approve review locally</Btn>
      {state === 'approved' && <p role="status" className="rounded-lg border p-3 text-sm" style={fieldStyle}>
        Review approved locally for testing. No student score was changed or released.</p>}
    </Card>
  </div>;
}
