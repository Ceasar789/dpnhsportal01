import { useRef, useState } from 'react';
import { FileUp, X } from 'lucide-react';

const fileSize = bytes => bytes < 1024 ? `${bytes} B`
  : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const TeacherFilePicker = ({ id, accept, guidance, file, onSelect, onRemove, disabled = false }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const selectFile = selected => {
    if (!disabled && selected) onSelect(selected);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div data-testid={`${id}-dropzone`} onDragEnter={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        selectFile(event.dataTransfer.files?.[0]);
      }}
      className="rounded-lg border-2 border-dashed p-4 text-left focus-within:outline focus-within:outline-2 focus-within:outline-offset-2"
      style={{
        borderColor: dragging ? 'var(--banner-accent)' : 'var(--border)',
        backgroundColor: dragging ? 'var(--banner-pill-bg)' : 'var(--card2)',
        outlineColor: 'var(--accent)',
      }}>
      <input ref={inputRef} id={id} type="file" accept={accept} disabled={disabled}
        aria-describedby={`${id}-guidance ${id}-selection`} className="sr-only"
        onChange={event => selectFile(event.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={id} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
          style={{ color: 'var(--banner-accent)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <FileUp size={16} aria-hidden="true" />{file ? 'Replace file' : 'Choose file'}
        </label>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }} aria-hidden="true">or drag and drop here</span>
      </div>
      <p id={`${id}-guidance`} className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{guidance}</p>
      <div id={`${id}-selection`} role="status" className="mt-3 flex flex-wrap items-center gap-2 min-w-0">
        {file ? <>
          <span className="text-sm font-medium break-all" style={{ color: 'var(--text)' }}>{file.name}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fileSize(file.size)} · {file.name.split('.').pop()?.toUpperCase() || 'File'}</span>
          <button type="button" disabled={disabled} onClick={onRemove} aria-label={`Remove selected file ${file.name}`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold"
            style={{ color: 'var(--red)', border: '1px solid var(--border)' }}>
            <X size={14} aria-hidden="true" />Remove
          </button>
        </> : <span className="text-sm" style={{ color: 'var(--text-muted)' }}>No file selected</span>}
      </div>
    </div>
  );
};

export default TeacherFilePicker;
