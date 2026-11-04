const net = require('net');

const PORT = 5000;

const nombre = process.argv[2] || 'Cliente';

const socket = net.connect(PORT, 'localhost', () => {
    console.log(`${nombre} conectado al servidor`);
    socket.write(`Hola desde ${nombre}\n`);
});
socket.on('data', (data) => {
    console.log(`${nombre} recibió: ${data.toString().trim()}`);
});
socket.on('close', () => {
    console.log(`${nombre} desconectado del servidor`);

});