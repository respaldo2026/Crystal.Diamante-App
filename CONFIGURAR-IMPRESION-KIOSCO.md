# Configurar impresión silenciosa para Caja

Este flujo está pensado para usar la Epson TM-T20II conectada por USB en Windows, sin QZ Tray y sin mostrar el diálogo de impresión.

## 1. Poner la Epson como impresora predeterminada

En Windows:

1. Abrir Configuración.
2. Ir a Bluetooth y dispositivos > Impresoras y escáneres.
3. Desactivar Permitir que Windows administre mi impresora predeterminada.
4. Seleccionar Epson TM-T20II.
5. Pulsar Establecer como predeterminada.

## 2. Configurar apertura del cajón desde el driver Epson

La apertura del cajón no la controlará la web. Debe salir desde el driver al imprimir el ticket.

Buscar en las preferencias de la impresora Epson opciones como:

- Cash Drawer
- Drawer Kick
- Peripheral Unit
- Open Drawer Before Print
- Open Drawer After Print

La opción exacta depende del driver instalado por Epson.

## 3. Permitir ventanas emergentes para la aplicación

La app abre una ventana de impresión del navegador. Aunque el diálogo quede oculto por modo kiosco, el popup debe poder abrirse.

Permitir popups para:

- https://app.crystaldiamante.com

## 4. Abrir Caja con impresión silenciosa

Usar este script:

- abrir-caja-kiosco.ps1
- abrir-caja-kiosco.bat

El script abre Edge o Chrome con:

- --kiosk-printing
- --app=https://app.crystaldiamante.com/caja

Eso hace que el navegador imprima usando la impresora predeterminada sin mostrar el diálogo.

Si el empleado va a abrir Caja con doble clic, usa preferiblemente:

- abrir-caja-kiosco.bat

## 4.1 Crear acceso directo para empleados

Usar este script en la máquina de caja:

- crear-acceso-directo-caja.ps1
- instalar-caja-kiosco.bat

Ese script crea dos accesos directos:

- uno en el escritorio
- otro en el inicio automático de Windows

Así el empleado puede abrir Caja con doble clic o dejar que se abra sola al iniciar sesión.

Si quieres hacerlo con el método más simple para el personal, usa:

- instalar-caja-kiosco.bat

Ese archivo ya no depende de otros scripts al lado. Puede ejecutarse solo y deja todo listo con doble clic.

## 5. Prueba recomendada

1. Abrir la caja con el script.
2. Registrar un pago en efectivo.
3. Verificar que:
   - salga el ticket por la Epson
   - no aparezca el diálogo de impresión
   - el cajón se abra al imprimir

## 6. Dejarlo automático al iniciar Windows

Si la estación será solo de caja:

1. Crear un acceso directo al script abrir-caja-kiosco.ps1.
2. O ejecutar crear-acceso-directo-caja.ps1 para que lo haga automáticamente.
3. O usar instalar-caja-kiosco.bat, que crea además un lanzador estable en LocalAppData.

Ruta típica:

- shell:startup

## 7. Si no imprime silenciosamente

Revisar:

1. Que la Epson siga siendo la impresora predeterminada.
2. Que el navegador realmente se abrió con --kiosk-printing.
3. Que no haya otro navegador tomando la sesión sin esos flags.
4. Que el driver Epson tenga configurado el cajón en el perfil de impresión.