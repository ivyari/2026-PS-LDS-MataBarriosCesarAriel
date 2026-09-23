const net = require('net');

const PUERTO = process.env.PUERTO || 5000;

const servidor = net.createServer((socket) => {
    const cliente = `${socket.remoteAddress}:${socket.remotePort}`;
    //Aqui el evento de conexion solo se dispara e el momento en que el cliente y el servidor establecen un three-way a traves del handshake(el apreton de manos es el momento en que el cliente realiza una peticion, envia IP,Puerto,Datagrama y salida al servidor, el servidor le responde creando la sesion )
    console.log(`[TCP] Conexion establecida con el Cliente: ${cliente}`);

    socket.on('data', (datos) => {
        const crudo = datos.toString();
        //TCP es un flujo de bytes entonces nsotros en el socket l vamos a transformar en cadenas
        console.log(`[TCP] Datos Crudos asi crudisimos ${datos.length} bytes: ${JSON.stringify(crudo)}`);

        const lineas = crudo.split('\n').map((l) => l.trim()).filter(Boolean) ;

        lineas.forEach((linea) => {
            console.log(`[TCP] Mensaje: "${linea}"`);
            socket.write(`Eco TCP: ${linea}\n`);
        });

    });

    socket.on('close', () => {
        console.log(`[TCP] Conexion cerrada con el Cliente: ${cliente}`);
    });

    socket.on('error', (error) => {
        console.error(`[TCP] Error con: ${cliente} `,error.message);
    });
});
    servidor.listen(PUERTO, () => {
        console.log(`[TCP] Servidor inicializado en: ${PUERTO}`);
    });
