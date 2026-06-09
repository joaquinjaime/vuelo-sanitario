# ✈️ Sistema de Vuelos Sanitarios

Plataforma de gestión de vuelos sanitarios con roles diferenciados (DTS, Comandante, Operaciones), estados de vuelo, historial de auditoría, notificaciones en tiempo real y gestión documental.

---

## 🏗 Stack Tecnológico

| Capa       | Tecnología                             |
|------------|----------------------------------------|
| Backend    | Java 17 + Spring Boot 3.2              |
| Seguridad  | Spring Security + JWT (jjwt 0.12)      |
| Persistencia | PostgreSQL 16 + Hibernate + Flyway   |
| WebSocket  | Spring WebSocket + STOMP               |
| Frontend   | React 18 + Vite                        |
| Estado     | TanStack React Query + Context API     |
| Estilos    | Tailwind CSS 3                         |
| HTTP       | Axios con interceptores JWT            |

---

## 🚀 Instalación y Ejecución

### Pre-requisitos
- Java 17+
- Node.js 18+
- PostgreSQL 16
- Maven 3.9+

### 1. Base de Datos

```sql
CREATE DATABASE vuelos_sanitarios;
```

Flyway ejecuta las migraciones automáticamente al iniciar el backend.

### 2. Backend

```bash
cd backend

# Configurar variables de entorno (o editar application.yml)
export DB_USERNAME=postgres
export DB_PASSWORD=tu_password
export JWT_SECRET=TuClaveSecretaMuyLargaDeAl64CaracteresComoMinimo!!

# Ejecutar
mvn spring-boot:run
```

El servidor corre en `http://localhost:8080/api/v1`

### 3. Frontend

```bash
cd frontend

npm install
npm run dev
```

La app corre en `http://localhost:5173`

---

## 👤 Usuarios de Prueba

| Usuario        | Contraseña  | Rol              |
|----------------|-------------|------------------|
| dts_admin      | Admin1234!  | DTS              |
| cmd_mendez     | Admin1234!  | Comandante       |
| ops_fernandez  | Admin1234!  | Operaciones      |

---

## 📋 Flujo Operativo

```
DTS crea petición
       ↓
OPS revisa y eleva al Comandante
       ↓
CMD confirma factibilidad
       ↓
DTS acepta la oferta
       ↓
CMD/OPS cargan info técnica (ruta, hangar, AA2000, meteo, plan)
       ↓
OPS aprueba formulario → VIGENTE
       ↓
OPS inicia ejecución → EN_EJECUCION
       ↓
OPS finaliza → FINALIZADO
       ↓
CMD/OPS cargan Informe Final
```

---

## 🔌 Endpoints Principales

| Método | Endpoint                              | Rol               |
|--------|---------------------------------------|-------------------|
| POST   | /auth/login                           | Todos             |
| GET    | /vuelos                               | Todos             |
| GET    | /vuelos/{id}                          | Todos             |
| POST   | /peticiones                           | DTS               |
| PATCH  | /peticiones/{id}/aprobar              | OPERACIONES       |
| PATCH  | /peticiones/{id}/confirmar-factibilidad | COMANDANTE      |
| PATCH  | /peticiones/{id}/confirmar-dts        | DTS               |
| PATCH  | /vuelos/{id}/marcar-aprobado          | OPERACIONES       |
| PATCH  | /vuelos/{id}/cancelar                 | Todos             |
| PUT    | /vuelos/{id}/ruta                     | CMD / OPS         |
| GET    | /vuelos/{id}/historial                | Todos             |
| POST   | /vuelos/{id}/informe-final            | CMD / OPS         |
| GET    | /notificaciones                       | Todos             |
| WS     | /ws → /user/queue/notificaciones      | Todos             |

---

## 🔐 Seguridad

- Contraseñas hasheadas con **BCrypt**
- JWT stateless con expiración de 24h
- Refresh token de 7 días
- `@PreAuthorize` en cada endpoint sensible
- CORS configurado solo para el frontend
- Todas las acciones quedan en `historial_vuelo`

---

## 📁 Estructura del Proyecto

```
vuelos-sanitarios/
├── backend/
│   ├── src/main/java/com/vuelos/sanitarios/
│   │   ├── config/          # Security, WebSocket, CORS
│   │   ├── controller/      # REST Controllers
│   │   ├── service/         # Lógica de negocio
│   │   ├── repository/      # Spring Data JPA
│   │   ├── model/           # Entidades JPA
│   │   ├── dto/             # Request/Response DTOs
│   │   ├── enums/           # EstadoVuelo, NombreRol, etc.
│   │   ├── exception/       # Manejo de errores global
│   │   └── security/        # JWT Filter, UserDetails
│   └── src/main/resources/
│       ├── application.yml
│       └── db/migration/    # Flyway scripts
│
└── frontend/
    └── src/
        ├── api/             # Axios services
        ├── components/      # Componentes reutilizables
        ├── context/         # Auth + Notificaciones
        ├── pages/           # Páginas de la app
        ├── router/          # React Router + guards
        └── utils/           # Helpers de fecha, rol, estado
```

---

## 📝 Notas de Desarrollo

- El campo `pdf` en `INFO_VUELO` almacena el binario en la BD (BYTEA). Para producción se recomienda usar S3/almacenamiento externo y guardar solo la URL.
- Las notificaciones WebSocket usan STOMP sobre SockJS para compatibilidad máxima con navegadores.
- El historial es inmutable — nunca se borra, solo se agrega.
- Las transiciones de estado están validadas en `EstadoVuelo.puedeTransicionarA()` en el backend.
