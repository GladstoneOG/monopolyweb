// src/components/shared/DevConsoleModal.tsx
import React, { useState } from 'react';

interface DevConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (commandStr: string) => void;
}

const HELP_LINES = [
  'setmoney <name|id> <amount>   — Set player cash',
  'setroll <d1> <d2>             — Force next dice roll (1..6)',
  'setnextcard <chance|chest> <action|id> — Force next card',
  'teleport <name|id> <0..39>    — Move player token',
  'addcard <name|id> <angel|odd_even|jail> — Grant special card',
  'bankrupt <name|id>            — Instantly bankrupt a player',
];

export const DevConsoleModal: React.FC<DevConsoleModalProps> = ({
  isOpen,
  onClose,
  onRunCommand,
}) => {
  const [cmd, setCmd] = useState('');
  const [logs, setLogs] = useState<string[]>([
    'Monopoly Host Dev Console — type "help" for commands.',
  ]);

  if (!isOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cmd.trim();
    if (!trimmed) return;

    if (trimmed.toLowerCase() === 'help') {
      setLogs((prev) => [...prev, `> ${trimmed}`, ...HELP_LINES]);
    } else if (trimmed.toLowerCase() === 'clear') {
      setLogs([]);
    } else {
      onRunCommand(trimmed);
      setLogs((prev) => [...prev, `> ${trimmed}`]);
    }
    setCmd('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dev-console-box" onClick={(e) => e.stopPropagation()}>
        <div className="dev-console-header">
          <span>🔧 Host Dev Console</span>
          <button type="button" className="icon-close-btn small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="dev-console-logs">
          {logs.map((line, i) => (
            <div key={i} className="dev-console-line">
              {line}
            </div>
          ))}
        </div>
        <form className="dev-console-form" onSubmit={submit}>
          <span className="dev-prompt">&gt;</span>
          <input
            type="text"
            value={cmd}
            autoFocus
            onChange={(e) => setCmd(e.target.value)}
            placeholder="setroll 6 6 | addcard Host angel | setmoney Host 5000"
          />
          <button type="submit" className="btn-primary">
            Run
          </button>
        </form>
      </div>
    </div>
  );
};
