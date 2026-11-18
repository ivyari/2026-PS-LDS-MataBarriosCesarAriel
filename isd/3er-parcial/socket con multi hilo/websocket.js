const path = require('path');
const http = require('http');
const fs = require('fs');
const readline = require('readline');
const {WebSocket} = require('ws');

const port = 7000;

const servidorHttp = http.createServer((req, res) => {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
        if (err) {
            return.res.end(No se puede cargar el archivo index.html);
        }
        res.writeHead(200, {'Content-Type': 'text/html;charset=UTF-8'});
        res.end(data); 
    });
});

const wss = new WebSocket.Server({ server: servidorHttp });
const clientes = new Set();

wss.on('connection', (ws) => {
    clientes.add(ws);
    console.log(Cliente conectado . Total de clientes: (${clientes.size});
    ws.on('close', () => {
        clientes.delete(ws);
        console.log(Cliente desconectado. Total de clientes: (${clientes.size});
    });
});    
function broadcast(message) {
    console.log([broadcast] enviado desde : ${clientes.size} a clientes: ${message});
    const payload = JSON.stringify({ tipo:'cupo_lleno', mensaje, fecha: new Date().toISOString() });
    for (const socket of clientes) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(payload);
        }
    }
}
servidorHttp.listen(port, () => {
    console.log(Servidor  escuchando al puerto${port});
});
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.on('line', (linea) => {
    const[comando, ...resto] = linea.trim().split(' ');
    if (comando === 'lleno') {  
        const mensaje = resto.join(' ');
    }
});