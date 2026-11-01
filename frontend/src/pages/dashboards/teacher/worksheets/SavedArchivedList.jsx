import { useRef, useState } from 'react';
import { archiveAiWeeklyCollection } from '../persistence/aiWeeklyWorksheetManageClient';
import { Btn, Card } from '../shared/ui';

export default function SavedArchivedList({ groups, apiBase, onCollectionChanged }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [messages, setMessages] = useState({});
  const busyRef = useRef(new Set());

  const restore = async group => {
    const revision = Number(group.revision);
    if (busyRef.current.has(group.id) || !Number.isSafeInteger(revision) || revision < 1) return;
    busyRef.current.add(group.id);
    setBusyId(group.id);
    setMessages(current => ({ ...current, [group.id]: '' }));
    try {
      const result = await archiveAiWeeklyCollection(apiBase, {
        collectionId: group.id, expectedRevision: revision, archived: false,
      });
      if (result.status !== 'saved') {
        setMessages(current => ({ ...current, [group.id]: result.message }));
      }
      await onCollectionChanged?.();
    } finally {
      busyRef.current.delete(group.id);
      setBusyId(null);
    }
  };

  return <section aria-label="Archived weekly collections" className="min-w-0 md:col-span-2 lg:col-span-3">
    <Btn variant="outline" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      {open ? 'Hide archived' : 'Show archived'} ({groups.length})
    </Btn>
    {open && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
      {groups.map(group => {
        const revision = Number(group.revision);
        return <Card key={group.id} className="p-4 min-w-0"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
          <h3 className="font-semibold break-words" style={{ color: 'var(--text)' }}>{group.title}</h3>
          <Btn disabled={busyId === group.id || !Number.isSafeInteger(revision) || revision < 1}
            busy={busyId === group.id} onClick={() => { void restore(group); }}>Restore</Btn>
          {messages[group.id] && <p role="alert">{messages[group.id]}</p>}
        </Card>;
      })}
    </div>}
  </section>;
}
