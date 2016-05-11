'use strict';

import express     from 'express';
import bodyParser  from 'body-parser';
import http        from 'http';
import path        from 'path';
import socketio    from 'socket.io';
import redis       from 'redis';

// db, app, and server listening setup
const app = express();
const server = http.Server(app);
const io = socketio(server);
const redisClient = redis.createClient(6379, '127.0.0.1');
const gameMap = new Map();

redisClient.on('error', (e) => {
  console.log(e);
  process.exit(1);
});

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, '../../app')));
app.set('views', path.join(__dirname));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

/**
 * clears the game board
 *
 * positions are represented as followed:
 * =====
 * |123|
 * |456|
 * |789|
 * =====
 *
 * @param {function} no parameters sent back
 */
const clearGameMap = (callback) => {
  let gameMap = [];

  for (let i = 1; i < 10; i++) {
    gameMap.push(false);
  }

  redisClient.hmset('game', { 'gameMap': JSON.stringify(gameMap) }, (err, res) => {
    callback();
    return;
  });
};

/**
 * Evaluates the board based on the last move to determine if it won
 * @param  {integer} position corresponding location on board
 * @param  {string} player id
 * @param  {function} callback(won) boolean true if win, false otherwise
 */
const checkIfWin = (position, player, callback) => {
  redisClient.hgetall('game', (err, res) => {
    let won = false;
    const winningWays = [
      { possibleWinPositions: [1], spacesToCheck: [4, 8] },
      { possibleWinPositions: [1, 2, 3], spacesToCheck: [3, 6] },
      { possibleWinPositions: [1, 4, 7], spacesToCheck: [1, 2] },
      { possibleWinPositions: [2, 5, 8], spacesToCheck: [-1, 1] },
      { possibleWinPositions: [3], spacesToCheck: [2, 4] },
      { possibleWinPositions: [3, 6, 9], spacesToCheck: [-1, -2] },
      { possibleWinPositions: [4, 5, 6], spacesToCheck: [-3, 3] },
      { possibleWinPositions: [7], spacesToCheck: [-2, -4] },
      { possibleWinPositions: [5], spacesToCheck: [-4, 4] },
      { possibleWinPositions: [5], spacesToCheck: [-2, 2] },
      { possibleWinPositions: [7, 8, 9], spacesToCheck: [-3, -6] },
      { possibleWinPositions: [9], spacesToCheck: [-4, -8] }
    ];
    const gameMap = JSON.parse(res.gameMap);

    const checkSpace = (position, possibleWinPositions, spacesToCheck, player) => {
      let rightPosition = false;
      let spacesToCheckMatch = true;

      for (let i = 0; i < possibleWinPositions.length; i++) {
        if (possibleWinPositions[i] === position) {
          rightPosition = true;
        }
      }

      if (!rightPosition) {
        return false;
      }

      spacesToCheck.forEach((space) => {
        if (gameMap[position + space] !== player) {
          spacesToCheckMatch = false;
        }
      });

      return spacesToCheckMatch;
    };

    winningWays.forEach((combo) => {
      if (checkSpace(position, combo.possibleWinPositions, combo.spacesToCheck, player)) {
        won = true;
      }
    });

    callback(won);
    return;
  });
};

/**
 * Checks if all spaces on board have been filled
 * @param  {function} callback(bool) boolean true if filled, false otherwise
 */
const boardFilled = (gameMap, callback) => {
  for (let i = 1; i < 10; i++) {
    if (!gameMap[i]) {
      callback(false);
      return;
    }
  }
  callback(true);
  return;
}

// initializes board for the first time
clearGameMap(() => {
  console.log('*** Starting Tin Tac Toe ***');
});

// initializing the database with clean data
redisClient.hmset('game', 'XWins', 0, 'OWins', 0, 'ties', 0, 'O', false, 'X', false, 'spectators', JSON.stringify([]));

// on socket connection, assign the player to either X, O, or to spectators
// the order of the array corresponds to the spectator position (i.e index 0 indicates Spectator 1)
io.on('connection', (socket) => {
  redisClient.hgetall('game', (err, res) => {
    let playerX = res.X === 'false' ? false : res.X;
    let playerO = res.O === 'false' ? false : res.O;
    let spectators = JSON.parse(res.spectators);
    let gameMap = JSON.parse(res.gameMap);


    if (!playerX) { // player X has joined
      redisClient.hmset('game', 'X', socket.id, (err, res) => {

        if (io.sockets.connected[playerO]) {
          io.sockets.connected[playerO].emit('your turn');
        }

        socket.emit('you are', 'X');
      });

    } else if (!playerO) { // player O has joined
      redisClient.hmset('game', 'O', socket.id, (err, res) => {

        socket.emit('not your turn');
        socket.emit('you are', 'O');

        if (io.sockets.connected[playerX]) {
          io.sockets.connected[playerX].emit('your turn');
        }
      });
    } else { // spectator has joined
      spectators.push(socket.id);
      redisClient.hmset('game', 'spectators', JSON.stringify(spectators), (err, setResponse) => {
        let clientGameMap = [];
        gameMap.forEach((space) => {
          if (!space) {
            clientGameMap.push(space);
          } else if (space === res.X) {
            clientGameMap.push('X');
          } else if (space === res.O) {
            clientGameMap.push('O');
          } else {
            clientGameMap.push(false);
          }
        })

        // give the spectator the game so far
        socket.emit('gameMap', clientGameMap);
        socket.emit('you are', `Spectator ${spectators.length}`);
      });
    }
  });

  // on disconnect, if it is X or O, check if there are spectators and make them the new X or O
  // then, tell every spectator that they have moved up a position
  // finally, start the game over
  socket.on('disconnect', () => {
    redisClient.hgetall('game', (err, res) => {

      let spectators = JSON.parse(res.spectators);
      let gameMap = JSON.parse(res.gameMap);
      let player, playerID, otherPlayer, otherPlayerID;

      if (socket.id === res.X) {
        player = 'X';
        otherPlayer = 'O';
        playerID = res.X;
        otherPlayerID = res.O;
      } else if (socket.id === res.O) {
        player = 'O';
        playerID = res.O;
        otherPlayer = 'X';
        otherPlayerID = res.X;
      } else {
        player = spectators.indexOf(socket.id);
      }

      if (player === 'X' || player === 'O') {
        clearGameMap(() => {
          if (playerID && io.sockets.connected[playerID]) {
            io.sockets.connected[playerID].emit('quitter');
          }

          if (spectators.length) {
            let nextPlayer = spectators.splice(0, 1)[0];

            if (io.sockets.connected[nextPlayer]) {
              io.sockets.connected[nextPlayer].emit('you are', player);
              io.sockets.connected[nextPlayer].emit('your turn', player);
            }

            if (io.sockets.connected[otherPlayerID]) {
              io.sockets.connected[otherPlayerID].emit('new game');
            }

            if (spectators.length) {
              for (let i = 0; i < spectators.length; i++) {
                if (io.sockets.connected[spectators[i]]) {
                  io.sockets.connected[spectators[i]].emit('you are', `Spectator ${i + 1}`);
                }
              }
            }

            redisClient.hmset('game', 'spectators', JSON.stringify(spectators), player, nextPlayer, 'OWins', 0, 'XWins', 0);
          } else {
            redisClient.hmset('game', 'spectators', JSON.stringify([]), player, false, 'OWins', 0, 'XWins', 0);
          }
        });
      } else {
        let i = spectators.indexOf(socket.id);
        spectators.splice(i, 1);

        // if there are spectators, bump all spectators after the quitting one up in line
        if (spectators.length) {
          for (i; i < spectators.length; i++) {
            if (io.sockets.connected[spectators[i]]) {
              io.sockets.connected[spectators[i]].emit('you are', `Spectator ${i + 1}`);
            }
          }
        }
        redisClient.hmset('game', 'spectators', JSON.stringify(spectators));
      }
    });
  });

  // a client has requested to play again
  socket.on('play again', () => {
    clearGameMap(() => io.emit('new game', 'X'));
  });

  // when a client plays a move
  //  - Update gameMap
  //  - Notify all players of the move
  //  - Check if winning move
  //  - Check if tying move
  //  - Notify players of whose turn it is
  socket.on('move', (position) => {
    redisClient.hgetall('game', (err, res) => {
      let playerX    = res.X;
      let playerO    = res.O;
      let XWins      = parseInt(res.XWins);
      let OWins      = parseInt(res.OWins);
      let spectators = JSON.parse(res.spectators);
      let gameMap    = JSON.parse(res.gameMap);
      let player     = socket.id === playerX ? 'X' : 'O';
      let playerWins = socket.id === playerX ? XWins : OWins;

      if (gameMap[position]) {
        return;
      } else {
        gameMap[position] = socket.id;
      }

      io.emit('opponent moved', { position, player: player });

      checkIfWin(position, socket.id, (won) => {
        if (won) {
          if (player === 'X') {
            XWins++;
          } else {
            OWins++;
          }
          clearGameMap(() => io.emit('somebody won', player, XWins, OWins, res.ties));
          if (player === 'X') redisClient.hmset('game', { 'XWins': playerWins + 1});

          if (player === 'O') redisClient.hmset('game', { 'OWins': playerWins + 1});
        } else {
          boardFilled(gameMap, (filled) => {
            if (filled) {
              io.emit('tie', parseInt(res.ties) + 1);
              redisClient.hmset('game', { 'ties': parseInt(res.ties + 1) });
            } else {
              redisClient.hmset('game', { 'gameMap': JSON.stringify(gameMap) }, (err, res) => {
                socket.emit('not your turn');

                if (player === 'X' && io.sockets.connected[playerO]) {
                  io.sockets.connected[playerO].emit('your turn');
                } else if (io.sockets.connected[playerX]) {
                  io.sockets.connected[playerX].emit('your turn');
                }
              });
            }
          });
        }
      });
    });
  });
});

// Whole app is served by this one view
app.get('/', (req, res) => {
  res.render('views/index.ejs');
});

server.listen(8080);

module.exports = app;