# Configuración del administrador

## 1. Crear el usuario administrador

1. Inicia sesión una vez en la aplicación con la cuenta que será administradora.
2. Abre Firebase Console y selecciona el proyecto configurado en `js/firebase.js`.
3. En **Firestore Database > Datos**, abre la colección `user_bautizo`.
4. Localiza el documento cuyo ID sea el UID de la cuenta administradora. El UID se puede consultar en **Authentication > Users**.
5. Crea o modifica el campo booleano:

```text
admin: true
```

6. Cierra y vuelve a iniciar sesión en la aplicación.

El botón de administración aparecerá únicamente para ese usuario.

## 2. Publicar las reglas

Copia el contenido de `firestore.rules` en **Firestore Database > Reglas** y publícalo. También puede desplegarse con Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

No habilites `admin: true` desde la aplicación. Las reglas impiden que un usuario normal se conceda privilegios administrativos.

## 3. Opciones del administrador

Desde el botón de administración se puede:

- Consultar y buscar padrinos.
- Consultar y buscar ahijados.
- Marcar participantes como disponibles o no disponibles.
- Abrir **Lista oficial** para ver cada ahijado, sus padrinos reservados y los padrinos disponibles posibles.
- Descargar `lista-oficial-bautizo.pdf`.
- Convertir una reserva vigente en aceptación definitiva mediante el botón **Aceptar**.

## 4. Importante sobre “aceptados”

La aplicación diferencia reservas temporales de aceptaciones definitivas. La lista y el PDF separan:

- **Padrinos aceptados:** relación confirmada por el administrador.
- **Reservas pendientes:** relación temporal vigente, con hora de vencimiento.
- **Padrinos posibles:** padrinos que actualmente aparecen como disponibles.

La aceptación se guarda en ambos perfiles usando campos persistentes equivalentes a:

```text
ahijado.padrinosAceptados: [{ padrinoId, padrinoNombreCompleto, aceptadoAt }]
padrino.aceptacionActiva: { ahijadoId, ahijadoNombreCompleto, aceptadoAt }
```

La confirmación debe ejecutarse en una transacción y ser exclusiva para administradores.

## 5. Recomendaciones de seguridad

- Configura correctamente las reglas de Firestore antes de compartir la aplicación.
- No otorgues `admin: true` a cuentas compartidas.
- Verifica que las reglas de Storage protejan las fotografías.
- No uses la contraseña global como mecanismo de seguridad administrativa.
- Prueba el flujo con una cuenta normal y una cuenta administradora antes del evento.
