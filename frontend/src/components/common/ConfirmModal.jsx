import { AlertTriangle } from 'lucide-react'

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, danger = false, children }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          {danger && <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />}
          <h3 className="font-semibold text-slate-200">{title}</h3>
        </div>
        <div className="p-5">
          {message && <p className="text-sm text-slate-400 mb-4">{message}</p>}
          {children}
        </div>
        <div className="px-5 pb-5 flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary">Cancelar</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
