# Nuevo Pacto Apopa: sitio web

Sitio de la Iglesia Cristiana Nuevo Pacto Apopa, publicado gratis con **GitHub Pages**. Tiene un panel de administración para cambiar fotos, eventos, transmisión, redes, contacto, horarios y el mensaje reciente sin tocar código.

> Este archivo es público en GitHub. **No escribas aquí la contraseña del panel.**

## 1. Subir el sitio (o reemplazar la versión anterior)

1. En el repositorio de GitHub pulsa **Add file → Upload files**.
2. Arrastra **todo lo que hay dentro de esta carpeta**: `index.html`, `README.md`, `.nojekyll` y las carpetas `admin`, `css`, `data`, `images` y `js`.
   Si ya habías subido una versión antes, GitHub reemplaza los archivos que tengan el mismo nombre.
3. Pulsa **Commit changes**.
4. Si es la primera vez: **Settings → Pages → Deploy from a branch → main → / (root) → Save**.

## 2. Conectar el panel con GitHub (una sola vez)

Esto lo hace quien administra la cuenta de GitHub.

1. Abre el sitio, baja hasta el final y pulsa **Admin**.
2. Escribe la contraseña de administración y pulsa **Entrar**.
3. Como es la primera vez, el panel pide la **llave de GitHub**:
   1. Abre <https://github.com/settings/personal-access-tokens/new>.
   2. **Expiration:** la fecha más lejana que permita.
   3. **Repository access:** **Only select repositories** → el repositorio del sitio.
   4. **Permissions → Contents → Read and write**.
   5. **Generate token** y cópiala.
4. Pega la llave, repite la contraseña y pulsa **Conectar y entrar**.

Listo. La llave queda guardada **cifrada con la contraseña** en `data/acceso.json`. Sin la contraseña nadie puede usarla.

## 3. Uso diario (equipo de la iglesia)

1. Sitio → abajo del todo → **Admin**.
2. Contraseña → **Entrar**. Con "Recordarme en este dispositivo" marcado, la próxima vez entra directo.
3. Cambia lo que necesites:
   - **Fotos de portada:** pasan detrás de "Encuentra vida, fe y comunidad en Cristo".
   - **Somos iglesia:** fotos del carrusel "Somos iglesia".
   - **Eventos**, **Transmisión y redes**, **Contacto**, **Horarios**, **Mensaje reciente**.
4. Pulsa **Guardar y publicar**. El sitio se actualiza en 1 a 2 minutos.

Las fotos se suben directo a la carpeta `images/` de GitHub y se reducen solas para que la página cargue rápido.

## Cuando la llave de GitHub venza

El panel avisará que la llave venció. Quien administra la cuenta crea una llave nueva (paso 2.3) y en la pantalla de entrada pulsa **Conectar o renovar la llave de GitHub**. La contraseña puede seguir siendo la misma.

## Cambiar la contraseña

En la pantalla de entrada pulsa **Conectar o renovar la llave de GitHub**, pega una llave y escribe la contraseña nueva.
