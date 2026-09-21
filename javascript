const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: "*" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servir arquivos estáticos se hospedado junto
app.use(express.static(path.join(__dirname, 'public')));

// Estado da sala em tempo real
const usuariosConectados = new Map(); // socket.id -> { id, nome, code, indicadosCount }
const cadeiras = Array(5).fill(null);  // Array de 5 cadeiras

io.on('connection', (socket) => {
  console.log(`[CONEXÃO REAL] Novo usuário conectado ID: ${socket.id}`);

  // 1. REGISTRO E CONTABILIZAÇÃO DE INDICAÇÃO REAL
  socket.on('registrar_usuario', ({ nome, referenciadorCode }) => {
    const userCode = nome.replace(/\s+/g, '').toUpperCase();

    const usuario = {
      id: socket.id,
      nome: nome,
      code: userCode,
      indicadosCount: 0
    };

    usuariosConectados.set(socket.id, usuario);

    // Valida se o usuário veio por indicação de alguém online
    if (referenciadorCode) {
      for (let [id, user] of usuariosConectados.entries()) {
        if (user.code === referenciadorCode && id !== socket.id) {
          user.indicadosCount += 1;
          io.to(id).emit('indicacao_computada', {
            total: user.indicadosCount,
            novoInscrito: nome
          });
          break;
        }
      }
    }

    // Emite o total REAL de pessoas online na sala
    io.emit('atualizar_viewers_reais', { total: usuariosConectados.size });
    socket.emit('cadeiras_atualizadas', cadeiras);
  });

  // 2. SISTEMA DE CADEIRAS REAL EM TEMPO REAL
  socket.on('ocupar_cadeira', ({ index }) => {
    const user = usuariosConectados.get(socket.id);
    if (!user) return;

    if (index >= 0 && index < 5 && cadeiras[index] === null) {
      cadeiras[index] = { socketId: socket.id, nome: user.nome };
      io.emit('cadeiras_atualizadas', cadeiras);
    }
  });

  socket.on('desocupar_cadeira', ({ index }) => {
    if (cadeiras[index] && cadeiras[index].socketId === socket.id) {
      cadeiras[index] = null;
      io.emit('cadeiras_atualizadas', cadeiras);
    }
  });

  // 3. SIGNAIS DE VÍDEO/ÁUDIO WEBRTC
  socket.on('webrtc_offer', (data) => {
    socket.broadcast.emit('webrtc_offer', { sender: socket.id, offer: data.offer });
  });

  socket.on('webrtc_answer', (data) => {
    io.to(data.target).emit('webrtc_answer', { sender: socket.id, answer: data.answer });
  });

  socket.on('webrtc_ice_candidate', (data) => {
    io.to(data.target).emit('webrtc_ice_candidate', { sender: socket.id, candidate: data.candidate });
  });

  // 4. DESCONEXÃO E LIMPEZA DE DADOS
  socket.on('disconnect', () => {
    console.log(`[DESCONEXÃO REAL] Usuário saiu ID: ${socket.id}`);

    // Libera a cadeira do usuário se ele estiver em uma
    for (let i = 0; i < cadeiras.length; i++) {
      if (cadeiras[i] && cadeiras[i].socketId === socket.id) {
        cadeiras[i] = null;
      }
    }

    usuariosConectados.delete(socket.id);

    // Atualiza contadores para todos que continuam na live
    io.emit('atualizar_viewers_reais', { total: usuariosConectados.size });
    io.emit('cadeiras_atualizadas', cadeiras);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor Trovão Azul Real rodando na porta ${PORT}`);
});
