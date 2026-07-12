import { AlertTriangle, CheckCircle2, Info, X, WifiOff } from 'lucide-react';
import type { ConnectionState, ToastMessage } from '../types/domain';

export function OrnateCorners() {
  return <span className="ornate-corners" aria-hidden="true" />;
}

export function ConnectionBadge({ connection, ping }: { connection: ConnectionState; ping: number | null }) {
  const labels: Record<ConnectionState, string> = {
    connecting: 'Подключение…',
    connected: 'Сервер доступен',
    reconnecting: 'Восстановление связи…',
    offline: 'Сервер недоступен',
  };
  return (
    <div className={`connection-badge connection-${connection}`} title="Состояние подключения к игровому серверу">
      <span className="connection-dot" />
      <span>{labels[connection]}</span>
      {ping !== null ? <><i className="status-divider" /><span className="signal-bars">▂▄▆</span><span>{ping} мс</span></> : null}
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'danger' || toast.tone === 'warning' ? AlertTriangle : Info;
        return (
          <div className={`toast toast-${toast.tone}`} key={toast.id}>
            <Icon size={19} aria-hidden="true" />
            <div><strong>{toast.title}</strong>{toast.detail ? <span>{toast.detail}</span> : null}</div>
            <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Закрыть уведомление"><X size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}

export function ReconnectOverlay({ seconds }: { seconds: number }) {
  return (
    <div className="reconnect-overlay" role="status">
      <div className="reconnect-card iron-panel">
        <WifiOff size={32} />
        <h2>Связь с королевством прервана</h2>
        <p>Автоматически пытаемся вернуться в сражение.</p>
        <div className="reconnect-count">00:{String(seconds).padStart(2, '0')}</div>
        <div className="progress-track"><i style={{ width: `${Math.max(0, Math.min(100, (seconds / 60) * 100))}%` }} /></div>
      </div>
    </div>
  );
}

export function LoadingScreen({ progress }: { progress: number }) {
  return (
    <div className="loading-screen">
      <div className="loading-sigil" aria-hidden="true"><span>⚔</span></div>
      <div className="loading-logo"><span>ПЕПЕЛ</span><i>И</i><span>КЛЯТВА</span></div>
      <p>Кузнецы готовят поле брани</p>
      <div className="loading-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <small>{Math.round(progress * 100)}%</small>
    </div>
  );
}
