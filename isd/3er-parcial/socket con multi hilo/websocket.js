const path = require('path');
const http = require('http');
const fs = require('fs');
const readline = require('readline');
const {WebSocketServer} = require('ws');

const PORT = 7000;

const server = http.createServer((req, res) => {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
        if (err) {
            res.end('No se pudo cargar el archivo index.html');
        }
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(data);
        
    });
});
const wss = new WebSocketServer({server: servidorHttp});
const clientes = new set();

wss.on('connection', (socket) => {
    clientes.add(ws);
    console.log(`Cliente conectado. Total de clientes: ${clientes.size}`);
});

    socket.on('close', () => {
        clientes.delete(socket);
        console.log(`Cliente desconectado. Total de clientes: ${clientes.size}`);
    });

    //vamos a crear una multidifusion bajo el mismo nombre
    function broadcast(message) {
        console.log(`[broadcast] Enviado desde :${clientes.size} a cliestes: ${mensaje}`);
        const payload = JSON.stringify({tipo: 'cupo_lleno', mensaje, fecha: new Date().toISOString()});
        for (const cliente of clientes) {
            if(socket.readyState === socket.OPEN) {
                socket.send(payload);
            }
        }
    }

    servidorHttp.listen(PUERTO, () => {
        console.log(`Servidor HTTP escuchando en el puerto ${PUERTO}`);
    });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', (linea) => {
        const [comando, ...resto] = linea.trim().split(' ');
        if (comando === 'lleno') {
            const mensaje = resto.join(' ');
            broadcast(mensaje);
        }
    });