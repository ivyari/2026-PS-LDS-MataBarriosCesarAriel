//un hilo sirve para poder progamar o automatizar un proceso, multiples hilos sirven para programar procesos en paralelo o en serie dependiendo de la necesidad
//los sockets utilizan i¿hilos para poder comunicar y realizar procesos entre el cliente y servidor

const net = require('net'); 
const PORT = 5000;

const clientes = new Map();

let siguienteid = 1;

//Decidir la creacion del servidor
const servidor = net.createServer((socket) => {
    const id = siguienteid++;
    clientes.set(id, socket);
    console.log(`Cliente conectado con ID #${id} conectado a (${clientes.size}) conectados en total)`);
    socket.write(`Bienvenido al servidor, tu ID es #${id}\n`);

    socket.on('data', (data) => {
        const mensaje = data.toString().trim();
        console.log(`Cliente ${id} dice: ${mensaje}`);
        socket.write(`Eco del servidor: ${mensaje}\n`);
    });
    socket.on('close', () => {
        clientes.delete(id);
        console.log(`Cliente ${id} desconectado. (${clientes.size} conectados en total)`);
    });

});

servidor.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});

