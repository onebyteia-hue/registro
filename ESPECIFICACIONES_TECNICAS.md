# Especificaciones técnicas y funcionales
## Aplicación Bautizo | Padrinos & Ahijados

**Versión documentada:** estado del código revisado el 16 de septiembre de 2026  
**Tipo de solución:** aplicación web cliente, responsive, con autenticación y persistencia en Firebase  
**Idioma de la interfaz:** español

## 1. Propósito

La aplicación permite organizar la asignación temporal de padrinos y ahijados dentro de una actividad de bautizo o dinámica institucional. Los usuarios se identifican con Google, eligen un rol y, según dicho rol, pueden consultar perfiles, reservar padrinos disponibles o administrar el estado de los participantes.

La solución funciona como una aplicación de una sola página (SPA) ligera: las vistas se renderizan en el navegador y la navegación se controla mediante rutas hash.

## 2. Alcance funcional

### 2.1 Funcionalidades implementadas

- Inicio y cierre de sesión mediante Google.
- Creación automática del perfil base de cada usuario autenticado.
- Registro obligatorio de nombre, apellido paterno, apellido materno y rol.
- Aceptación de reglas de uso mediante un modal.
- Roles disponibles:
  - **Padrino:** publica una ficha de presentación y puede consultar perfiles.
  - **Ahijado:** consulta padrinos y puede efectuar reservas.
- Buscador de padrinos por nombre completo o apodo.
- Ordenamiento por nombre y por indicadores de perfil.
- Visualización del estado del padrino: disponible, reservado o no disponible.
- Visualización del perfil detallado del padrino, fotografía, apodo, respuestas del cuestionario e indicadores calculados.
- Reserva de un padrino durante 30 minutos.
- Límite de dos reservas activas por ahijado.
- Aceptación definitiva de una reserva por parte del administrador.
- Lista oficial por ahijado con padrinos aceptados, reservas pendientes y padrinos posibles.
- Exportación de la lista oficial a PDF desde el panel administrativo.
- Liberación automática de reservas vencidas cuando se ejecutan las rutinas de limpieza.
- Registro del padrino con:
  - Fotografía almacenada en Firebase Storage.
  - Apodo.
  - Contraseña de acceso a “Mi Perfil”.
  - Cuestionario de 20 preguntas.
  - Respuestas de texto libre y selección única por pregunta.
  - Cinco indicadores calculados: alcohólico, cariñoso, chismoso, estudioso y fiestero.
- Límite de tres ediciones para el registro del padrino.
- Vista “Mi Perfil” protegida por una contraseña definida durante el registro.
- Panel de administración para listar padrinos o ahijados y buscar por nombre.
- Administración de disponibilidad de usuarios.
- Bloqueo de padrinos o ahijados y cancelación/liberación de reservas relacionadas.
- Interfaz responsive para escritorio y dispositivos móviles.
- Modales compatibles con el botón Atrás del navegador o del dispositivo móvil.

### 2.2 Funcionalidades que no se observan implementadas

- No existe mensajería entre padrinos y ahijados.
- No existe notificación por correo, SMS o push.
- No existe rechazo o desasignación de una aceptación definitiva desde la interfaz actual.
- No existe recuperación independiente de la contraseña de “Mi Perfil”.
- No existe exportación de datos ni reportes.
- No existe gestión de cuentas, roles o administradores desde la interfaz.
- No existe backend propio ni Cloud Functions; la lógica de negocio está en el cliente y en transacciones de Firestore.

## 3. Arquitectura de la solución

### 3.1 Capas

| Capa | Implementación | Responsabilidad |
|---|---|---|
| Presentación | `index.html`, `styles.css` | Estructura de la aplicación, estilos responsive y componentes visuales |
| Control de aplicación | `js/app.js` | Autenticación, rutas, vistas, validaciones y coordinación de operaciones |
| Estado local | `js/state.js` | Usuario autenticado, perfil y caché de padrinos |
| Interfaz reutilizable | `js/ui.js` | Encabezado, FAB, modales, mensajes, formato de tiempos y roles |
| Autenticación y archivos | `js/firebase.js` | Firebase Auth, Google Sign-In, Firebase Storage y configuración de Firebase |
| Persistencia | `js/firestore.js` | Consultas, transacciones, reservas, perfiles y operaciones administrativas |
| Servicios externos | Firebase CDN 10.12.5 | Firebase App, Auth, Firestore y Storage mediante módulos ES |

### 3.2 Tecnologías

- HTML5.
- CSS3, con variables CSS, Grid, Flexbox, media queries y efectos visuales.
- JavaScript moderno con módulos ES nativos.
- Firebase JavaScript SDK **10.12.5**, cargado desde `gstatic.com`.
- Firebase Authentication con proveedor Google.
- Cloud Firestore como base de datos documental.
- Firebase Storage para fotografías de padrinos.
- No se identifica `package.json`, bundler, framework frontend ni suite de pruebas automatizadas en el repositorio revisado.

## 4. Navegación y rutas

La aplicación usa rutas hash:

| Ruta | Vista | Acceso |
|---|---|---|
| `/` | Redirección al buscador | Usuario autenticado |
| `/ingreso` | Datos iniciales y rol | Usuario autenticado con perfil incompleto |
| `/buscador` | Listado y filtros de padrinos | Usuario autenticado |
| `/perfil?id=UID` | Detalle de padrino | Usuario autenticado |
| `/registro` | Formulario de ficha de padrino | Solo padrino |
| `/miperfil` | Perfil propio protegido | Solo padrino |
| `/admin` | Control de usuarios | Usuario con `admin: true` |

Si el usuario no está autenticado, la aplicación muestra la pantalla de bienvenida y el botón de inicio de sesión. Si el perfil no está completo, el enrutador fuerza la ruta `/ingreso`.

## 5. Roles y permisos

### 5.1 Padrino

- Puede consultar el buscador y los perfiles.
- No puede reservar.
- Debe completar el registro para estar disponible como padrino.
- Puede subir una fotografía.
- Puede editar su ficha hasta tres veces.
- Puede consultar “Mi Perfil” mediante la contraseña que definió.
- Puede ver su estado y el ahijado asociado mientras exista una reserva.

### 5.2 Ahijado

- Puede consultar y filtrar padrinos.
- Puede abrir perfiles de padrinos.
- Puede reservar padrinos disponibles.
- Puede mantener hasta dos reservas activas.
- No puede reservar si su estado es `no_disponible`.
- Ve sus reservas activas y el tiempo restante en el encabezado.

### 5.3 Administrador

Un administrador es un usuario cuyo documento tiene `admin: true`. Puede:

- Listar padrinos o ahijados.
- Buscar participantes por nombre completo.
- Marcar un padrino como disponible o no disponible.
- Marcar un ahijado como disponible o no disponible.
- Cancelar indirectamente reservas al bloquear al participante correspondiente.

## 6. Reglas de negocio

1. La autenticación se realiza con Google.
2. El perfil mínimo requiere nombre, dos apellidos y rol.
3. Las reglas deben aceptarse antes de utilizar normalmente la aplicación.
4. Solo los usuarios con rol `ahijado` pueden reservar.
5. Solo un padrino con `padrino: true` y estado `disponible` puede reservarse.
6. Una reserva dura 30 minutos.
7. Un ahijado puede tener como máximo dos reservas activas.
8. Un padrino reservado no puede ser reservado nuevamente.
9. Una reserva expirada debe liberar al padrino y quitarse del listado del ahijado.
10. El bloqueo de un padrino libera su reserva activa, si existe.
11. El bloqueo de un ahijado elimina sus reservas activas y libera los padrinos relacionados.
12. El administrador puede convertir una reserva vigente en aceptación definitiva; la reserva se elimina, el ahijado la agrega a `padrinosAceptados` y el padrino queda no disponible con `aceptacionActiva`.
13. El registro del padrino consume una edición por guardado exitoso y permite tres ediciones como máximo.
14. La selección del cuestionario es única por pregunta; escribir en “Otro” desmarca las opciones.
15. Los indicadores se calculan en una escala de 1 a 100 a partir de respuestas determinadas del cuestionario.

## 7. Modelo de datos de Firestore

### 7.1 Colección `user_bautizo`

Cada documento usa el UID de Firebase Authentication como identificador.

Campos principales observados:

```text
rol: "padrino" | "ahijado" | null
nombre: string | null
apellidoP: string | null
apellidoM: string | null
nombreCompleto: string | null
admin: boolean
reglasAceptadas: boolean
createdAt: Timestamp
updatedAt: Timestamp
```

Campos del padrino:

```text
padrino: boolean
estadoPadrino: "disponible" | "reservado" | "no_disponible"
reservaActiva: {
  ahijadoId: string
  ahijadoNombreCompleto: string
  expiresAt: Timestamp
} | null
editsUsed: number
miPerfilPass: string
apodo: string
fotoURL: string
cuestionarioPadrino: object
aspectos: {
  alcoholico: number
  carinoso: number
  chismoso: number
  estudioso: number
  fiestero: number
}
```

Campos del ahijado:

```text
estadoApadrinado: "disponible" | "no_disponible"
reservasActivas: [{
  padrinoId: string
  padrinoNombreCompleto: string
  expiresAt: Timestamp
}]
padrinosAceptados: [{
  padrinoId: string
  padrinoNombreCompleto: string
  aceptadoAt: Timestamp
}]
```

### 7.2 Colección `pass_cursos`

Se consulta el documento fijo `pass_cursos/registro` y el campo `pass` se utiliza como contraseña global para habilitar el registro del padrino.

### 7.3 Firebase Storage

Las fotografías se suben a rutas con el siguiente patrón:

```text
bautizo_padrinos/{uid}/perfil_{timestamp}_{nombreSeguro}
```

## 8. Integridad y concurrencia

La creación de reservas usa `runTransaction` de Firestore y valida dentro de la transacción el rol del ahijado, su cantidad de reservas y el estado actual del padrino. Esto evita que dos usuarios reserven simultáneamente el mismo padrino bajo condiciones normales de concurrencia.

Las acciones administrativas que cambian la disponibilidad y liberan reservas también usan transacciones. La limpieza de reservas vencidas se ejecuta desde el cliente al entrar o cambiar de vista; no es un proceso programado de servidor.

## 9. Requisitos de ejecución y despliegue

- Navegador moderno con soporte para módulos ES, `localStorage`/sesión de Firebase y APIs de archivos.
- Conexión a Internet.
- Dominio o servidor autorizado en Firebase Authentication.
- Reglas de seguridad de Firestore configuradas para proteger perfiles, contraseñas y operaciones administrativas.
- Reglas de Firebase Storage configuradas para restringir la carga y lectura de fotografías.
- Servicio web que sirva los archivos mediante HTTP/HTTPS. Para autenticación y módulos remotos se recomienda HTTPS.
- Configuración del proyecto Firebase correspondiente al entorno de ejecución.

No se incluye un proceso de compilación: la aplicación puede servirse como archivos estáticos.

## 10. Consideraciones de seguridad y mantenimiento

Estas observaciones forman parte del estado actual revisado y deben atenderse antes de un uso productivo:

- `js/firebase.js` contiene la configuración del proyecto Firebase en el código cliente. La configuración de Firebase no debe considerarse un secreto; la protección real depende de las reglas de Auth, Firestore y Storage.
- La contraseña global y `miPerfilPass` se comparan y almacenan desde el cliente. No deben tratarse como un mecanismo de seguridad fuerte. Se recomienda reemplazar este esquema por autorización de Firebase, Cloud Functions o un backend con contraseñas con hash.
- La autorización administrativa se basa en el campo `admin` leído por el cliente. Las reglas de Firestore deben impedir que un usuario no autorizado modifique ese campo o ejecute operaciones administrativas.
- La consulta de padrinos recupera todos los documentos con `rol == "padrino"`; la seguridad de los campos expuestos debe definirse en Firestore.
- La limpieza de expiraciones dependiente del cliente puede retrasarse si ningún usuario visita la aplicación. Para consistencia operativa se recomienda un proceso del lado servidor.
- La acción de guardado del registro contiene mensajes `console.log` y un `alert` temporal (`CLICK Guardar`) que deben eliminarse antes de producción.
- Existen dos pares de archivos HTML/CSS (`index.html`/`styles.css` y `aaindex.html`/`aastyles.css`). Ambos HTML cargan `styles.css`, por lo que conviene establecer una única entrada oficial y retirar o versionar la variante antigua.
- No se observan pruebas automatizadas, validación de tamaño/tipo de imagen en cliente ni documentación de reglas de Firebase dentro del repositorio.

## 11. Criterios de aceptación funcional

- Un usuario no autenticado puede iniciar sesión con Google.
- Un usuario nuevo no puede continuar sin completar los datos obligatorios.
- Un ahijado puede reservar un padrino disponible y la reserva se refleja en ambos perfiles.
- Un padrino reservado no aparece como reservable.
- Una reserva expirada puede liberar el padrino durante una limpieza.
- Un padrino puede completar su ficha, subir fotografía y consultar su perfil protegido.
- El límite de tres ediciones de padrino se respeta.
- Un administrador puede cambiar estados y los cambios relacionados con reservas se mantienen consistentes.
- La aplicación se visualiza correctamente en escritorio y móvil.
