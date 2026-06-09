import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useAuth } from './AuthContext'
import { notificacionApi } from '../api/notificacionApi'
import toast from 'react-hot-toast'

const NotificacionContext = createContext(null)

export function NotificacionProvider({ children }) {
  const { user, isAuthenticated } = useAuth()
  const [notificaciones, setNotificaciones] = useState([])
  const [noLeidas, setNoLeidas]             = useState(0)
  const clientRef = useRef(null)

  // Cargar notificaciones iniciales
  const cargarNotificaciones = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const data = await notificacionApi.listar()
      setNotificaciones(data)
      setNoLeidas(data.filter(n => !n.leida).length)
    } catch { /* silencioso */ }
  }, [isAuthenticated])

  // Conectar WebSocket
  useEffect(() => {
    if (!isAuthenticated || !user) return

    cargarNotificaciones()

    const token = localStorage.getItem('token')
    const client = new Client({
      webSocketFactory: () => new SockJS(import.meta.env.VITE_WS_URL),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/user/queue/notificaciones`, (msg) => {
          const notif = JSON.parse(msg.body)
          setNotificaciones(prev => [notif, ...prev])
          setNoLeidas(prev => prev + 1)
          toast(notif.titulo, {
            icon: '🔔',
            duration: 5000,
          })
        })
      },
    })

    client.activate()
    clientRef.current = client

    return () => { client.deactivate() }
  }, [isAuthenticated, user, cargarNotificaciones])

  const marcarLeida = useCallback(async (id) => {
    await notificacionApi.marcarLeida(id)
    setNotificaciones(prev =>
      prev.map(n => n.idNotificacion === id ? { ...n, leida: true } : n)
    )
    setNoLeidas(prev => Math.max(0, prev - 1))
  }, [])

  return (
    <NotificacionContext.Provider value={{ notificaciones, noLeidas, marcarLeida, cargarNotificaciones }}>
      {children}
    </NotificacionContext.Provider>
  )
}

export const useNotificaciones = () => useContext(NotificacionContext)
