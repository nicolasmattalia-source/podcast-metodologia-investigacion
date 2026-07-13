# Podcast Player

Esta carpeta ahora contiene una página estática para reproducir `Grupo 8.mp3`, con:

- `play/pause`
- retroceso de 15 segundos
- adelanto de 30 segundos
- barra de progreso
- comentarios con login de Google

## Archivos

- `index.html`: estructura de la página
- `styles.css`: diseño responsive
- `app.js`: reproductor + comentarios
- `firebase-config.js`: configuración de Firebase reutilizando la app `ecotermo-medidor`

## Cómo abrirlo

Usá un servidor local simple desde esta carpeta:

```powershell
python -m http.server 8080
```

Después abrí:

```text
http://localhost:8080
```

## Estado de Firebase

La página ya quedó conectada al proyecto Firebase `ecotermo-medidor`, que también aparece como proyecto por defecto en [../.firebaserc](C:/Users/nmattalia/Desktop/01_NMattalia/APS/.firebaserc:1).

Para que el módulo de comentarios funcione de punta a punta en este proyecto, verificá estas dos cosas:

1. En Firebase Authentication, que el proveedor `Google` siga habilitado.
2. En Firestore Database, que existan reglas que permitan leer y crear comentarios en la ruta `episodes/podcast-principal/comments`.

## Reglas sugeridas para Firestore

Estas reglas permiten leer comentarios y crear nuevos solo a usuarios autenticados:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /episodes/{episodeId}/comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.text is string
        && request.resource.data.text.size() > 0
        && request.resource.data.text.size() <= 500;
      allow update, delete: if false;
    }
  }
}
```

## Nota

Si el login falla en local, revisá que `localhost` esté autorizado dentro de Firebase Authentication.
