const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let users = {}; 
let rooms = {}; 
const ADMIN_PASS = "123456";

io.on('connection', (socket) => {
    socket.on('register_nick', (nick, callback) => {
        const exists = Object.values(users).some(u => u.nick.toLowerCase() === nick.toLowerCase());
        if (exists) {
            return callback({ success: false, msg: "Apelido já existe!" });
        }
        users[socket.id] = { nick, coins: 10000, blocked: false };
        callback({ success: true, user: users[socket.id] });
    });

    socket.on('join_room', ({ roomId, maxPlayers, seatIndex }, callback) => {
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                maxPlayers: maxPlayers || 4,
                seats: new Array(maxPlayers || 4).fill(null),
                ready: {},
                state: 'waiting',
                turnIndex: 0,
                scores: { teamA: 0, teamB: 0 },
                bet: 1000
            };
        }

        const room = rooms[roomId];
        if (room.seats[seatIndex]) {
            return callback({ success: false, msg: "Cadeira já ocupada!" });
        }

        room.seats[seatIndex] = { socketId: socket.id, nick: users[socket.id].nick };
        socket.join(roomId);

        io.to(roomId).emit('room_update', room);
        callback({ success: true, room });
    });

    socket.on('player_ready', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        room.ready[socket.id] = true;
        const totalReady = Object.keys(room.ready).length;

        if (totalReady === room.maxPlayers) {
            room.state = 'countdown';
            io.to(roomId).emit('start_countdown', 10);

            setTimeout(() => {
                room.state = 'playing';
                room.turnIndex = Math.floor(Math.random() * room.maxPlayers);
                io.to(roomId).emit('game_started', room);
                startTurnTimer(roomId);
            }, 10000);
        }
    });

    socket.on('send_reaction', ({ roomId, type, value }) => {
        const user = users[socket.id];
        if (user && user.blocked) return;
        io.to(roomId).emit('new_reaction', { sender: user ? user.nick : 'Jogador', type, value });
    });

    socket.on('admin_login', (pass, callback) => {
        if (pass === ADMIN_PASS) {
            callback({ success: true, users });
        } else {
            callback({ success: false, msg: "Senha Incorreta!" });
        }
    });

    socket.on('admin_update_user', ({ nick, coins, blocked }) => {
        for (let id in users) {
            if (users[id].nick === nick) {
                users[id].coins = coins;
                users[id].blocked = blocked;
            }
        }
        io.emit('users_updated', users);
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
    });
});

function startTurnTimer(roomId) {
    let timer = 20;
    const interval = setInterval(() => {
        const room = rooms[roomId];
        if (!room || room.state !== 'playing') return clearInterval(interval);

        io.to(roomId).emit('timer_tick', { turnIndex: room.turnIndex, timer });
        timer--;

        if (timer < 0) {
            room.turnIndex = (room.turnIndex + 1) % room.maxPlayers;
            timer = 20;
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor a rodar na porta ${PORT}`));
