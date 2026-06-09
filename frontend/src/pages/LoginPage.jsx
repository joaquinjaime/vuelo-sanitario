import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, PlaneTakeoff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [form, setForm]         = useState({ username: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const { login }   = useAuth()
  const navigate    = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) {
      toast.error('Completá usuario y contraseña')
      return
    }
    setLoading(true)
    try {
      const data = await login(form.username, form.password)
      toast.success(`Bienvenido, ${data.nombreCompleto}`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Credenciales inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f1a] p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-900/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-900/20 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-900/50">
            <PlaneTakeoff size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-200">Sistema de Vuelos Sanitarios</h1>
          <p className="text-slate-500 text-sm mt-1">Iniciá sesión para continuar</p>
        </div>

        {/* Card */}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Usuario</label>
              <input
                className="input"
                placeholder="tu_usuario"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  autoComplete="current-password"
                />
                <button type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Ingresando...
                </span>
              ) : 'Ingresar'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-5 pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-600 text-center mb-3">Usuarios de prueba (contraseña: Admin1234!)</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { u: 'dts_admin',     r: 'DTS',         c: 'text-cyan-400' },
                { u: 'cmd_mendez',    r: 'CMD',         c: 'text-purple-400' },
                { u: 'ops_fernandez', r: 'OPS',         c: 'text-amber-400' },
              ].map(item => (
                <button key={item.u}
                  onClick={() => setForm({ username: item.u, password: 'Admin1234!' })}
                  className="text-center p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-colors">
                  <div className={`text-xs font-semibold ${item.c}`}>{item.r}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5 truncate">{item.u}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
