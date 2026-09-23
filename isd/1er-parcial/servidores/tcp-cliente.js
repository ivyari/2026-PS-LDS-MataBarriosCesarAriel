const net = require('net');
const HOST= process.env.HOST || '127.0.0.1';
const PUERTO= process.env.PORT || 5000;

const socket = net.connect (PUERTO, HOST, ()=>{
    console.log(`[TCP] Conectado al HOST ${HOST}:${PUERTO}`);
    [`Uno`,`Dos`,`Habia Una vez`, `un`, `Patito`, `Que decia miau miau`].forEach((Mensaje)=>{
        socket.write(`${Mensaje}\n`);
    });
    socket.end();
});

socket.on('data',(datos)=>{
    process.stdout.write(`[TCP]${datos.toString()}`);
});
socket.on('close',()=>{
    console.log(`[TCP] Conexion Cerrada con El Servidor: ${HOST}:${PUERTO}`);
});
socket.on('error',(err)=>{
    console.log(`[TCP] No se pudo conectar a : ${HOST}:${PUERTO}`, err.message);
});