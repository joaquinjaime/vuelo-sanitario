import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { notificacionApi } from '../api/notificacionApi'
import toast from 'react-hot-toast'

const NotificacionContext = createContext(null)

export function NotificacionProvider({ children }) {
  const { user, isAuthenticated } = useAuth()
  const qc = useQueryClient()
  const [notificaciones, setNotificaciones] = useState([])
  const [noLeidas, setNoLeidas]             = useState(0)
  const clientRef = useRef(null)

  // Refresca los caches de react-query según el evento recibido,
  // para que otros usuarios vean los cambios sin recargar la página
  const sincronizarCache = useCallback((notif) => {
    if (!notif?.tipo) return

    switch (notif.tipo) {
      case 'INFO_ACTUALIZADA':
        qc.invalidateQueries({ queryKey: ['info-vuelo'] })
        qc.invalidateQueries({ queryKey: ['historial'] })
        // Re-intento tardío por si el refetch corrió antes del commit en la BD
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['info-vuelo'] })
        }, 1000)
        break
      case 'CAMBIO_ESTADO':
      case 'VUELO_CANCELADO':
      case 'VUELO_VIGENTE':
        qc.invalidateQueries({ queryKey: ['vuelo'] })
        qc.invalidateQueries({ queryKey: ['vuelos'] })
        qc.invalidateQueries({ queryKey: ['historial'] })
        break
    }
  }, [qc])

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
          sincronizarCache(notif)
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
  }, [isAuthenticated, user, cargarNotificaciones, sincronizarCache])

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
